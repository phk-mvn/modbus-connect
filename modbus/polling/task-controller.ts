// modbus/polling/task-controller.ts

import type { Logger } from 'pino';
import { IPollingTaskOptions, IPollingTaskState, ITaskController } from '../types/public.js';
import { ModbusFlushError, ModbusTimeoutError, PollingManagerError } from '../core/errors.js';

/**
 * TaskController manages the full lifecycle of a single polling task.
 * It handles scheduling, execution with retries, timeouts, backoff logic,
 * and all lifecycle callbacks.
 *
 * IMP-6: Extracted from manager.ts into its own module.
 */
export class TaskController implements ITaskController {
  public id: string;
  public priority: number;
  public name: string | null;
  public fn: Array<(signal?: AbortSignal) => unknown | Promise<unknown>>;
  public interval: number;
  public onData?: (data: unknown[]) => void;
  public onError?: (error: Error, fnIndex: number, retryCount: number) => void;
  public onStart?: () => void;
  public onStop?: () => void;
  public onFinish?: (success: boolean, results: unknown[]) => void;
  public onBeforeEach?: () => void;
  public onRetry?: (error: Error, fnIndex: number, retryCount: number) => void;
  public shouldRun?: () => boolean;
  public onSuccess?: (result: unknown) => void;
  public onFailure?: (error: Error) => void;
  public maxRetries: number;
  public backoffDelay: number;
  public taskTimeout: number;

  public stopped: boolean;
  public paused: boolean;
  public executionInProgress: boolean;

  public logger: Logger;

  // RISK-2: isEnqueued must be reset on pause/stop so resume can reschedule
  private _isEnqueued: boolean = false;

  /** Whether the task is currently sitting in the manager's execution queue. */
  public get isEnqueued(): boolean {
    return this._isEnqueued;
  }
  public set isEnqueued(value: boolean) {
    this._isEnqueued = value;
  }

  private timerId: NodeJS.Timeout | null = null;

  // RISK-7: AbortController for interruptible sleep / timeout
  private _abortController: AbortController | null = null;

  /**
   * Callback the TaskController calls to enqueue itself into the manager queue.
   * Set by the PollingManager after construction.
   */
  public enqueueFn!: (task: TaskController) => void;

  /**
   * Callback the TaskController calls to remove itself from the manager queue.
   * Set by the PollingManager after construction.
   */
  public dequeueFn!: (taskId: string) => void;

  constructor(options: IPollingTaskOptions, logger: Logger) {
    const {
      id,
      priority = 0,
      interval,
      fn,
      onData,
      onError,
      onStart,
      onStop,
      onFinish,
      onBeforeEach,
      onRetry,
      shouldRun,
      onSuccess,
      onFailure,
      name = null,
      maxRetries = 3,
      backoffDelay = 1000,
      taskTimeout = 5000,
    } = options;

    this.id = id;
    this.priority = priority;
    this.name = name;
    this.fn = Array.isArray(fn) ? fn : [fn];
    this.interval = interval;
    this.onData = onData;
    this.onError = onError;
    this.onStart = onStart;
    this.onStop = onStop;
    this.onFinish = onFinish;
    this.onBeforeEach = onBeforeEach;
    this.onRetry = onRetry;
    this.shouldRun = shouldRun;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
    this.maxRetries = maxRetries;
    this.backoffDelay = backoffDelay;
    this.taskTimeout = taskTimeout;

    this.stopped = true;
    this.paused = false;
    this.executionInProgress = false;

    this.logger = logger.child({ component: 'Task', taskId: id });
    this.logger.debug(
      { id, priority, interval, maxRetries, backoffDelay, taskTimeout },
      'TaskController created'
    );
  }

  /**
   * Starts the task.
   * BUG-1 fix: Direct call, no setTimeout wrapper needed.
   */
  public start(): void {
    if (!this.stopped) {
      this.logger.debug('Task already running');
      return;
    }
    this.stopped = false;
    this.logger.debug('Task started');
    this.onStart?.();
    this._scheduleNextRun(true);
  }

  /**
   * Completely stops the task.
   * RISK-2 fix: Reset isEnqueued and remove from queue.
   * RISK-7 fix: Abort any in-flight sleep/timeout.
   */
  public stop(): void {
    if (this.stopped) {
      this.logger.debug('Task already stopped');
      return;
    }
    this.stopped = true;
    this._isEnqueued = false;

    // RISK-7: Cancel any pending sleep or timeout
    this._abort();

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.dequeueFn(this.id);
    this.logger.info('Task stopped');
    this.onStop?.();
  }

  /**
   * Pauses the task temporarily.
   * RISK-2 fix: Reset isEnqueued, remove from queue, and clear pending timer
   * so the timer doesn't re-enqueue the task while paused.
   */
  public pause(): void {
    if (this.paused) {
      this.logger.debug('Task already paused');
      return;
    }
    this.paused = true;
    this._isEnqueued = false;
    this.dequeueFn(this.id);

    // Critical: clear the pending schedule timer so it doesn't
    // re-enqueue us after pause (which would set isEnqueued=true
    // and prevent resume from rescheduling)
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.logger.info('Task paused');
  }

  /**
   * Resumes a previously paused task.
   */
  public resume(): void {
    if (!this.stopped && this.paused) {
      this.paused = false;
      this.logger.info('Task resumed');

      if (!this.timerId && !this.executionInProgress && !this._isEnqueued) {
        this._scheduleNextRun(true);
      }
    } else {
      this.logger.debug({ id: this.id }, 'Cannot resume task - not paused or stopped');
    }
  }

  private _scheduleNextRun(immediate: boolean = false): void {
    if (this.stopped) return;

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const delay = immediate ? 0 : this.interval;

    this.timerId = setTimeout(() => {
      this.timerId = null;
      if (this.stopped) return;
      this._isEnqueued = true;
      this.enqueueFn(this);
    }, delay);
  }

