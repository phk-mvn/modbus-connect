// modbus/polling/task-controller.ts

import { type Logger, type ILogObj } from 'tslog';
import { IPollingTaskOptions, IPollingTaskState, ITaskController } from '../types/public.js';
import { ModbusTimeoutError, PollingManagerError } from '../core/errors.js';
import { RetryAbortedError, defaultRetryDelay, runWithRetries } from '../utils/retry.js';

/**
 * TaskController manages the full lifecycle of a single polling task.
 * It handles scheduling, execution with retries, timeouts, backoff logic,
 * and all lifecycle callbacks.
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

  public logger: Logger<ILogObj>;

  private _isEnqueued: boolean = false;

  /** Whether the task is currently sitting in the manager's execution queue. */
  public get isEnqueued(): boolean {
    return this._isEnqueued;
  }
  /** Sets whether the task is currently sitting in the manager's execution queue. */
  public set isEnqueued(value: boolean) {
    this._isEnqueued = value;
  }

  private timerId: NodeJS.Timeout | null = null;
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

  /**
   * Constructs a new TaskController with the provided options and logger.
   * @param {IPollingTaskOptions} options - The configuration options for the task.
   * @param {Logger<ILogObj>} logger - The logger instance for logging task events.
   */
  constructor(options: IPollingTaskOptions, logger: Logger<ILogObj>) {
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

    this.logger = logger.getSubLogger({ name: 'Task' }, { component: 'Task', taskId: id });
    this.logger.debug(
      { id, priority, interval, maxRetries, backoffDelay, taskTimeout },
      'TaskController created'
    );
  }

  /**
   * Starts the task, allowing it to be scheduled and executed.
   * @returns {void}
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
   * Stops the task, preventing any further scheduling or execution.
   * @returns {void}
   */
  public stop(): void {
    if (this.stopped) {
      this.logger.debug('Task already stopped');
      return;
    }
    this.stopped = true;
    this._isEnqueued = false;

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
   * Pauses the task, preventing it from being scheduled or executed until resumed.
   * @returns {void}
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
   * Resumes the task if it was previously paused, allowing it to be scheduled and executed again.
   * If the task is not paused or is stopped, this method does nothing.
   * @returns {void}
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

  /**
   * Schedules the next execution of the task based on the interval.
   * If immediate is true, the task will be scheduled to run immediately.
   * Otherwise, it will be scheduled to run after the specified interval.
   * If the task is stopped, no scheduling will occur.
   * If a timer is already set, it will be cleared before setting a new one.
   * @param {boolean} immediate - Whether to schedule the task to run immediately.
   */
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

  /** Executes the task's functions in sequence, handling retries, timeouts, and aborts.
   * If the task is stopped or paused, execution will not proceed.
   * If shouldRun is defined and returns false, execution will be skipped.
   * Lifecycle callbacks (onBeforeEach, onData, onError, onFinish, onSuccess, onFailure) are invoked as appropriate.
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

    this._abortController = new AbortController();
    const { signal } = this._abortController;

    try {
      let overallSuccess = true;
      const results: unknown[] = [];

      for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
        if (this.stopped || this.paused) break;

        const fnToExecute = this.fn[fnIndex];
        let result: unknown = null;
        let fnSuccess = false;

        if (typeof fnToExecute === 'function') {
          try {
            // Retries, pauses, and interruptions — common policy (modbus/utils/retry.ts),
            // the same one used by ModbusClient.
            result = await runWithRetries<unknown>(
              () =>
                this._withTimeoutAndAbort(
                  () => Promise.resolve(fnToExecute(signal)),
                  this.taskTimeout,
                  signal
                ),
              {
                maxRetries: this.maxRetries,
                signal,
                shouldStop: () => this.stopped || this.paused,
                getDelayMs: (error, retryNumber) =>
                  defaultRetryDelay(error, retryNumber, this.backoffDelay),
                onAttemptFailed: (error, attemptNumber) => {
                  const e = error instanceof Error ? error : new PollingManagerError(String(error));
                  // The log format remains the same: the retry number in the message is zero-indexed.
                  this._logSpecificError(e, fnIndex, attemptNumber - 1);
                  // onRetry — only when a retry actually takes place (as before).
                  if (attemptNumber <= this.maxRetries) {
                    this.onRetry?.(e, fnIndex, attemptNumber);
                  }
                },
                onExhausted: (error, attempts) => {
                  const e = error instanceof Error ? error : new PollingManagerError(String(error));
                  this.onError?.(e, fnIndex, attempts);
                  this.onFailure?.(e);
                },
              }
            );

            if (this.stopped || this.paused) return;
            fnSuccess = true;
          } catch (err) {
            // Interruption (stop/pause/abort) — silent exit
            if (err instanceof RetryAbortedError) return;
            if (this.stopped || this.paused) return;
          }
        }

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

  /**
   * Returns whether the task is currently running (not stopped).
   * @returns {boolean} True if the task is running, false if it is stopped.
   */
  public isRunning(): boolean {
    return !this.stopped;
  }

  /** Returns whether the task is currently paused.
   * @returns {boolean} True if the task is paused, false otherwise.
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /** Sets the interval for the task's execution.
   * @param {number} ms - The new interval in milliseconds.
   */
  public setInterval(ms: number): void {
    this.interval = ms;
    this.logger.info('Interval updated');
  }

  /** Returns the current state of the task, including whether it is stopped, paused, running, and if an execution is in progress.
   * @returns {IPollingTaskState} The current state of the task.
   */
  public getState(): IPollingTaskState {
    return {
      stopped: this.stopped,
      paused: this.paused,
      running: !this.stopped,
      inProgress: this.executionInProgress,
    };
  }

  /** Waits for the current execution cycle to complete or until the specified timeout is reached.
   * If the task is not currently executing, the promise resolves immediately.
   * @param {number} timeoutMs - The maximum time to wait for completion in milliseconds (default: 5000).
   * @returns {Promise<void>} A promise that resolves when the execution completes or the timeout is reached.
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

  /** Logs a specific error with details about the function index and retry count.
   * @param {Error} error - The error to log.
   * @param {number} fnIdx - The index of the function that caused the error.
   * @param {number} retry - The retry count when the error occurred.
   */
  private _logSpecificError(error: Error, fnIdx: number, retry: number): void {
    const errorName = error.constructor.name;
    this.logger.error(`Fail (fn:${fnIdx}, retry:${retry}) -> ${errorName}: ${error.message}`);
  }

  /** Wraps a function execution with a timeout and abort signal.
   * If the function does not complete within the specified timeout, it will be aborted and a ModbusTimeoutError will be thrown.
   * If the abort signal is triggered before or during execution, a ModbusTimeoutError will also be thrown.
   * @param {() => Promise<T>} fn - The function to execute.
   * @param {number} timeout - The maximum time to wait for the function to complete in milliseconds.
   * @param {AbortSignal} signal - The abort signal to monitor for cancellation.
   * @returns {Promise<T>} A promise that resolves with the function's result or rejects with an error.
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
