// modbus/transport/controller/session/PortSession.ts

import { Mutex } from 'async-mutex';
import { Logger, type ILogObj } from 'tslog';
import { createTsLogger } from '../../../utils/logger.js';
import type ModbusClient from '../../../core/client.js';
import PollingManager from '../../../polling/manager.js';
import { PortConnectionTracker } from '../../trackers/port-tracker.js';
import {
  IPollingManagerConfig,
  IPortQueue,
  IPortQueueEnqueueOptions,
  IPortQueueOptions,
  IPortQueueStats,
  IPortSession,
  IPortSessionInfo,
  ITransport,
  TTransportType,
  TRSMode,
} from '../../../types/public.js';
import {
  ModbusBusyError,
  ModbusQueueOverflowError,
  ModbusReentrancyError,
  ModbusNotConnectedError,
  ModbusScanActiveError,
  ModbusTimeoutError,
} from '../../../core/errors.js';

/** Hard default limit of pending jobs in a PortQueue (backpressure). */
export const PORT_QUEUE_DEFAULT_MAX_LENGTH = 500;

/**
 * Represents a session for a specific transport (port) in the Modbus controller.
 * Manages the transport, queue, polling manager, and connected clients.
 */
interface IPortQueueJob<T> {
  id: number;
  seq: number;
  priority: number;
  immediate: boolean;
  timeoutMs?: number;
  fn: () => Promise<T> | T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  /** True once the caller-facing promise has been settled. */
  settled: boolean;
}

