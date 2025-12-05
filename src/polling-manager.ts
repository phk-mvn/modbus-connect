// src/polling-manager.ts
import { Mutex } from 'async-mutex';
import Logger from './logger.js';
import {
  LogLevel,
  LogContext,
  LoggerInstance,
  PollingManagerConfig,
  PollingTaskOptions,
  PollingTaskState,
  PollingTaskStats,
  PollingQueueInfo,
  PollingSystemStats,
} from './types/modbus-types.js';
import {
  ModbusFlushError,
  ModbusTimeoutError,
  PollingManagerError,
  PollingTaskAlreadyExistsError,
  PollingTaskNotFoundError,
  PollingTaskValidationError,
  ModbusCRCError,
  ModbusParityError,
  ModbusNoiseError,
  ModbusFramingError,
  ModbusOverrunError,
  ModbusCollisionError,
  ModbusConfigError,
  ModbusBaudRateError,
  ModbusSyncError,
  ModbusFrameBoundaryError,
  ModbusLRCError,
  ModbusChecksumError,
  ModbusDataConversionError,
  ModbusBufferOverflowError,
  ModbusBufferUnderrunError,
  ModbusMemoryError,
  ModbusStackOverflowError,
  ModbusResponseError,
  ModbusInvalidAddressError,
  ModbusInvalidFunctionCodeError,
  ModbusInvalidQuantityError,
  ModbusIllegalDataAddressError,
  ModbusIllegalDataValueError,
  ModbusSlaveBusyError,
  ModbusAcknowledgeError,
  ModbusSlaveDeviceFailureError,
  ModbusMalformedFrameError,
  ModbusInvalidFrameLengthError,
  ModbusInvalidTransactionIdError,
  ModbusUnexpectedFunctionCodeError,
  ModbusConnectionRefusedError,
  ModbusConnectionTimeoutError,
  ModbusNotConnectedError,
  ModbusAlreadyConnectedError,
  ModbusInsufficientDataError,
  ModbusGatewayPathUnavailableError,
  ModbusGatewayTargetDeviceError,
  ModbusInvalidStartingAddressError,
  ModbusMemoryParityError,
  ModbusBroadcastError,
  ModbusGatewayBusyError,
  ModbusDataOverrunError,
  ModbusTooManyEmptyReadsError,
  ModbusInterFrameTimeoutError,
  ModbusSilentIntervalError,
} from './errors.js';

/**
 * TaskController управляет логикой одной задачи.
 * Привязан к конкретному PollingManager.
 */
class TaskController {
  public id: string;
  public priority: number;
  public name: string | null;
  public fn: Array<() => Promise<unknown>>;
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

  public stats: PollingTaskStats;
  public logger: LoggerInstance;

  private manager: PollingManager;
  private timerId: NodeJS.Timeout | null = null;

  constructor(options: PollingTaskOptions, manager: PollingManager) {
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

    this.manager = manager;

    this.stats = {
      totalRuns: 0,
      totalErrors: 0,
      lastError: null,
      lastResult: null,
      lastRunTime: null,
      retries: 0,
      successes: 0,
      failures: 0,
    };

    this.logger = manager.loggerInstance.createLogger(`Task:${id}`);
    this.logger.setLevel('error');
    this.logger.debug('TaskController created', {
      id,
      priority,
      interval,
      maxRetries,
      backoffDelay,
      taskTimeout,
    } as LogContext);
  }

  start(): void {
    if (!this.stopped) {
      this.logger.debug('Task already running');
      return;
    }
    this.stopped = false;
    this.logger.info('Task started', { id: this.id } as LogContext);
    this.onStart?.();
    this._scheduleNextRun(true);
  }

  stop(): void {
    if (this.stopped) {
      this.logger.debug('Task already stopped', { id: this.id } as LogContext);
      return;
    }
    this.stopped = true;

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.manager.removeFromQueue(this.id);
    this.logger.info('Task stopped', { id: this.id } as LogContext);
    this.onStop?.();
  }

  pause(): void {
    if (this.paused) {
      this.logger.debug('Task already paused', { id: this.id } as LogContext);
      return;
    }
    this.paused = true;
    this.logger.info('Task paused', { id: this.id } as LogContext);
  }

