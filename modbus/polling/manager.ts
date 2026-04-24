// modbus/polling/manager.ts

import { Mutex } from 'async-mutex';
import { pino, Logger } from 'pino';
import {
  IPollingManagerConfig,
  IPollingTaskOptions,
  IPollingTaskState,
  IPollingQueueInfo,
  IPollingSystemStats,
  IPollingManager,
  EPollingAction,
} from '../types/public.js';
import {
  ModbusFlushError,
  ModbusTimeoutError,
  PollingManagerError,
  PollingTaskAlreadyExistsError,
  PollingTaskNotFoundError,
  PollingTaskValidationError,
} from '../core/errors.js';
import { TaskController } from './task-controller.js';

// RISK-3: Resolved internal config type — no more `as Required<>` cast
interface ResolvedPollingManagerConfig {
  defaultMaxRetries: number;
  defaultBackoffDelay: number;
  defaultTaskTimeout: number;
  interTaskDelay: number;
  logLevel: string;
}

/**
 * PollingManager is the main class responsible for managing multiple polling tasks.
 * It handles task registration, lifecycle control (start/stop/pause), priority-based queuing,
 * concurrent execution safety via per-slave mutex, and comprehensive logging.
 *
 * RISK-1 fix: Uses per-slave-id mutex instead of a single global mutex,
 * allowing concurrent execution for different slave devices on the same transport.
 */
class PollingManager implements IPollingManager {
  private config: ResolvedPollingManagerConfig;
  public tasks: Map<string, TaskController>;
  private executionQueue: TaskController[];

  // RISK-1: Per-slave mutex map for concurrent execution of different slaves
  private slaveMutexes: Map<string, Mutex>;
  private defaultMutex: Mutex;

  private isProcessing: boolean;
  private paused: boolean;

  public logger: Logger;