/** A caller that waits for a free slot when the pending list is full. */
interface IPortQueueWaiter {
  resolve: () => void;
  reject: (error: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * PortQueue is the single serialization point for every wire-level operation of one
 * physical port. All client requests, polling exchanges and immediate commands must
 * pass through `enqueue()` so that exactly one exchange (flush -> write -> read) is in
 * flight at a time.
 *
 * Guarantees:
 * - one cooperative drain loop (single `Mutex` + `isProcessing` flag), so no two
 *   competing drain cycles can exist;
 * - stable ordering: `immediate` jobs go to the head of the pending list (still after
 *   the currently running job); remaining jobs are sorted by ascending `priority`
 *   (lower number = earlier) and keep FIFO order among equal priorities;
 * - `maxLength` backpressure: once the pending list is full, new enqueues wait for a free
 *   slot (`overflowPolicy: 'wait'`, default) or fail fast with `ModbusQueueOverflowError`
 *   (`overflowPolicy: 'reject'`). `overflowWaitMs` bounds that wait;
 * - `enablePause()` / `disablePause()` freeze job start without dropping queued work;
 * - per-job timeout (`timeoutMs`, default from `jobTimeoutMs`) rejects a wedged job so
 *   it cannot block the port forever. The job function itself cannot be cancelled and
 *   may still be running in the background afterwards - that is why the timeout should
 *   normally be set above the transport read timeout;
 * - synchronous reentrancy (`enqueue()` called from the synchronous part of a running
 *   job) throws `ModbusReentrancyError` instead of deadlocking. Asynchronous reentrancy
 *   (after an `await` inside the job) is NOT detected automatically and must be avoided
 *   by design (see ARCHITECTURE-REFACTOR.md, 5.1, option A) or bounded by the job timeout.
 */
export class PortQueue implements IPortQueue {
  private readonly _mutex = new Mutex();
  private readonly _pending: IPortQueueJob<unknown>[] = [];
  private readonly _maxLength: number;
  private readonly _overflowPolicy: 'wait' | 'reject';
  private readonly _overflowWaitMs: number;
  private readonly _waiters: IPortQueueWaiter[] = [];
  private readonly _defaultJobTimeoutMs?: number;

  private readonly logger: Logger<ILogObj>;

  private _processing = false;
  private _paused = false;
  private _scanPaused = false;
  private _seq = 0;
  private _jobSeq = 0;
  /** Id of the job whose synchronous phase is currently executing (reentrancy guard). */
  private _syncJobId: number | null = null;
  /** Id of the job currently occupying the port (null when idle). */
  private _activeJob: number | null = null;
  /** Reference to the running job, so `abort()` can settle its caller without waiting. */
  private _runningJob: IPortQueueJob<unknown> | null = null;
  /** Set by `abort()`: the queue is dead and refuses every new job. */
  private _abortError: { error: unknown } | null = null;

  constructor(options: IPortQueueOptions = {}) {
    this._maxLength = options.maxLength ?? PORT_QUEUE_DEFAULT_MAX_LENGTH;
    this._overflowPolicy = options.overflowPolicy ?? 'wait';
    this._overflowWaitMs = options.overflowWaitMs ?? 0;
    this._defaultJobTimeoutMs = options.jobTimeoutMs;

    const level = options.logLevel ?? 'info';
    this.logger = createTsLogger({ name: 'PortQueue', level });
  }

  /** Returns the maximum number of pending jobs allowed in the queue.
   * @returns {number} The maximum length of the queue.
   */
  public get maxLength(): number {
    return this._maxLength;
  }

  /**
   * Adds a job to the port queue.
   *
   * @throws ModbusReentrancyError synchronously when called from the synchronous part of a running job.
   * @returns a promise that settles with the job result (or its error / timeout).
   */
  public enqueue<T>(fn: () => Promise<T> | T, opts: IPortQueueEnqueueOptions = {}): Promise<T> {
    if (this._syncJobId !== null) {
      throw new ModbusReentrancyError();
    }

    if (this._abortError) {
      return Promise.reject(this._abortError.error);
    }

    if (this._scanPaused) {
      this.logger.warn('[PortQueue] rejected: scan in progress');
      return Promise.reject(new ModbusScanActiveError());
    }

    if (this._pending.length >= this._maxLength) {
      if (this._overflowPolicy === 'reject') {
        this.logger.warn(
          { queueLength: this._pending.length, maxLength: this._maxLength },
          '[PortQueue] overflow'
        );
        return Promise.reject(new ModbusQueueOverflowError(this._maxLength));
      }
      this.logger.debug(
        {
          queueLength: this._pending.length,
          maxLength: this._maxLength,
          waiting: this._waiters.length,
        },
        '[PortQueue] full: waiting for a free slot'
      );
      return this._enqueueWhenSlotFrees<T>(fn, opts);
    }

    return this._enqueueNow<T>(fn, opts);
  }

  /** Waits for a free slot in the pending list and enqueues the job once a slot is available.
   * If the queue is full, the caller will wait for a free slot or until the overflow wait time expires.
   * @param fn - The job function to enqueue.
   * @param opts - The options for enqueueing the job.
   * @returns {Promise<T>} A promise that settles with the job result (or its error / timeout).
   */
  private _enqueueWhenSlotFrees<T>(
    fn: () => Promise<T> | T,
    opts: IPortQueueEnqueueOptions
  ): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      const waiter: IPortQueueWaiter = {
        resolve: () => {
          if (this._pending.length >= this._maxLength) {
            resolve(this._enqueueWhenSlotFrees<T>(fn, opts));
            return;
          }
          resolve(this._enqueueNow<T>(fn, opts));
        },
        reject,
        timer: undefined,
      };

      if (this._overflowWaitMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this._waiters.indexOf(waiter);
          if (index >= 0) this._waiters.splice(index, 1);
          this.logger.warn(
            { maxLength: this._maxLength, waitMs: this._overflowWaitMs },
            '[PortQueue] overflow: no free slot in time'
          );
          reject(new ModbusQueueOverflowError(this._maxLength));
        }, this._overflowWaitMs);
      }