  /**
   * Executes the task's functions with full retry logic, timeouts, and callbacks.
   * BUG-2 fix: Uses AbortController for real cancellation.
   * BUG-3 fix: overallSuccess uses && (all must succeed).
   * BUG-4 fix: onError called before onFailure.
   * RISK-7 fix: _sleep is interruptible.
   */
  public async execute(): Promise<void> {
    this._isEnqueued = false;

    if (this.stopped || this.paused) {
      return;
    }

    if (this.shouldRun && !this.shouldRun()) {
      this.logger.debug({ id: this.id }, 'Task should not run according to shouldRun function');
      this._scheduleNextRun();
      return;
    }

    this.onBeforeEach?.();
    this.executionInProgress = true;

    // BUG-2: Create an AbortController for this execution cycle
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    try {
      let overallSuccess = true;
      const results: unknown[] = [];

      for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
        if (this.stopped || this.paused) break;

        let retryCount = 0;
        let result: unknown = null;
        let fnSuccess = false;

        while (!this.stopped && !this.paused && retryCount <= this.maxRetries) {
          try {
            const fnToExecute = this.fn[fnIndex];
            if (typeof fnToExecute !== 'function') break;

            result = await this._withTimeoutAndAbort(
              () => Promise.resolve(fnToExecute(signal)),
              this.taskTimeout,
              signal
            );

            if (this.stopped || this.paused) return;

            fnSuccess = true;
            break;
          } catch (err: unknown) {
            if (this.stopped || this.paused) return;

            const error = err instanceof Error ? err : new PollingManagerError(String(err));
            this._logSpecificError(error, fnIndex, retryCount);
            retryCount++;
            this.onRetry?.(error, fnIndex, retryCount);

            if (retryCount > this.maxRetries) {
              // BUG-4: Call onError before onFailure
              this.onError?.(error, fnIndex, retryCount);
              this.onFailure?.(error);
            } else {
              const isFlushedError = error instanceof ModbusFlushError;
              const baseDelay = isFlushedError
                ? 50
                : this.backoffDelay * Math.pow(2, retryCount - 1);
              const delay = baseDelay + Math.random() * baseDelay * 0.5;

              // RISK-7: Interruptible sleep
              await this._interruptibleSleep(delay, signal);
            }
          }
        }

        // BUG-3: All functions must succeed for overallSuccess
        overallSuccess = overallSuccess && fnSuccess;
        results.push(result);
      }

      if (this.stopped || this.paused) return;

      if (results.length > 0 && results.some(r => r !== null && r !== undefined)) {
        this.onData?.(results);
      }

      if (overallSuccess) {
        this.onSuccess?.(results);
      }
      this.onFinish?.(overallSuccess, results);
    } catch (err: unknown) {
      if (!this.stopped && !this.paused) {
        this.logger.error({ id: this.id, error: (err as any).message }, 'Fatal error in task');
      }
    } finally {
      this.executionInProgress = false;
      this._abortController = null;
      if (!this.stopped && !this.paused) {
        this._scheduleNextRun();
      }
    }
  }

  public isRunning(): boolean {
    return !this.stopped;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setInterval(ms: number): void {
    this.interval = ms;
    this.logger.info('Interval updated');
  }

  public getState(): IPollingTaskState {
    return {
      stopped: this.stopped,
      paused: this.paused,
      running: !this.stopped,
      inProgress: this.executionInProgress,
    };
  }

  /**
   * Returns a promise that resolves when the current execution finishes.
   * Used by RISK-6 (updateTask) to wait for graceful completion.
   */
  public waitForCompletion(timeoutMs: number = 5000): Promise<void> {
    if (!this.executionInProgress) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const check = setInterval(() => {
        if (!this.executionInProgress) {
          clearInterval(check);
          if (timeoutHandle) clearTimeout(timeoutHandle);
          settled = true;
          resolve();
        }
      }, 50);

      timeoutHandle = setTimeout(() => {
        if (!settled) {
          clearInterval(check);
          settled = true;
          resolve();
        }
      }, timeoutMs);
    });
  }

  private _logSpecificError(error: Error, fnIdx: number, retry: number): void {
    const errorName = error.constructor.name;
    this.logger.error(`Fail (fn:${fnIdx}, retry:${retry}) -> ${errorName}: ${error.message}`);
  }

  private _interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>(resolve => {
      if (signal.aborted || this.stopped || this.paused) {
        resolve();
        return;
      }

      let settled = false;
      let checkInterval: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(mainTimer);
        if (checkInterval) clearInterval(checkInterval);
        signal.removeEventListener('abort', onAbort);
      };

      const mainTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      const onAbort = () => {
        cleanup();
        resolve();
      };

      signal.addEventListener('abort', onAbort, { once: true });

      checkInterval = setInterval(() => {
        if (this.stopped || this.paused) {
          cleanup();
          resolve();
        }
      }, 100);
    });
  }

  /**
   * BUG-2 fix: Timeout with AbortController.
   * If the timeout fires before the promise settles, the AbortController
   * signal is aborted, giving the underlying operation a chance to cancel.
   */
  private _withTimeoutAndAbort<T>(
    fn: () => Promise<T>,
    timeout: number,
    signal: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(new ModbusTimeoutError('Task aborted before execution'));
        return;
      }

      const timer = setTimeout(() => {
        // Abort the controller so the underlying operation can cancel
        this._abort();
        reject(new ModbusTimeoutError('Task timed out'));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /** Abort the current execution cycle's AbortController. */
  private _abort(): void {
    if (this._abortController && !this._abortController.signal.aborted) {
      this._abortController.abort();
    }
  }
}