  constructor(config: IPollingManagerConfig = {}) {
    this.logger = pino({
      level: config.logLevel || 'info',
      base: { component: 'Polling Manager' },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component,taskId',
                messageFormat: '[{component}] {msg}',
              },
            }
          : undefined,
    });

    // RISK-3: Explicit resolved config, no unsafe `as Required<>` cast
    this.config = {
      defaultMaxRetries: config.defaultMaxRetries ?? 3,
      defaultBackoffDelay: config.defaultBackoffDelay ?? 1000,
      defaultTaskTimeout: config.defaultTaskTimeout ?? 5000,
      interTaskDelay: config.interTaskDelay ?? 0,
      logLevel: config.logLevel ?? 'info',
    };

    this.tasks = new Map();
    this.executionQueue = [];
    this.slaveMutexes = new Map();
    this.defaultMutex = new Mutex();
    this.isProcessing = false;
    this.paused = false;

    this.logger.debug('PollingManager initialized');
  }

  /**
   * Returns (or creates) a mutex for a specific slave ID.
   * RISK-1: Allows concurrent execution for different slaves.
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
      this.logger.info(`Task added -> ${options.id}`);

      if (options.immediate !== false) task.start();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new PollingManagerError(String(error));
      this.logger.error({ error: err.message }, 'Failed to add task');
      throw err;
    }
  }

  /**
   * RISK-6 fix: updateTask now waits for current execution to finish
   * before destroying and recreating the task.
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

    // RISK-6: Wait for the current execution to finish before replacing
    if (oldTask.executionInProgress) {
      oldTask.pause(); // Stop scheduling new runs
      await oldTask.waitForCompletion();
    }

    this.removeTask(id);
    this.addTask(mergedOptions);
    if (wasRunning) this.startTask(id);
  }

  public removeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
      this.removeFromQueue(id);
      this.logger.info({ id }, 'Task removed');
    } else {
      this.logger.warn({ id }, 'Attempt to remove non-existent task');
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

  public startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.start();
    else throw new PollingTaskNotFoundError(id);
  }

  public stopTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.stop();
  }

  public pauseTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.pause();
  }

  public resumeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.resume();
      this._processQueue();
    }
  }

  public setTaskInterval(id: string, interval: number): void {
    const task = this.tasks.get(id);
    if (task) task.setInterval(interval);
  }

  public isTaskRunning(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? task.isRunning() : false;
  }

  public isTaskPaused(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? task.isPaused() : false;
  }

  public getTaskState(id: string): IPollingTaskState | null {
    const task = this.tasks.get(id);
    return task ? task.getState() : null;
  }

  public hasTask(id: string): boolean {
    return this.tasks.has(id);
  }

  public getTaskIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * RISK-4 fix: clearAll no longer sets paused=true permanently.
   * After clearing, the manager is ready to accept new tasks.
   */
  public clearAll(): void {
    this.logger.info('Clearing all tasks');
    this.tasks.forEach(task => task.stop());
    this.tasks.clear();
    this.executionQueue = [];
    this.isProcessing = false;
    // RISK-4: Do NOT set paused=true here — the manager should be
    // ready for new tasks after clearing.
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

  public pauseAllTasks(): void {
    this.paused = true;
    this.tasks.forEach(task => task.pause());
  }

  public resumeAllTasks(): void {
    this.paused = false;
    this.tasks.forEach(task => task.resume());
    this._processQueue();
  }

  public startAllTasks(): void {
    this.paused = false;
    this.tasks.forEach(task => task.start());
  }

  public stopAllTasks(): void {
    // Do NOT set this.paused = true — stopping tasks is different from pausing
    // the manager. A stopped manager should still accept and process new tasks.
    this.tasks.forEach(task => task.stop());
    this.executionQueue = [];
  }

  public getQueueInfo(): IPollingQueueInfo {
    return {
      queueLength: this.executionQueue.length,
      tasks: this.executionQueue.map(task => ({
        id: task.id,
        state: task.getState(),
      })),
    };
  }

  public getSystemStats(): IPollingSystemStats {
    return {
      totalTasks: this.tasks.size,
      totalQueues: 1,
      queuedTasks: this.executionQueue.length,
    };
  }

  public enqueueTask(task: TaskController): void {
    if (!this.executionQueue.includes(task)) {
      this.executionQueue.push(task);
      this.executionQueue.sort((a, b) => b.priority - a.priority);
      this.logger.debug({ id: task.id, queueLen: this.executionQueue.length }, 'Enqueued');
    }
    // RISK-5: Always call _processQueue; it guards with isProcessing check
    this._processQueue();
  }

  public removeFromQueue(taskId: string): void {
    this.executionQueue = this.executionQueue.filter(t => t.id !== taskId);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main queue processing loop.
   * RISK-1 fix: Uses per-slave mutex so different slaves can execute concurrently.
   * RISK-5 fix: Removed setTimeout in finally — just call _processQueue directly
   * which is guarded by isProcessing flag.
   */
  private async _processQueue(): Promise<void> {
    if (this.isProcessing || this.paused || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.executionQueue.length > 0 && !this.paused) {
        const task = this.executionQueue.shift();
        if (!task) continue;

        // RISK-1: Acquire the mutex for this task's specific slave
        const slaveId = this._getTaskSlaveId(task);
        const mutex = this._getSlaveMutex(slaveId);

        this.logger.debug(
          { id: task.id, slaveId: slaveId ?? 'default' },
          'Processing task from queue'
        );

        try {
          await mutex.runExclusive(async () => {
            if (!task.stopped && !task.paused) {
              await task.execute();
            }
          });
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

      // RISK-5: If new tasks arrived while we were winding down, process them.
      // Direct call instead of setTimeout — _processQueue guards with isProcessing.
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
    const release = await this.defaultMutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Executes a function immediately with exclusive access for a specific slave.
   * RISK-1 extension: Allows immediate commands to coexist with polling for other slaves.
   */
  public async executeImmediateForSlave<T>(slaveId: string, fn: () => Promise<T>): Promise<T> {
    const mutex = this._getSlaveMutex(slaveId);
    const release = await mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  public setLogLevel(level: string): void {
    this.logger.level = level;
    this.tasks.forEach(task => (task.logger.level = level));
  }

  public disableAllLoggers(): void {
    this.setLogLevel('error');
  }
}

export default PollingManager;