      this._waiters.push(waiter);
    });
    this._guardRejection(promise);
    return promise;
  }

  /**
   * A job can be rejected from the outside (abort on teardown, dropped on disconnect) while
   * the caller no longer waits for it — for example during a test or a fire-and-forget call.
   * Attaching a no-op handler keeps that rejection from becoming an unhandled one (which is
   * fatal in modern Node), while callers that do await the promise still receive the error.
   */
  private _guardRejection(promise: Promise<unknown>): void {
    void promise.catch(() => undefined);
  }

  /**
   * Stops the queue for good: queued jobs, callers waiting for a slot and the caller of the
   * running job are rejected at once, and every later `enqueue()` fails with the same error.
   *
   * The job function itself cannot be cancelled, so it may still finish in the background —
   * nobody waits for it, which is what makes a teardown immediate.
   */
  public abort(error: unknown): void {
    this._abortError = { error };
    this.cancelWaiters(error);
    const dropped = this._pending.length;
    this._rejectPending(error);

    const running = this._runningJob;
    if (running && !running.settled) {
      running.settled = true;
      running.reject(error);
    }

    this.logger.warn({ dropped, running: running ? running.id : null }, '[PortQueue] aborted');
  }

  /**
   * Drops everything that has not gone on the wire yet (queued jobs and slot waiters).
   * Unlike `abort()`, the queue stays usable, so it can be reused after a reconnect.
   *
   * @returns number of dropped jobs.
   */
  public dropPending(error: unknown): number {
    this.cancelWaiters(error);
    const dropped = this._pending.length;
    this._rejectPending(error);
    if (dropped > 0) this.logger.warn({ dropped }, '[PortQueue] pending jobs dropped');
    return dropped;
  }

  /**
   * Rejects every job that is still in the pending list, without affecting the queue itself.
   * @param error - The error to reject the pending jobs with.
   * @returns {number} The number of jobs that were rejected.
   */
  private _rejectPending(error: unknown): void {
    while (this._pending.length > 0) {
      const job = this._pending.shift() as IPortQueueJob<unknown>;
      if (job.settled) continue;
      job.settled = true;
      job.reject(error);
    }
  }

  /** Cancels all waiters that are waiting for a free slot in the queue.
   * @param error - The error to reject the waiters with.
   * @returns {void}
   */
  public cancelWaiters(error: unknown): void {
    while (this._waiters.length > 0) {
      const waiter = this._waiters.shift() as IPortQueueWaiter;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  /** Wakes up waiters that are waiting for a free slot in the queue.
   * If there are free slots available, the first waiter in the queue is resolved.
   * This allows the waiter to enqueue its job once a slot is available.
   * @returns {void}
   */
  private _wakeWaiters(): void {
    while (this._waiters.length > 0 && this._pending.length < this._maxLength) {
      const waiter = this._waiters.shift() as IPortQueueWaiter;
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }

  /** Enqueues a job immediately, without waiting for a free slot.
   * @param fn - The job function to enqueue.
   * @param opts - The options for enqueueing the job.
   * @returns {Promise<T>} A promise that settles with the job result (or its error / timeout).
   */
  private _enqueueNow<T>(fn: () => Promise<T> | T, opts: IPortQueueEnqueueOptions): Promise<T> {
    if (this._scanPaused) {
      this.logger.warn('[PortQueue] rejected: scan in progress');
      return Promise.reject(new ModbusScanActiveError());
    }

    const promise = new Promise<T>((resolve, reject) => {
      const job: IPortQueueJob<T> = {
        id: ++this._jobSeq,
        seq: ++this._seq,
        priority: opts.priority ?? 0,
        immediate: opts.immediate ?? false,
        timeoutMs: opts.timeoutMs ?? this._defaultJobTimeoutMs,
        fn,
        resolve,
        reject,
        settled: false,
      };

      this._insert(job as IPortQueueJob<unknown>);
      this.logger.debug(
        {
          id: job.id,
          priority: job.priority,
          immediate: job.immediate,
          queueLength: this._pending.length,
        },
        '[PortQueue] enqueued'
      );
      void this._schedule();
    });
    this._guardRejection(promise);
    return promise;
  }

  /** Enables job processing to start again after a pause.
   * Drains everything that accumulated while paused.
   * @returns {void}
   */
  public enablePause(): void {
    this._paused = true;
    this.logger.debug('[PortQueue] paused');
  }

  /** Disables the pause and resumes job processing.
   * Drains everything that accumulated while paused.
   * @returns {void}
   */
  public disablePause(): void {
    if (!this._paused) return;
    this._paused = false;
    this.logger.debug('[PortQueue] resumed');
    if (!this._scanPaused) void this._schedule();
  }

  /**
   * Freezes the port for a device scan. Unlike a plain pause, new jobs are rejected
   * immediately with ModbusScanActiveError instead of waiting in the queue, because the
   * physical line is about to be taken over by the scanner.
   * @returns {void}
   */
  public enableScanPause(): void {
    this._scanPaused = true;
    // The port claims the scanner: those waiting for a slot must receive a rejection rather than "hanging."
    this.cancelWaiters(new ModbusScanActiveError());
    this.logger.debug('[PortQueue] scan pause enabled');
  }

  /** Disables the scan pause and allows job processing to resume.
   * Drains everything that accumulated while the scan pause was active.
   * @returns {void}
   */
  public disableScanPause(): void {
    if (!this._scanPaused) return;
    this._scanPaused = false;
    this.logger.debug('[PortQueue] scan pause disabled');
    if (!this._paused) void this._schedule();
  }

  /** Checks if the scan pause is currently enabled.
   * @returns {boolean} True if the scan pause is enabled, false otherwise.
   */
  public isScanPaused(): boolean {
    return this._scanPaused;
  }

  /** Checks if the queue is currently paused (either by a manual pause or a scan pause).
   * @returns {boolean} True if the queue is paused, false otherwise.
   */
  public isPaused(): boolean {
    return this._paused || this._scanPaused;
  }

  /** Waits for the queue to become idle (no active job and no pending jobs).
   * @param {number} timeoutMs - The maximum time to wait in milliseconds.
   * @returns {Promise<void>} A promise that resolves when the queue becomes idle.
   * @throws {ModbusBusyError} If the queue does not become idle within the specified timeout.
   */
  public async waitIdle(timeoutMs: number = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.isIdle()) {
      if (Date.now() >= deadline) {
        throw new ModbusBusyError(
          `Port queue did not become idle within ${timeoutMs}ms (queueLength=${this._pending.length}, processing=${this._processing})`
        );
      }
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
  }

  /** Checks if the queue is currently idle (no active job and no pending jobs).
   * @returns {boolean} True if the queue is idle, false otherwise.
   */
  public isIdle(): boolean {
    return this._activeJob === null && this._pending.length === 0;
  }

  /** Returns statistics about the current state of the queue.
   * @returns {IPortQueueStats} The statistics object.
   */
  public getStats(): IPortQueueStats {
    return {
      queueLength: this._pending.length,
      processing: this._activeJob !== null ? 1 : 0,
    };
  }

  /** Inserts a job into the pending list based on its priority and immediacy.
   * Immediate jobs are placed at the front of the list, while other jobs are sorted by priority.
   * @param {IPortQueueJob<unknown>} job - The job to insert into the pending list.
   * @returns {void}
   */
  private _insert(job: IPortQueueJob<unknown>): void {
    let index = 0;
    while (index < this._pending.length && this._pending[index].immediate) index++;
    if (!job.immediate) {
      while (index < this._pending.length && this._pending[index].priority <= job.priority) {
        index++;
      }
    }
    this._pending.splice(index, 0, job);
  }

  /** Schedules the processing of pending jobs if the queue is not paused and not already processing.
   * This method ensures that only one processing loop is active at a time.
   * @returns {void}
   */
  private _schedule(): void {
    if (this._processing || this.isPaused()) return;

    void this._mutex.runExclusive(async () => {
      if (this._processing || this.isPaused()) return;
      this._processing = true;
      try {
        while (!this.isPaused() && this._pending.length > 0) {
          const job = this._pending.shift() as IPortQueueJob<unknown>;
          // Slot freed up: let in the person who was waiting (if anyone was).
          this._wakeWaiters();
          await this._runJob(job);
        }
      } finally {
        this._processing = false;
      }
    });
  }

  /** Executes a job from the pending list, handling its timeout and result.
   * @param {IPortQueueJob<unknown>} job - The job to execute.
   * @returns {Promise<void>} A promise that resolves when the job is completed or rejected.
   */
  private async _runJob(job: IPortQueueJob<unknown>): Promise<void> {
    const started = Date.now();
    this._activeJob = job.id;
    this._runningJob = job;
    this.logger.debug({ id: job.id }, '[PortQueue] started');

    const execution = (async () => {
      this._syncJobId = job.id;
      let result: Promise<unknown> | unknown;
      try {
        result = job.fn();
      } finally {
        this._syncJobId = null;
      }
      return await result;
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;

    const outcome = await (async (): Promise<{ ok: boolean; value?: unknown; error?: unknown }> => {
      try {
        if (job.timeoutMs && job.timeoutMs > 0) {
          const timeoutMs = job.timeoutMs;
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new ModbusTimeoutError(`PortQueue job #${job.id} timed out after ${timeoutMs}ms`)
                ),
              timeoutMs
            );
          });
          return { ok: true, value: await Promise.race([execution, timeout]) };
        }
        return { ok: true, value: await execution };
      } catch (error) {
        return { ok: false, error };
      }
    })();

    if (timer) clearTimeout(timer);
    // The job function cannot be cancelled: swallow a late settlement so that an
    // abandoned job does not produce an unhandled rejection.
    void execution.catch(() => undefined);
    // The port is free again as soon as the job function settled, which is why this
    // happens before the caller-facing promise is resolved (isIdle() stays truthful).
    this._activeJob = null;
    this._runningJob = null;
    this.logger.debug({ id: job.id, ms: Date.now() - started }, '[PortQueue] done');

    if (job.settled) return;
    job.settled = true;
    if (outcome.ok) job.resolve(outcome.value);
    else job.reject(outcome.error);
  }
}