  resume(): void {
    if (!this.stopped && this.paused) {
      this.paused = false;
      this.logger.info('Task resumed', { id: this.id } as LogContext);

      if (!this.timerId && !this.executionInProgress) {
        this._scheduleNextRun(true);
      }
    } else {
      this.logger.debug('Cannot resume task - not paused or stopped', {
        id: this.id,
      } as LogContext);
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
      this.manager.enqueueTask(this);
    }, delay);
  }

  async execute(): Promise<void> {
    if (this.stopped || this.paused) {
      this.logger.debug('Cannot execute - task is stopped or paused', {
        id: this.id,
      } as LogContext);
      this._scheduleNextRun();
      return;
    }

    if (this.shouldRun && !this.shouldRun()) {
      this.logger.debug('Task should not run according to shouldRun function', {
        id: this.id,
      } as LogContext);
      this._scheduleNextRun();
      return;
    }

    this.onBeforeEach?.();
    this.executionInProgress = true;
    this.stats.totalRuns++;
    this.logger.debug('Executing task', { id: this.id } as LogContext);

    try {
      let overallSuccess = false;
      const results: unknown[] = [];

      for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
        if (this.stopped) break;
        if (this.paused) break;

        let retryCount = 0;
        let result: unknown = null;
        let fnSuccess = false;

        while (!this.stopped && retryCount <= this.maxRetries) {
          if (this.paused) break;

          try {
            const fnToExecute = this.fn[fnIndex];
            if (typeof fnToExecute !== 'function') {
              throw new PollingManagerError(
                `Task ${this.id} fn at index ${fnIndex} is not a function`
              );
            }

            const promiseResult = fnToExecute();
            if (!(promiseResult instanceof Promise)) {
              throw new PollingManagerError(
                `Task ${this.id} fn ${fnIndex} did not return a Promise`
              );
            }

            result = await this._withTimeout(promiseResult, this.taskTimeout);
            fnSuccess = true;
            this.stats.successes++;
            this.stats.lastError = null;
            break;
          } catch (err: unknown) {
            const error = err instanceof Error ? err : new PollingManagerError(String(err));
            this._logSpecificError(error);
            retryCount++;
            this.stats.totalErrors++;
            this.stats.retries++;
            this.stats.lastError = error;
            this.onRetry?.(error, fnIndex, retryCount);

            if (retryCount > this.maxRetries) {
              this.stats.failures++;
              this.onFailure?.(error);
              this.onError?.(error, fnIndex, retryCount);
              this.logger.warn('Max retries exhausted for fn[' + fnIndex + ']', {
                id: this.id,
                fnIndex,
                retryCount,
                error: error.message,
              } as LogContext);
            } else {
              const isFlushedError = error instanceof ModbusFlushError;
              const baseDelay = isFlushedError
                ? 50
                : this.backoffDelay * Math.pow(2, retryCount - 1);
              const jitter = Math.random() * baseDelay * 0.5;
              const delay = baseDelay + jitter;

              this.logger.debug('Retrying fn[' + fnIndex + '] with delay', {
                id: this.id,
                delay,
                retryCount,
              } as LogContext);
              await this._sleep(delay);
            }
          }
        }

        results.push(result);
        overallSuccess = overallSuccess || fnSuccess;
      }

      this.stats.lastResult = results;
      this.stats.lastRunTime = Date.now();

      if (results.length > 0 && results.some(r => r !== null && r !== undefined)) {
        this.onData?.(results);
      }

      if (overallSuccess) {
        this.onSuccess?.(results);
      }

      this.onFinish?.(overallSuccess, results);

      this.logger.info('Task execution completed', {
        id: this.id,
        success: overallSuccess,
        resultsCount: results.length,
      } as LogContext);
    } catch (err: unknown) {
      this.logger.error('Fatal error during task execution cycle', {
        id: this.id,
        error: err instanceof Error ? err.message : String(err),
      } as LogContext);
    } finally {
      this.executionInProgress = false;
      this._scheduleNextRun();
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
    this.logger.info('Interval updated', { id: this.id, interval: ms } as LogContext);
  }

  public getState(): PollingTaskState {
    return {
      stopped: this.stopped,
      paused: this.paused,
      running: !this.stopped,
      inProgress: this.executionInProgress,
    };
  }

  public getStats(): PollingTaskStats {
    return { ...this.stats };
  }

  private _logSpecificError(error: Error): void {
    const logContext = { id: this.id, error: error.message } as LogContext;
    if (error instanceof ModbusTimeoutError) this.logger.error('Modbus timeout error', logContext);
    else if (error instanceof ModbusCRCError) this.logger.error('Modbus CRC error', logContext);
    else if (error instanceof ModbusParityError)
      this.logger.error('Modbus parity error', logContext);
    else if (error instanceof ModbusNoiseError) this.logger.error('Modbus noise error', logContext);
    else if (error instanceof ModbusFramingError)
      this.logger.error('Modbus framing error', logContext);
    else if (error instanceof ModbusOverrunError)
      this.logger.error('Modbus overrun error', logContext);
    else if (error instanceof ModbusCollisionError)
      this.logger.error('Modbus collision error', logContext);
    else if (error instanceof ModbusConfigError)
      this.logger.error('Modbus config error', logContext);
    else if (error instanceof ModbusBaudRateError)
      this.logger.error('Modbus baud rate error', logContext);
    else if (error instanceof ModbusSyncError) this.logger.error('Modbus sync error', logContext);
    else if (error instanceof ModbusFrameBoundaryError)
      this.logger.error('Modbus frame boundary error', logContext);
    else if (error instanceof ModbusLRCError) this.logger.error('Modbus LRC error', logContext);
    else if (error instanceof ModbusChecksumError)
      this.logger.error('Modbus checksum error', logContext);
    else if (error instanceof ModbusDataConversionError)
      this.logger.error('Modbus data conversion error', logContext);
    else if (error instanceof ModbusBufferOverflowError)
      this.logger.error('Modbus buffer overflow error', logContext);
    else if (error instanceof ModbusBufferUnderrunError)
      this.logger.error('Modbus buffer underrun error', logContext);
    else if (error instanceof ModbusMemoryError)
      this.logger.error('Modbus memory error', logContext);
    else if (error instanceof ModbusStackOverflowError)
      this.logger.error('Modbus stack overflow error', logContext);
    else if (error instanceof ModbusResponseError)
      this.logger.error('Modbus response error', logContext);
    else if (error instanceof ModbusInvalidAddressError)
      this.logger.error('Modbus invalid address error', logContext);
    else if (error instanceof ModbusInvalidFunctionCodeError)
      this.logger.error('Modbus invalid function code error', logContext);
    else if (error instanceof ModbusInvalidQuantityError)
      this.logger.error('Modbus invalid quantity error', logContext);
    else if (error instanceof ModbusIllegalDataAddressError)
      this.logger.error('Modbus illegal data address error', logContext);
    else if (error instanceof ModbusIllegalDataValueError)
      this.logger.error('Modbus illegal data value error', logContext);
    else if (error instanceof ModbusSlaveBusyError)
      this.logger.error('Modbus slave busy error', logContext);
    else if (error instanceof ModbusAcknowledgeError)
      this.logger.error('Modbus acknowledge error', logContext);
    else if (error instanceof ModbusSlaveDeviceFailureError)
      this.logger.error('Modbus slave device failure error', logContext);
    else if (error instanceof ModbusMalformedFrameError)
      this.logger.error('Modbus malformed frame error', logContext);
    else if (error instanceof ModbusInvalidFrameLengthError)
      this.logger.error('Modbus invalid frame length error', logContext);
    else if (error instanceof ModbusInvalidTransactionIdError)
      this.logger.error('Modbus invalid transaction ID error', logContext);
    else if (error instanceof ModbusUnexpectedFunctionCodeError)
      this.logger.error('Modbus unexpected function code error', logContext);
    else if (error instanceof ModbusConnectionRefusedError)
      this.logger.error('Modbus connection refused error', logContext);
    else if (error instanceof ModbusConnectionTimeoutError)
      this.logger.error('Modbus connection timeout error', logContext);
    else if (error instanceof ModbusNotConnectedError)
      this.logger.error('Modbus not connected error', logContext);
    else if (error instanceof ModbusAlreadyConnectedError)
      this.logger.error('Modbus already connected error', logContext);
    else if (error instanceof ModbusInsufficientDataError)
      this.logger.error('Modbus insufficient data error', logContext);
    else if (error instanceof ModbusGatewayPathUnavailableError)
      this.logger.error('Modbus gateway path unavailable error', logContext);
    else if (error instanceof ModbusGatewayTargetDeviceError)
      this.logger.error('Modbus gateway target device error', logContext);
    else if (error instanceof ModbusInvalidStartingAddressError)
      this.logger.error('Modbus invalid starting address error', logContext);
    else if (error instanceof ModbusMemoryParityError)
      this.logger.error('Modbus memory parity error', logContext);
    else if (error instanceof ModbusBroadcastError)
      this.logger.error('Modbus broadcast error', logContext);
    else if (error instanceof ModbusGatewayBusyError)
      this.logger.error('Modbus gateway busy error', logContext);
    else if (error instanceof ModbusDataOverrunError)
      this.logger.error('Modbus data overrun error', logContext);
    else if (error instanceof ModbusTooManyEmptyReadsError)
      this.logger.error('Modbus too many empty reads error', logContext);
    else if (error instanceof ModbusInterFrameTimeoutError)
      this.logger.error('Modbus inter-frame timeout error', logContext);
    else if (error instanceof ModbusSilentIntervalError)
      this.logger.error('Modbus silent interval error', logContext);
    else this.logger.error('Polling error', logContext);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private _withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new ModbusTimeoutError('Task timed out')), timeout);
      promise
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
}

