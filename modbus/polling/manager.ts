// modbus/polling/manager.ts

import { Mutex } from 'async-mutex';
import { Logger, DefaultLogLevels, type ILogObj } from 'tslog';
import { createTsLogger } from '../utils/logger.js';
import {
  IPollingManagerConfig,
  IPollingTaskOptions,
  IPollingTaskState,
  IPollingQueueInfo,
  IPollingSystemStats,
  IPollingManager,
  IPortQueueEnqueueOptions,
  TManagerLogLevel,
  TPollingEnqueueFn,
  TPollingQueueStatsProvider,
} from '../types/public.js';
import {
  PollingManagerError,
  PollingTaskAlreadyExistsError,
  PollingTaskNotFoundError,
  PollingTaskValidationError,
} from '../core/errors.js';
import { TaskController } from './task-controller.js';

interface ResolvedPollingManagerConfig {
  defaultMaxRetries: number;
  defaultBackoffDelay: number;
  defaultTaskTimeout: number;
  interTaskDelay: number;
  logLevel: TManagerLogLevel;
  concurrency: 'strict' | 'per-slave';
}

const TSLOG_MIN_LEVEL: Record<Exclude<TManagerLogLevel, 'silent'>, DefaultLogLevels> = {
  trace: DefaultLogLevels.TRACE,
  debug: DefaultLogLevels.DEBUG,
  info: DefaultLogLevels.INFO,
  warn: DefaultLogLevels.WARN,
  error: DefaultLogLevels.ERROR,
  fatal: DefaultLogLevels.FATAL,
};

/**
 * PollingManager is the main class responsible for managing multiple polling tasks.
 * It handles task registration, lifecycle control (start/stop/pause), priority-based queuing
 * and comprehensive logging.
 *
 * Since the port queue owns wire-level synchronization, the polling manager is a pure
 * scheduler: in `strict` mode (default) it runs one task at a time and holds no mutex while
 * a task runs, so tasks cannot collide with manual client requests. The legacy
 * per-slave mutex model is still available via `concurrency: 'per-slave'`.
 */
class PollingManager implements IPollingManager {
  private config: ResolvedPollingManagerConfig;
  public tasks: Map<string, TaskController>;
  private executionQueue: TaskController[];

  /** taskId -> clientId for tasks linked to a client (IPollingTaskOptions.clientId). */
  private readonly _taskOwners = new Map<string, string>();
  private readonly logger: Logger<ILogObj>;

  private slaveMutexes: Map<string, Mutex>;
  private defaultMutex: Mutex;

  /** Port queue binding: when set, the manager schedules jobs on the session queue. */
  private _enqueueFn?: TPollingEnqueueFn;
  private _queueStatsProvider?: TPollingQueueStatsProvider;

  private isProcessing: boolean;
  private paused: boolean;

  constructor(config: IPollingManagerConfig = {}) {
    this.config = {
      defaultMaxRetries: config.defaultMaxRetries ?? 3,
      defaultBackoffDelay: config.defaultBackoffDelay ?? 1000,
      defaultTaskTimeout: config.defaultTaskTimeout ?? 5000,
      interTaskDelay: config.interTaskDelay ?? 0,
      logLevel: config.logLevel ?? 'info',
      concurrency: config.concurrency ?? 'strict',
    };

    this.tasks = new Map();
    this.executionQueue = [];
    this.slaveMutexes = new Map();
    this.defaultMutex = new Mutex();
    this.isProcessing = false;
    this.paused = false;

    const level = this.config.logLevel;
    this.logger = createTsLogger({ name: 'manager', level });
  }

  /**
   * Binds the polling manager to the port queue of its session.
   * After binding, `executeImmediate` is submitted to that queue and the manager no longer
   * serializes task bodies itself.
   */
  public setEnqueueFn(fn: TPollingEnqueueFn): void {
    this._enqueueFn = fn;
  }

  /** Registers a provider of live port-queue / client counters (used by getQueueInfo). */
  public setQueueStatsProvider(provider: TPollingQueueStatsProvider): void {
    this._queueStatsProvider = provider;
  }