/** Options accepted by the PortSession constructor. */
export interface IPortSessionOptions {
  id?: string;
  type?: TTransportType;
  fallbacks?: string[];
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  /** Options forwarded to the session's PortQueue. */
  queue?: IPortQueueOptions;
  /** Options forwarded to the session's PollingManager. */
  pollingConfig?: IPollingManagerConfig;
}

let portSessionSequence = 0;

/**
 * PortSession is the owner of exactly one physical port. It bundles the transport,
 * the single PortQueue (one mutex per port), exactly one PollingManager and the
 * port-level connection tracker, and exposes the mutable port state through `info`.
 *
 * The controller creates one session per registered transport; client roster and
 * tracker relocation for devices are added in later phases.
 */
export class PortSession implements IPortSession {
  /** Underlying transport. Replaced in place by a hot reload. */
  public transport: ITransport;
  public readonly queue: PortQueue;
  public readonly pollingManager: PollingManager;
  /** Port-level connection tracker: lives in the port owner, not in the controller. */
  public readonly portTracker: PortConnectionTracker;
  /** Clients that live on this port (clientId -> client). */
  public readonly clients = new Map<string, ModbusClient>();
  /** Controller hook used to (re)wire transport state handlers after a reload. */
  private _installTransportHandlers?: (session: PortSession) => void;
  /** Mutable port state (status, slave inventory, reconnect counters, ...). */
  public readonly info: IPortSessionInfo;