/**
 * PollingManager
 */
class PollingManager {
  private config: Required<PollingManagerConfig>;
  public tasks: Map<string, TaskController>;
  private executionQueue: TaskController[];
  private mutex: Mutex;
  private isProcessing: boolean;
  private paused: boolean;

  public loggerInstance: Logger;
  public logger: LoggerInstance;

  constructor(config: PollingManagerConfig = {}, loggerInstance?: Logger) {
    this.config = {
      defaultMaxRetries: 3,
      defaultBackoffDelay: 1000,
      defaultTaskTimeout: 5000,
      logLevel: 'trace',
      ...config,
    } as Required<PollingManagerConfig>;

    this.tasks = new Map();
    this.executionQueue = [];
    this.mutex = new Mutex();
    this.isProcessing = false;
    this.paused = false;

    this.loggerInstance = loggerInstance || new Logger();
    if (!loggerInstance) {
      this.loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
      this.loggerInstance.setCustomFormatter('logger', (value: unknown) => {
        return value ? `[${value}]` : '';
      });
    }

    this.logger = this.loggerInstance.createLogger('PollingManager');
    this.logger.setLevel(this.config.logLevel as LogLevel);
    this.logger.info('PollingManager initialized', {
      config: JSON.stringify(this.config),
    } as LogContext);
  }