  /** Submits a job to the bound port queue, or runs it inline when no queue is bound. */
  private async _submit<T>(fn: () => Promise<T> | T, opts?: IPortQueueEnqueueOptions): Promise<T> {
    if (this._enqueueFn) return this._enqueueFn<T>(fn, opts);
    return await fn();
  }

  /**
   * Returns (or creates) a mutex for a specific slave ID.
   */
  private _getSlaveMutex(slaveId: string | undefined): Mutex {
    if (slaveId === undefined) return this.defaultMutex;
    let mutex = this.slaveMutexes.get(slaveId);
    if (!mutex) {
      mutex = new Mutex();
      this.slaveMutexes.set(slaveId, mutex);
    }
    return mutex;
  }

  /**
   * Determines the slave ID for a task (if any) for mutex selection.
   * Tasks can optionally declare a `slaveId` in their options.
   */
  private _getTaskSlaveId(task: TaskController): string | undefined {
    return (task as any).slaveId;
  }

  /** Validates the provided task options and throws a PollingTaskValidationError if invalid.
   * @param {IPollingTaskOptions} options - The task options to validate.
   * @throws {PollingTaskValidationError} If the options are invalid.
   */
  private _validateTaskOptions(options: IPollingTaskOptions): void {
    if (!options || typeof options !== 'object') {
      throw new PollingTaskValidationError('Task options must be an object');
    }
    if (!options.id) {
      throw new PollingTaskValidationError('Task must have an "id"');
    }
    if (typeof options.interval !== 'number' || options.interval <= 0) {
      throw new PollingTaskValidationError('Interval must be a positive number');
    }

    const { fn } = options;

    if (Array.isArray(fn)) {
      if (fn.length === 0) {
        throw new PollingTaskValidationError('fn array cannot be empty');
      }
      if (fn.some(f => typeof f !== 'function')) {
        throw new PollingTaskValidationError('All elements in fn array must be functions');
      }
    } else if (typeof fn !== 'function') {
      throw new PollingTaskValidationError('fn must be a function or an array of functions');
    }
  }

  /** Adds a new polling task to the manager.
   * @param {IPollingTaskOptions} options - The options for the new task.
   * @throws {PollingTaskAlreadyExistsError} If a task with the same ID already exists.
   * @throws {PollingTaskValidationError} If the provided options are invalid.
   */
  public addTask(options: IPollingTaskOptions): void {
    try {
      this._validateTaskOptions(options);
      if (this.tasks.has(options.id)) throw new PollingTaskAlreadyExistsError(options.id);

      const task = new TaskController(
        {
          ...options,
          maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
          backoffDelay: options.backoffDelay ?? this.config.defaultBackoffDelay,
          taskTimeout: options.taskTimeout ?? this.config.defaultTaskTimeout,
        },
        this.logger
      );

      // Wire up the enqueue/dequeue callbacks (decoupled from direct manager reference)
      task.enqueueFn = (t: TaskController) => this.enqueueTask(t);
      task.dequeueFn = (taskId: string) => this.removeFromQueue(taskId);

      this.tasks.set(options.id, task);
      if (options.clientId) this._taskOwners.set(options.id, options.clientId);
      this.logger.info(`Task added -> ${options.id}`);

      if (options.immediate !== false) task.start();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new PollingManagerError(String(error));
      this.logger.error({ error: err.message }, 'Failed to add task');
      throw err;
    }
  }

  /** Updates an existing polling task with new options.
   * @param {string} id - The ID of the task to update.
   * @param {IPollingTaskOptions} newOptions - The new options for the task.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   * @throws {PollingTaskValidationError} If the provided new options are invalid.
   */
  public async updateTask(id: string, newOptions: IPollingTaskOptions): Promise<void> {
    const oldTask = this.tasks.get(id);
    if (!oldTask) throw new PollingTaskNotFoundError(id);

    const oldOptions: IPollingTaskOptions = {
      id: oldTask.id,
      priority: oldTask.priority,
      interval: oldTask.interval,
      fn: oldTask.fn,
      onData: oldTask.onData,
      onError: oldTask.onError,
      onStart: oldTask.onStart,
      onStop: oldTask.onStop,
      onFinish: oldTask.onFinish,
      onBeforeEach: oldTask.onBeforeEach,
      onRetry: oldTask.onRetry,
      shouldRun: oldTask.shouldRun,
      onSuccess: oldTask.onSuccess,
      onFailure: oldTask.onFailure,
      name: oldTask.name ?? undefined,
      maxRetries: oldTask.maxRetries,
      backoffDelay: oldTask.backoffDelay,
      taskTimeout: oldTask.taskTimeout,
    };

    const mergedOptions = { ...oldOptions, ...newOptions };
    const wasRunning = oldTask.isRunning();

    if (oldTask.executionInProgress) {
      oldTask.pause(); // Stop scheduling new runs
      await oldTask.waitForCompletion();
    }

    this.removeTask(id);
    this.addTask(mergedOptions);
    if (wasRunning) this.startTask(id);
  }