  constructor(transport: ITransport, options: IPortSessionOptions = {}) {
    this.transport = transport;
    this.queue = new PortQueue(options.queue);
    this.pollingManager = new PollingManager(options.pollingConfig);
    // The polling manager is a pure scheduler over this port's queue: every exchange it
    // triggers is serialized by PortQueue instead of PM-owned mutexes.
    this.pollingManager.setEnqueueFn((fn, opts) => this.queue.enqueue(fn, opts));
    this.pollingManager.setQueueStatsProvider(() => ({
      queueLength: this.queue.getStats().queueLength,
      clientsCount: this.clients.size,
    }));
    this.portTracker = new PortConnectionTracker();
    this.info = {
      id: options.id ?? `port-${++portSessionSequence}`,
      type: options.type,
      status: 'disconnected',
      slaveIds: [],
      rsMode: transport.getRSMode(),
      fallbacks: options.fallbacks ?? [],
      createdAt: new Date(),
      reconnectAttempts: 0,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      reconnectInterval: options.reconnectInterval ?? 2000,
    };
  }

  /**
   * Returns the unique identifier of the port session.
   * @returns {string} The unique identifier of the port session.
   */
  public get id(): string {
    return this.info.id;
  }

  /** Returns the transport type of the port session.
   * @returns {TTransportType | undefined} The transport type of the port session, or undefined if not set.
   */
  public get type(): TTransportType | undefined {
    return this.info.type;
  }