  private _validateTaskOptions(options: PollingTaskOptions): void {
    if (!options || typeof options !== 'object')
      throw new PollingTaskValidationError('Task options must be an object');
    if (!options.id) throw new PollingTaskValidationError('Task must have an "id"');
    if (typeof options.interval !== 'number' || options.interval <= 0)
      throw new PollingTaskValidationError('Interval must be a positive number');
    if (!options.fn || (!Array.isArray(options.fn) && typeof options.fn !== 'function'))
      throw new PollingTaskValidationError('fn must be a function or array of functions');
  }

  public addTask(options: PollingTaskOptions): void {
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
        this
      );

      this.tasks.set(options.id, task);

      if (options.immediate !== false) {
        task.start();
      }
      this.logger.info('Task added successfully', { id: options.id } as LogContext);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new PollingManagerError(String(error));
      this.logger.error('Failed to add task', { error: err.message } as LogContext);
      throw err;
    }
  }

  public updateTask(id: string, newOptions: Partial<PollingTaskOptions>): void {
    const oldTask = this.tasks.get(id);
    if (!oldTask) throw new PollingTaskNotFoundError(id);

    const oldOptions: PollingTaskOptions = {
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
      this.logger.info('Task removed', { id } as LogContext);
    } else {
      this.logger.warn('Attempt to remove non-existent task', { id } as LogContext);
    }
  }

  public restartTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      setTimeout(() => {
        const freshTask = this.tasks.get(id);
        if (freshTask) freshTask.start();
      }, 0);
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
    if (task) task.resume();
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

  public getTaskState(id: string): PollingTaskState | null {
    const task = this.tasks.get(id);
    return task ? task.getState() : null;
  }

  public getTaskStats(id: string): PollingTaskStats | null {
    const task = this.tasks.get(id);
    return task ? task.getStats() : null;
  }

  public hasTask(id: string): boolean {
    return this.tasks.has(id);
  }

  public getTaskIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  public clearAll(): void {
    this.logger.info('Clearing all tasks');
    this.paused = true;
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
    this.executionQueue = [];
    this.logger.info('All tasks cleared');
  }

  public restartAllTasks(): void {
    for (const id of this.tasks.keys()) {
      this.restartTask(id);
    }
  }

  public pauseAllTasks(): void {
    this.paused = true;
    for (const task of this.tasks.values()) {
      task.pause();
    }
  }

  public resumeAllTasks(): void {
    this.paused = false;
    for (const task of this.tasks.values()) {
      task.resume();
    }
    this._processQueue();
  }

  public startAllTasks(): void {
    this.paused = false;
    for (const task of this.tasks.values()) {
      task.start();
    }
  }

  public stopAllTasks(): void {
    this.paused = true;
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.executionQueue = [];
  }

  public getAllTaskStats(): Record<string, PollingTaskStats> {
    const stats: Record<string, PollingTaskStats> = {};
    for (const [id, task] of this.tasks.entries()) {
      stats[id] = task.getStats();
    }
    return stats;
  }

  public getQueueInfo(): PollingQueueInfo {
    return {
      queueLength: this.executionQueue.length,
      tasks: this.executionQueue.map(task => ({
        id: task.id,
        state: task.getState(),
      })),
    };
  }

  public getSystemStats(): PollingSystemStats {
    return {
      totalTasks: this.tasks.size,
      totalQueues: 1,
      queuedTasks: this.executionQueue.length,
      tasks: this.getAllTaskStats(),
    };
  }

  public enqueueTask(task: TaskController): void {
    if (!this.executionQueue.includes(task)) {
      this.executionQueue.push(task);
      this.executionQueue.sort((a, b) => b.priority - a.priority);
      this.logger.debug('Task enqueued', {
        id: task.id,
        queueLen: this.executionQueue.length,
      } as LogContext);
      this._processQueue();
    }
  }

  public removeFromQueue(taskId: string): void {
    this.executionQueue = this.executionQueue.filter(t => t.id !== taskId);
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Основной цикл обработки очереди.
   */
  private async _processQueue(): Promise<void> {
    if (this.isProcessing || this.paused || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.executionQueue.length > 0 && !this.paused) {
        const task = this.executionQueue[0];

        if (task) {
          this.executionQueue.shift();

          this.logger.debug('Processing task from queue', { id: task.id } as LogContext);

          await this._sleep(30);

          await task.execute();
        }

        await this._sleep(10);
      }
    } catch (error: unknown) {
      this.logger.error('Critical error in processQueue loop', {
        error: error instanceof Error ? error.message : String(error),
      } as LogContext);
    } finally {
      this.isProcessing = false;
      if (this.executionQueue.length > 0 && !this.paused) {
        setTimeout(() => this._processQueue(), 0);
      }
    }
  }

  /**
   * Выполняет функцию с захватом мьютекса.
   * Используется ModbusClient для обеспечения атомарности операций чтения/записи.
   */
  public async executeImmediate<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
      // this._processQueue();
    }
  }

  // === Логгеры ===
  public enablePollingManagerLogger(level: LogLevel = 'info'): void {
    this.logger.setLevel(level);
  }
  public disablePollingManagerLogger(): void {
    this.logger.setLevel('error');
  }
  public enableTaskControllerLoggers(level: LogLevel = 'info'): void {
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
  public disableTaskControllerLoggers(): void {
    for (const task of this.tasks.values()) {
      task.logger.setLevel('error');
    }
  }
  public enableTaskControllerLogger(taskId: string, level: LogLevel = 'info'): void {
    this.tasks.get(taskId)?.logger.setLevel(level);
  }
  public disableTaskControllerLogger(taskId: string): void {
    this.tasks.get(taskId)?.logger.setLevel('error');
  }
  public enableAllLoggers(level: LogLevel = 'info'): void {
    this.enablePollingManagerLogger(level);
    this.enableTaskControllerLoggers(level);
  }
  public disableAllLoggers(): void {
    this.disablePollingManagerLogger();
    this.disableTaskControllerLoggers();
  }
  public setLogLevelForAll(level: LogLevel): void {
    this.logger.setLevel(level);
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
}

export = PollingManager;