  /**
   * Stops and removes every task that belongs to a client.
   * Used by the controller on `removeClient()`, so a removed client leaves no orphan tasks.
   *
   * @param {string} clientId - Owner client id (see `IPollingTaskOptions.clientId`).
   * @returns {string[]} Ids of the removed tasks.
   */
  public removeTasksByClient(clientId: string): string[] {
    const ids: string[] = [];
    for (const [taskId, owner] of this._taskOwners) {
      if (owner === clientId) ids.push(taskId);
    }

    for (const id of ids) {
      this.stopTask(id);
      this.removeTask(id);
    }

    return ids;
  }

  /** Removes a polling task from the manager.
   * @param {string} id - The ID of the task to remove.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   */
  public removeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
      this._taskOwners.delete(id);
      this.removeFromQueue(id);
      this.logger.info({ id }, 'Task removed');
    } else {
      this.logger.warn(`Attempt to remove non-existent task: ${id}`);
    }
  }

  /**
   * BUG-1 fix: restartTask calls start() synchronously after stop(),
   * no unnecessary setTimeout wrapper.
   */
  public restartTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      task.start();
    }
  }

  /** Starts a specific polling task.
   * @param {string} id - The ID of the task to start.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   */
  public startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.start();
    else throw new PollingTaskNotFoundError(id);
  }

  /** Stops a specific polling task.
   * @param {string} id - The ID of the task to stop.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   */
  public stopTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.stop();
  }

  /** Pauses a specific polling task.
   * @param {string} id - The ID of the task to pause.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   */
  public pauseTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.pause();
  }

  /** Resumes a specific polling task.
   * @param {string} id - The ID of the task to resume.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   */
  public resumeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.resume();
      this._processQueue();
    }
  }

  /** Sets the interval for a specific polling task.
   * @param {string} id - The ID of the task to update.
   * @param {number} interval - The new interval in milliseconds.
   * @throws {PollingTaskNotFoundError} If no task with the given ID exists.
   */
  public setTaskInterval(id: string, interval: number): void {
    const task = this.tasks.get(id);
    if (task) task.setInterval(interval);
  }

  /** Checks if a specific polling task is currently running.
   * @param {string} id - The ID of the task to check.
   * @returns {boolean} True if the task is running, false otherwise.
   */
  public isTaskRunning(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? task.isRunning() : false;
  }

  /** Checks if a specific polling task is currently paused.
   * @param {string} id - The ID of the task to check.
   * @returns {boolean} True if the task is paused, false otherwise.
   */
  public isTaskPaused(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? task.isPaused() : false;
  }

  /** Retrieves the current state of a specific polling task.
   * @param {string} id - The ID of the task to check.
   * @returns {IPollingTaskState | null} The current state of the task, or null if not found.
   */
  public getTaskState(id: string): IPollingTaskState | null {
    const task = this.tasks.get(id);
    return task ? task.getState() : null;
  }

  /** Checks if a task with the given ID exists in the manager.
   * @param {string} id - The ID of the task to check.
   * @returns {boolean} True if the task exists, false otherwise.
   */
  public hasTask(id: string): boolean {
    return this.tasks.has(id);
  }

  /** Retrieves the IDs of all tasks currently managed by the PollingManager.
   * @returns {string[]} An array of task IDs.
   */
  public getTaskIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * clearAll no longer sets paused=true permanently.
   * After clearing, the manager is ready to accept new tasks.
   */
  public clearAll(): void {
    this.logger.info('Clearing all tasks');
    this.tasks.forEach(task => task.stop());
    this.tasks.clear();
    this._taskOwners.clear();
    this.executionQueue = [];
    this.isProcessing = false;
    this.logger.info('All tasks cleared');
  }

  /**
   * BUG-1 fix: restartAllTasks calls start() synchronously, no setTimeout.
   */
  public restartAllTasks(): void {
    Array.from(this.tasks.keys()).forEach(id => {
      const task = this.tasks.get(id);
      if (task) {
        task.stop();
        task.start();
      }
    });
  }

  /** Pauses all polling tasks managed by the PollingManager.
   * This method sets the manager's paused state to true and calls pause() on each task.
   */
  public pauseAllTasks(): void {
    this.paused = true;
    this.tasks.forEach(task => task.pause());
  }

  /** Resumes all polling tasks managed by the PollingManager.
   * This method sets the manager's paused state to false and calls resume() on each task.
   * It also triggers the processing of the execution queue.
   */
  public resumeAllTasks(): void {
    this.paused = false;
    this.tasks.forEach(task => task.resume());
    this._processQueue();
  }

  /** Starts all polling tasks managed by the PollingManager.
   * This method sets the manager's paused state to false and calls start() on each task.
   */
  public startAllTasks(): void {
    this.paused = false;
    this.tasks.forEach(task => task.start());
  }

  /** Stops all polling tasks managed by the PollingManager.
   * This method calls stop() on each task and clears the execution queue.
   * Note: It does not set the manager's paused state to true, allowing new tasks to be added and processed.
   */
  public stopAllTasks(): void {
    // Do NOT set this.paused = true — stopping tasks is different from pausing
    // the manager. A stopped manager should still accept and process new tasks.
    this.tasks.forEach(task => task.stop());
    this.executionQueue = [];
  }

  /** Retrieves information about the current state of the execution queue and tasks.
   * @returns {IPollingQueueInfo} An object containing queue length, task states, and optional port queue stats.
   */
  public getQueueInfo(): IPollingQueueInfo {
    const portStats = this._queueStatsProvider?.();
    return {
      queueLength: this.executionQueue.length,
      tasks: this.executionQueue.map(task => ({
        id: task.id,
        state: task.getState(),
      })),
      portQueueLength: portStats?.queueLength,
      clientsCount: portStats?.clientsCount,
    };
  }

  /** Retrieves system-wide statistics about the polling manager and its tasks.
   * @returns {IPollingSystemStats} An object containing total tasks, queues, queued tasks, and optional port queue stats.
   */
  public getSystemStats(): IPollingSystemStats {
    const portStats = this._queueStatsProvider?.();
    return {
      totalTasks: this.tasks.size,
      totalQueues: 1,
      queuedTasks: this.executionQueue.length,
      portQueueLength: portStats?.queueLength,
      clientsCount: portStats?.clientsCount,
    };
  }

  /** Enqueues a task for execution based on its priority.
   * If the task is already in the queue, it will not be added again.
   * After enqueuing, the method triggers the processing of the execution queue.
   * @param {TaskController} task - The task to enqueue.
   */
  public enqueueTask(task: TaskController): void {
    if (!this.executionQueue.includes(task)) {
      this.executionQueue.push(task);
      this.executionQueue.sort((a, b) => b.priority - a.priority);
      this.logger.debug({ id: task.id, queueLen: this.executionQueue.length }, 'Enqueued');
    }
    this._processQueue();
  }

  /** Removes a task from the execution queue based on its ID.
   * If the task is not found in the queue, no action is taken.
   * @param {string} taskId - The ID of the task to remove from the queue.
   */
  public removeFromQueue(taskId: string): void {
    this.executionQueue = this.executionQueue.filter(t => t.id !== taskId);
  }

  /** Utility method to pause execution for a specified duration.
   * @param {number} ms - The duration to sleep in milliseconds.
   * @returns {Promise<void>} A promise that resolves after the specified duration.
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main queue processing loop.
   *
   * Strict mode (default): one task at a time, no mutex held while the task runs — the
   * session's port queue guarantees that exchanges never interleave, and manual requests
   * are not blocked by a whole polling cycle.
   */
  private async _processQueue(): Promise<void> {
    if (this.isProcessing || this.paused || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Process tasks in the queue until it's empty or the manager is paused.
      while (this.executionQueue.length > 0 && !this.paused) {
        const task = this.executionQueue.shift();
        if (!task) continue;

        const slaveId = this._getTaskSlaveId(task);

        this.logger.debug(
          { id: task.id, slaveId: slaveId ?? 'default' },
          'Processing task from queue'
        );

        try {
          if (this.config.concurrency === 'per-slave') {
            const mutex = this._getSlaveMutex(slaveId);
            await mutex.runExclusive(async () => {
              if (!task.stopped && !task.paused) {
                await task.execute();
              }
            });
          } else if (!task.stopped && !task.paused) {
            // Strict mode: the port queue serializes the actual exchanges, so the scheduler
            // must NOT keep one task (together with its whole retry budget and backoff
            // sleeps) in a blocking slot. Otherwise a single silent device monopolizes the
            // scheduler and starves every other device on the bus.
            // A task never overlaps with itself: TaskController schedules its next run only
            // after the current one finishes.
            void Promise.resolve(task.execute()).catch((runError: unknown) => {
              this.logger.error(
                { id: task.id, error: (runError as Error).message },
                'Task execution failed in queue'
              );
            });
          }
        } catch (taskError: unknown) {
          this.logger.error(
            { id: task.id, error: (taskError as Error).message },
            'Task execution failed in queue'
          );
        }

        if (this.config.interTaskDelay > 0 && this.executionQueue.length > 0) {
          await this._sleep(this.config.interTaskDelay);
        } else {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (criticalError: unknown) {
      this.logger.error(
        { error: (criticalError as Error).message },
        'Critical error in _processQueue loop'
      );
    } finally {
      this.isProcessing = false;
      if (this.executionQueue.length > 0 && !this.paused) {
        this._processQueue();
      }
    }
  }

  /**
   * Executes a function immediately with exclusive access using the default mutex.
   * This method is intended to be used by ModbusClient or other components
   * that need to ensure atomicity of read/write operations while polling is active.
   */
  public async executeImmediate<T>(fn: () => Promise<T>): Promise<T> {
    if (this._enqueueFn) {
      return this._submit<T>(fn, { immediate: true });
    }

    // Legacy standalone mode: no port queue is bound.
    const release = await this.defaultMutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Executes a function immediately for a specific slave with exclusive access using the slave's mutex.
   * This method is intended to be used by ModbusClient or other components
   * that need to ensure atomicity of read/write operations for a specific slave while polling is active.
   *
   * @param {string} slaveId - The ID of the slave for which to execute the function.
   * @param {() => Promise<T>} fn - The function to execute immediately.
   * @returns {Promise<T>} A promise that resolves with the result of the executed function.
   */
  public async executeImmediateForSlave<T>(slaveId: string, fn: () => Promise<T>): Promise<T> {
    if (this._enqueueFn) {
      return this._submit<T>(fn, { immediate: true });
    }

    const mutex = this._getSlaveMutex(slaveId);
    const release = await mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Sets the log level for the PollingManager and all its tasks.
   * @param {string} level - The log level to set (e.g., 'trace', 'debug', 'info', 'warn', 'error', 'fatal').
   */
  public setLogLevel(level: string): void {
    if (level === 'silent') {
      this.logger.settings.type = 'hidden';
      this.tasks.forEach(task => (task.logger.settings.type = 'hidden'));
      return;
    }
    const minLevel = (TSLOG_MIN_LEVEL as Record<string, DefaultLogLevels | undefined>)[level];
    if (minLevel !== undefined) {
      this.logger.settings.minLevel = minLevel;
      this.tasks.forEach(task => (task.logger.settings.minLevel = minLevel));
    }
  }

  /** Disables all loggers for the PollingManager and its tasks.
   * This method sets the log level to 'error' for the manager and all tasks, effectively silencing most log output.
   */
  public disableAllLoggers(): void {
    this.setLogLevel('error');
  }
}

export default PollingManager;