  /** Returns the current status of the port session.
   * @returns {IPortSessionInfo['status']} The current status of the port session.
   */
  public get status(): IPortSessionInfo['status'] {
    return this.info.status;
  }

  /** Sets the current status of the port session.
   * @param {IPortSessionInfo['status']} value - The new status of the port session.
   */
  public set status(value: IPortSessionInfo['status']) {
    this.info.status = value;
  }

  /** Returns the list of slave IDs associated with the port session.
   * @returns {number[]} The list of slave IDs associated with the port session.
   */
  public get slaveIds(): number[] {
    return this.info.slaveIds;
  }

  /**
   * Returns the RS mode of the port session.
   * @returns {TRSMode} The RS mode of the port session.
   */
  public get rsMode(): TRSMode {
    return this.info.rsMode;
  }

  /** Sets the RS mode of the port session.
   * @param {TRSMode} value - The new RS mode of the port session.
   */
  public set rsMode(value: TRSMode) {
    this.info.rsMode = value;
  }

  /** Returns the list of fallback addresses associated with the port session.
   * @returns {string[]} The list of fallback addresses associated with the port session.
   */
  public get fallbacks(): string[] {
    return this.info.fallbacks;
  }

  /** Returns the date and time when the port session was created.
   * @returns {Date} The date and time when the port session was created.
   */
  public get createdAt(): Date {
    return this.info.createdAt;
  }

  /** Returns the maximum number of reconnect attempts allowed for the port session.
   * @returns {number} The maximum number of reconnect attempts allowed for the port session.
   */
  public get maxReconnectAttempts(): number {
    return this.info.maxReconnectAttempts;
  }

  /** Returns the interval (in milliseconds) between reconnect attempts.
   * @returns {number} The interval between reconnect attempts.
   */
  public get reconnectInterval(): number {
    return this.info.reconnectInterval;
  }

  /**
   * Returns the last error encountered by the port session, if any.
   * @returns {Error | undefined} The last error encountered by the port session, or undefined if no error has occurred.
   */
  public get lastError(): Error | undefined {
    return this.info.lastError;
  }

  /** Sets the last error encountered by the port session.
   * @param {Error | undefined} value - The last error encountered by the port session.
   */
  public set lastError(value: Error | undefined) {
    this.info.lastError = value;
  }

  /** Returns the number of reconnect attempts made for the port session.
   * @returns {number} The number of reconnect attempts made for the port session.
   */
  public get reconnectAttempts(): number {
    return this.info.reconnectAttempts;
  }

  /** Sets the number of reconnect attempts made for the port session.
   * @param {number} value - The new number of reconnect attempts made for the port session.
   */
  public set reconnectAttempts(value: number) {
    this.info.reconnectAttempts = value;
  }

  /**
   * Executes a function within the port queue, ensuring that only one operation is in flight at a time.
   * @param fn - The function to execute. It can return a Promise or a value.
   * @param opts - Optional options for enqueueing the job, such as priority and timeout.
   * @returns A promise that resolves with the result of the function or rejects with an error.
   * @throws ModbusReentrancyError if called from the synchronous part of a running job.
   * @throws ModbusScanActiveError if the port is currently paused for a scan.
   * @throws ModbusQueueOverflowError if the queue is full and the overflow policy is set to 'reject'.
   * @throws ModbusBusyError if the queue does not become idle within the specified timeout.
   * @throws ModbusTimeoutError if the job times out before completion.
   */
  public execute<T>(fn: () => Promise<T> | T, opts?: IPortQueueEnqueueOptions): Promise<T> {
    return this.queue.enqueue(fn, opts);
  }

  /**
   * Pauses the port queue, preventing new jobs from being processed. In-flight jobs will continue to completion.
   * New jobs will be queued but not executed until the queue is resumed.
   * @returns {void}
   */
  public pause(): void {
    this.queue.enablePause();
  }

  /**
   * Resumes the port queue, allowing queued jobs to be processed again.
   * @returns {void}
   */
  public resume(): void {
    this.queue.disablePause();
  }

  /**
   * Hands the port over to a device scan:
   * 1. stop scheduling new polling work,
   * 2. let in-flight exchanges finish (never yank the line from under a critical write),
   * 3. freeze the queue so new client requests fail fast with ModbusScanActiveError.
   *
   * @throws ModbusBusyError when the port does not drain within `timeoutMs`.
   */
  public async pauseForScan(timeoutMs: number = 2000): Promise<void> {
    this.pollingManager.pauseAllTasks();
    await this.queue.waitIdle(timeoutMs);
    this.queue.enableScanPause();
  }

  /**
   * Resumes the port after a device scan:
   * 1. unfreeze the queue so new client requests are accepted again,
   * 2. resume scheduling polling work.
   *
   * @returns {Promise<void>} A promise that resolves when the port is resumed.
   */
  public async resumeAfterScan(): Promise<void> {
    this.queue.disableScanPause();
    this.pollingManager.resumeAllTasks();
  }

  /**
   * Checks if the port queue is currently paused (either by a manual pause or a scan pause).
   * @returns {boolean} True if the port queue is paused, false otherwise.
   */
  public isPaused(): boolean {
    return this.queue.isPaused();
  }

  /**
   * Checks if the port queue is currently idle (no active job and no pending jobs).
   * @returns {boolean} True if the port queue is idle, false otherwise.
   */
  public isIdle(): boolean {
    return this.queue.isIdle();
  }

  /**
   * Sets a custom installer function for transport state handlers. This function will be called after a transport reload to rewire the transport's state handlers.
   * @param installer - A function that takes the PortSession as an argument and installs the necessary transport state handlers.
   * @returns {void}
   */
  public setTransportHandlerInstaller(installer: (session: PortSession) => void): void {
    this._installTransportHandlers = installer;
  }

  /**
   * Replaces the current transport with a new one, clearing the port tracker and re-installing transport state handlers.
   * @param newTransport - The new transport to use for the port session.
   * @returns {Promise<void>} A promise that resolves when the transport has been reloaded.
   * @throws Any error that occurs during the transport reload process.
   */
  public async reload(newTransport: ITransport): Promise<void> {
    this.transport.setDeviceStateHandler(() => {});
    this.transport.setPortStateHandler(() => {});

    this.transport = newTransport;
    this.info.rsMode = newTransport.getRSMode();

    await this.portTracker.clear();
    this._installTransportHandlers?.(this);
  }

  /**
   * Destroys the port session, clearing all polling tasks, aborting the queue, disconnecting the transport, and clearing the port tracker.
   * This method ensures that all resources associated with the port session are released and that no further operations can be performed on the session.
   * @returns {Promise<void>} A promise that resolves when the port session has been destroyed.
   * @throws Any error that occurs during the destruction process, except for errors from disconnecting an already closed transport, which are ignored.
   */
  public async destroy(): Promise<void> {
    this.pollingManager.clearAll();

    // Shut down immediately: do not wait for polling tasks or the queue tail. Anything
    // in the queue or waiting for a slot is rejected immediately, and an incomplete
    // exchange (the result of which is no longer needed) does not delay the port closure.
    this.queue.abort(new ModbusNotConnectedError(`Port session "${this.id}" was destroyed`));

    this.transport.setDeviceStateHandler(() => {});
    this.transport.setPortStateHandler(() => {});

    try {
      await this.transport.disconnect();
    } catch {
      // Tearing down an already closed port must not break the teardown.
    }

    this.info.status = 'disconnected';
    await this.portTracker.clear();
  }
}
