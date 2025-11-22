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

// function hasTransportProperty(obj: unknown): obj is { transport: unknown } {
//   return typeof obj === 'object' && obj !== null && 'transport' in obj;
// }

// function hasFlushMethod(obj: unknown): obj is { flush: () => Promise<void> } {
//   return (
//     typeof obj === 'object' &&
//     obj !== null &&
//     'flush' in obj &&
//     typeof (obj as { flush: unknown }).flush === 'function'
//   );
// }

/**
 * TaskController управляет логикой одной задачи.
 */
class TaskController {
  public id: string;
  public resourceId?: string;
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
  public loopRunning: boolean;
  public executionInProgress: boolean;
  public stats: PollingTaskStats;
  private transportMutex: Mutex;
  public logger: LoggerInstance;
  private pollingManager: PollingManager;

  constructor(options: PollingTaskOptions, pollingManager: PollingManager) {
    const {
      id,
      resourceId,
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
    this.resourceId = resourceId;
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
    this.loopRunning = false;
    this.executionInProgress = false;
    this.pollingManager = pollingManager;
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
    this.transportMutex = new Mutex();
    this.logger = pollingManager.loggerInstance.createLogger('TaskController');
    this.logger.setLevel('error');
    this.logger.debug('TaskController created', {
      id,
      resourceId: resourceId || undefined,
      priority,
      interval,
      maxRetries,
      backoffDelay,
      taskTimeout,
    } as LogContext);
  }

  /**
   * Запускает задачу.
   */
  async start(): Promise<void> {
    if (!this.stopped) {
      this.logger.debug('Task already running');
      return;
    }
    this.stopped = false;
    this.loopRunning = true;
    this.logger.info('Task started', { id: this.id } as LogContext);
    this.onStart?.();

    if (this.resourceId) {
      this.scheduleRun();
    } else {
      this._runLoop();
    }
  }

  /**
   * Останавливает задачу.
   */
  stop(): void {
    if (this.stopped) {
      this.logger.debug('Task already stopped', { id: this.id } as LogContext);
      return;
    }
    this.stopped = true;
    this.loopRunning = false;
    this.logger.info('Task stopped', { id: this.id } as LogContext);
    this.onStop?.();
  }

  /**
   * Ставит задачу на паузу.
   */
  pause(): void {
    if (this.paused) {
      this.logger.debug('Task already paused', { id: this.id } as LogContext);
      return;
    }
    this.paused = true;
    this.logger.info('Task paused', { id: this.id } as LogContext);
  }

  /**
   * Возобновляет задачу.
   */
  resume(): void {
    if (!this.stopped && this.paused) {
      this.paused = false;
      this.logger.info('Task resumed', { id: this.id } as LogContext);
      this.scheduleRun();
    } else {
      this.logger.debug('Cannot resume task - not paused or stopped', {
        id: this.id,
      } as LogContext);
    }
  }

  /**
   * Планирует запуск задачи.
   */
  scheduleRun(): void {
    if (this.stopped) {
      this.logger.debug('Cannot schedule run - task is stopped', { id: this.id } as LogContext);
      return;
    }
    if (this.resourceId && this.pollingManager.queues.has(this.resourceId)) {
      const queue = this.pollingManager.queues.get(this.resourceId);
      queue?.markTaskReady(this);
    } else if (!this.resourceId) {
      if (this.stopped) {
        this.start();
      } else if (!this.loopRunning) {
        this.loopRunning = true;
        this._runLoop();
      }
    }
  }

  /**
   * Выполняет задачу один раз. Используется для задач с resourceId.
   * @returns {Promise<void>}
   */
  async executeOnce(): Promise<void> {
    if (this.stopped || this.paused) {
      this.logger.debug('Cannot execute - task is stopped or paused', {
        id: this.id,
      } as LogContext);
      return;
    }
    if (this.shouldRun && !this.shouldRun()) {
      this.logger.debug('Task should not run according to shouldRun function', {
        id: this.id,
      } as LogContext);
      this._scheduleNextRun();
      return;
    }

    await this._performExecution();
    this._scheduleNextRun();
  }

  /**
   * Единая логика выполнения задачи, обработки ошибок и повторов.
   * @private
   */
  private async _performExecution(): Promise<void> {
    this.onBeforeEach?.();
    this.executionInProgress = true;
    this.stats.totalRuns++;
    this.logger.debug('Executing task', { id: this.id } as LogContext);

    const release = await this.transportMutex.acquire();
    try {
      // const firstFunction = this.fn[0];
      // if (firstFunction && typeof firstFunction === 'function') {
      //   const result = firstFunction();
      //   if (result && hasTransportProperty(result) && result.transport) {
      //     if (hasFlushMethod(result.transport)) {
      //       try {
      //         await result.transport.flush();
      //         this.logger.debug('Transport flushed successfully', { id: this.id } as LogContext);
      //       } catch (flushErr: unknown) {
      //         const error =
      //           flushErr instanceof Error ? flushErr : new PollingManagerError(String(flushErr));
      //         this.logger.warn('Flush failed', { id: this.id, error: error.message } as LogContext);
      //       }
      //     }
      //   }
      // }

      let overallSuccess = false;
      const results: unknown[] = [];

      for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
        let retryCount = 0;
        let result: unknown = null;
        let fnSuccess = false;

        while (!this.stopped && retryCount <= this.maxRetries) {
          if (this.paused) {
            this.logger.debug('Task paused during execution', { id: this.id } as LogContext);
            this.executionInProgress = false;
            return;
          }

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
        this.logger.debug('Data callback executed', {
          id: this.id,
          resultsCount: results.length,
        } as LogContext);
      } else {
        this.logger.warn('Skipping onData - all results invalid', {
          id: this.id,
          results: 'invalid',
        } as LogContext);
      }
      this.onFinish?.(overallSuccess, results);
      this.logger.info('Task execution completed', {
        id: this.id,
        success: overallSuccess,
        resultsCount: results.length,
      } as LogContext);
      this.pollingManager.loggerInstance.flush();
    } finally {
      release();
      this.executionInProgress = false;
    }
  }

  /**
   * Планирует следующий запуск задачи.
   * @private
   */
  private _scheduleNextRun(): void {
    if (this.stopped) return;

    const scheduleFn = () => {
      if (this.stopped) return;
      if (this.resourceId) {
        this.logger.debug('Scheduling next run (queued)', { id: this.id } as LogContext);
        this.scheduleRun();
      } else if (this.loopRunning) {
        this.logger.debug('Scheduling next run (loop)', { id: this.id } as LogContext);
      }
    };

    setTimeout(scheduleFn, this.interval);
  }

  /**
   * Проверяет, запущена ли задача.
   */
  public isRunning(): boolean {
    return !this.stopped;
  }

  /**
   * Проверяет, приостановлена ли задача.
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Устанавливает интервал задачи.
   */
  public setInterval(ms: number): void {
    this.interval = ms;
    this.logger.info('Interval updated', { id: this.id, interval: ms } as LogContext);
  }

  /**
   * Возвращает состояние задачи.
   */
  public getState(): PollingTaskState {
    return {
      stopped: this.stopped,
      paused: this.paused,
      running: this.loopRunning,
      inProgress: this.executionInProgress,
    };
  }

  /**
   * Возвращает статистику задачи.
   */
  public getStats(): PollingTaskStats {
    return { ...this.stats };
  }

  /**
   * Цикл выполнения для задач без resourceId.
   * @private
   */
  private async _runLoop(): Promise<void> {
    this.logger.info('Starting run loop', { id: this.id } as LogContext);
    while (this.loopRunning && !this.stopped) {
      if (this.paused) {
        this.logger.debug('Task paused in loop', { id: this.id } as LogContext);
        await this._sleep(this.interval);
        continue;
      }
      if (this.shouldRun && !this.shouldRun()) {
        this.logger.debug('Task should not run according to shouldRun function', {
          id: this.id,
        } as LogContext);
        await this._sleep(this.interval);
        continue;
      }

      await this._performExecution();

      if (this.loopRunning && !this.stopped) {
        await this._sleep(this.interval);
      }
    }
    this.loopRunning = false;
    this.logger.debug('Run loop finished', { id: this.id } as LogContext);
  }

  /**
   * Инкапсулирует логирование специфичных ошибок Modbus для чистоты кода.
   * @param {Error} error - Ошибка для логирования.
   * @private
   */
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
  }

  /**
   * Sleeps for given amount of milliseconds.
   * @param {number} ms
   * @private
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wraps a promise with a timeout.
   * @param {Promise} promise
   * @param {number} timeout
   * @private
   */
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
 * TaskQueue управляет очередью задач для конкретного ресурса.
 */
class TaskQueue {
  public resourceId: string;
  private pollingManager: PollingManager;
  private queuedOrProcessingTasks: Set<string>;
  public taskQueue: string[];
  private mutex: Mutex;
  private processing: boolean;
  public logger: LoggerInstance;

  constructor(
    resourceId: string,
    pollingManager: PollingManager,
    taskSet: Set<string>,
    loggerInstance: Logger
  ) {
    this.resourceId = resourceId;
    this.pollingManager = pollingManager;
    this.queuedOrProcessingTasks = taskSet;
    this.taskQueue = [];
    this.mutex = new Mutex();
    this.processing = false;
    this.logger = loggerInstance.createLogger('TaskQueue');
    this.logger.setLevel('error');
  }

  /**
   * Добавляет задачу в очередь на обработку.
   * @param {TaskController} taskController
   */
  public enqueue(taskController: TaskController): void {
    if (!taskController.stopped && taskController.resourceId === this.resourceId) {
      const taskKey = `${this.resourceId}:${taskController.id}`;
      if (!this.queuedOrProcessingTasks.has(taskKey)) {
        this.queuedOrProcessingTasks.add(taskKey);
        this.taskQueue.push(taskController.id);
        this.logger.debug('Task enqueued', { taskId: taskController.id } as LogContext);
        this._processNext();
      } else {
        this.logger.debug('Task already queued', { taskId: taskController.id } as LogContext);
      }
    }
  }

  /**
   * Удаляет задачу из очереди.
   * @param {string} taskId
   */
  public removeTask(taskId: string): void {
    const taskKey = `${this.resourceId}:${taskId}`;
    this.queuedOrProcessingTasks.delete(taskKey);
    this.taskQueue = this.taskQueue.filter(id => id !== taskId);
    this.logger.debug('Task removed from queue', { taskId } as LogContext);
  }

  /**
   * Проверяет, пуста ли очередь.
   * @returns {boolean}
   */
  public isEmpty(): boolean {
    return this.taskQueue.length === 0;
  }

  /**
   * Очищает очередь.
   */
  public clear(): void {
    for (const taskId of this.taskQueue) {
      const taskKey = `${this.resourceId}:${taskId}`;
      this.queuedOrProcessingTasks.delete(taskKey);
    }
    this.taskQueue = [];
    this.logger.debug('Queue cleared', { resourceId: this.resourceId } as LogContext);
  }

  /**
   * Сообщает очереди, что задача готова к следующему запуску.
   * @param {TaskController} taskController
   */
  public markTaskReady(taskController: TaskController): void {
    if (!taskController.stopped && taskController.resourceId === this.resourceId) {
      const taskKey = `${this.resourceId}:${taskController.id}`;
      if (!this.queuedOrProcessingTasks.has(taskKey)) {
        this.queuedOrProcessingTasks.add(taskKey);
        this.taskQueue.push(taskController.id);
        this.logger.debug('Task marked as ready', { taskId: taskController.id } as LogContext);
        this._processNext();
      }
    }
  }

  /**
   * Обрабатывает очередь задач.
   * @private
   */
  private async _processNext(): Promise<void> {
    if (this.processing || this.taskQueue.length === 0) {
      if (this.taskQueue.length === 0) {
        this.logger.debug('Queue is empty', { resourceId: this.resourceId } as LogContext);
      }
      return;
    }
    this.processing = true;
    this.logger.debug('Acquiring mutex for task processing', {
      resourceId: this.resourceId,
    } as LogContext);

    const release = await this.mutex.acquire();
    let taskKey: string | null = null;
    try {
      const taskId = this.taskQueue.shift();
      if (!taskId) return;

      taskKey = `${this.resourceId}:${taskId}`;
      this.logger.debug('Processing task', { taskId } as LogContext);
      const taskController = this.pollingManager.tasks.get(taskId);

      if (!taskController || taskController.stopped) {
        this.logger.debug('Task is stopped or does not exist', { taskId } as LogContext);
        this.queuedOrProcessingTasks.delete(taskKey);
        if (this.taskQueue.length > 0) {
          setTimeout(() => {
            this.processing = false;
            this._processNext();
          }, 0);
        }
        return;
      }
      await this.pollingManager._executeQueuedTask(taskController);
      this.logger.debug('Task executed successfully', { taskId } as LogContext);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new PollingManagerError(String(error));
      this._logSpecificError(err);
      this.logger.error('Error executing task in queue', {
        resourceId: this.resourceId,
        error: err.message,
      } as LogContext);
    } finally {
      release();
      if (taskKey) {
        this.queuedOrProcessingTasks.delete(taskKey);
      }
      this.processing = false;
      if (this.taskQueue.length > 0) {
        setTimeout(() => this._processNext(), 0);
      }
    }
  }

  /**
   * Инкапсулирует логирование специфичных ошибок Modbus для чистоты кода.
   * @param {Error} error - Ошибка для логирования.
   * @private
   */
  private _logSpecificError(error: Error): void {
    const logContext = { resourceId: this.resourceId, error: error.message } as LogContext;
    if (error instanceof ModbusTimeoutError)
      this.logger.error('Modbus timeout error in queue processing', logContext);
    else if (error instanceof ModbusCRCError)
      this.logger.error('Modbus CRC error in queue processing', logContext);
    else if (error instanceof ModbusParityError)
      this.logger.error('Modbus parity error in queue processing', logContext);
    else if (error instanceof ModbusNoiseError)
      this.logger.error('Modbus noise error in queue processing', logContext);
    else if (error instanceof ModbusFramingError)
      this.logger.error('Modbus framing error in queue processing', logContext);
    else if (error instanceof ModbusOverrunError)
      this.logger.error('Modbus overrun error in queue processing', logContext);
    else if (error instanceof ModbusCollisionError)
      this.logger.error('Modbus collision error in queue processing', logContext);
    else if (error instanceof ModbusConfigError)
      this.logger.error('Modbus config error in queue processing', logContext);
    else if (error instanceof ModbusBaudRateError)
      this.logger.error('Modbus baud rate error in queue processing', logContext);
    else if (error instanceof ModbusSyncError)
      this.logger.error('Modbus sync error in queue processing', logContext);
    else if (error instanceof ModbusFrameBoundaryError)
      this.logger.error('Modbus frame boundary error in queue processing', logContext);
    else if (error instanceof ModbusLRCError)
      this.logger.error('Modbus LRC error in queue processing', logContext);
    else if (error instanceof ModbusChecksumError)
      this.logger.error('Modbus checksum error in queue processing', logContext);
    else if (error instanceof ModbusDataConversionError)
      this.logger.error('Modbus data conversion error in queue processing', logContext);
    else if (error instanceof ModbusBufferOverflowError)
      this.logger.error('Modbus buffer overflow error in queue processing', logContext);
    else if (error instanceof ModbusBufferUnderrunError)
      this.logger.error('Modbus buffer underrun error in queue processing', logContext);
    else if (error instanceof ModbusMemoryError)
      this.logger.error('Modbus memory error in queue processing', logContext);
    else if (error instanceof ModbusStackOverflowError)
      this.logger.error('Modbus stack overflow error in queue processing', logContext);
    else if (error instanceof ModbusResponseError)
      this.logger.error('Modbus response error in queue processing', logContext);
    else if (error instanceof ModbusInvalidAddressError)
      this.logger.error('Modbus invalid address error in queue processing', logContext);
    else if (error instanceof ModbusInvalidFunctionCodeError)
      this.logger.error('Modbus invalid function code error in queue processing', logContext);
    else if (error instanceof ModbusInvalidQuantityError)
      this.logger.error('Modbus invalid quantity error in queue processing', logContext);
    else if (error instanceof ModbusIllegalDataAddressError)
      this.logger.error('Modbus illegal data address error in queue processing', logContext);
    else if (error instanceof ModbusIllegalDataValueError)
      this.logger.error('Modbus illegal data value error in queue processing', logContext);
    else if (error instanceof ModbusSlaveBusyError)
      this.logger.error('Modbus slave busy error in queue processing', logContext);
    else if (error instanceof ModbusAcknowledgeError)
      this.logger.error('Modbus acknowledge error in queue processing', logContext);
    else if (error instanceof ModbusSlaveDeviceFailureError)
      this.logger.error('Modbus slave device failure error in queue processing', logContext);
    else if (error instanceof ModbusMalformedFrameError)
      this.logger.error('Modbus malformed frame error in queue processing', logContext);
    else if (error instanceof ModbusInvalidFrameLengthError)
      this.logger.error('Modbus invalid frame length error in queue processing', logContext);
    else if (error instanceof ModbusInvalidTransactionIdError)
      this.logger.error('Modbus invalid transaction ID error in queue processing', logContext);
    else if (error instanceof ModbusUnexpectedFunctionCodeError)
      this.logger.error('Modbus unexpected function code error in queue processing', logContext);
    else if (error instanceof ModbusConnectionRefusedError)
      this.logger.error('Modbus connection refused error in queue processing', logContext);
    else if (error instanceof ModbusConnectionTimeoutError)
      this.logger.error('Modbus connection timeout error in queue processing', logContext);
    else if (error instanceof ModbusNotConnectedError)
      this.logger.error('Modbus not connected error in queue processing', logContext);
    else if (error instanceof ModbusAlreadyConnectedError)
      this.logger.error('Modbus already connected error in queue processing', logContext);
    else if (error instanceof ModbusInsufficientDataError)
      this.logger.error('Modbus insufficient data error in queue processing', logContext);
    else if (error instanceof ModbusGatewayPathUnavailableError)
      this.logger.error('Modbus gateway path unavailable error in queue processing', logContext);
    else if (error instanceof ModbusGatewayTargetDeviceError)
      this.logger.error('Modbus gateway target device error in queue processing', logContext);
    else if (error instanceof ModbusInvalidStartingAddressError)
      this.logger.error('Modbus invalid starting address error in queue processing', logContext);
    else if (error instanceof ModbusMemoryParityError)
      this.logger.error('Modbus memory parity error in queue processing', logContext);
    else if (error instanceof ModbusBroadcastError)
      this.logger.error('Modbus broadcast error in queue processing', logContext);
    else if (error instanceof ModbusGatewayBusyError)
      this.logger.error('Modbus gateway busy error in queue processing', logContext);
    else if (error instanceof ModbusDataOverrunError)
      this.logger.error('Modbus data overrun error in queue processing', logContext);
    else if (error instanceof ModbusTooManyEmptyReadsError)
      this.logger.error('Modbus too many empty reads error in queue processing', logContext);
    else if (error instanceof ModbusInterFrameTimeoutError)
      this.logger.error('Modbus inter-frame timeout error in queue processing', logContext);
    else if (error instanceof ModbusSilentIntervalError)
      this.logger.error('Modbus silent interval error in queue processing', logContext);
  }
}

/**
 * PollingManager управляет набором задач и очередями для ресурсов.
 */
class PollingManager {
  private config: Required<PollingManagerConfig>;
  public tasks: Map<string, TaskController>;
  public queues: Map<string, TaskQueue>;
  private queuedOrProcessingTasks: Set<string>;
  public loggerInstance: Logger;
  public logger: LoggerInstance;

  constructor(config: PollingManagerConfig = {}) {
    this.config = {
      defaultMaxRetries: 3,
      defaultBackoffDelay: 1000,
      defaultTaskTimeout: 5000,
      logLevel: 'trace',
      ...config,
    } as Required<PollingManagerConfig>;

    this.tasks = new Map();
    this.queues = new Map();
    this.queuedOrProcessingTasks = new Set();
    this.loggerInstance = new Logger();
    this.loggerInstance.setLogFormat(['timestamp', 'level', 'logger']);
    this.loggerInstance.setCustomFormatter('logger', (value: unknown) => {
      return value ? `[${value}]` : '';
    });
    this.logger = this.loggerInstance.createLogger('PollingManager');
    this.logger.setLevel('error');
    this.logger.info('PollingManager initialized', {
      config: JSON.stringify(this.config),
    } as LogContext);
    this.loggerInstance.flush();
  }

  /**
   * Валидирует опции задачи
   * @param {Object} options - Опции задачи
   * @private
   */
  private _validateTaskOptions(options: PollingTaskOptions): void {
    if (!options || typeof options !== 'object') {
      throw new PollingTaskValidationError('Task options must be an object');
    }
    if (!options.id) {
      throw new PollingTaskValidationError('Task must have an "id"');
    }
    if (
      options.interval === undefined ||
      typeof options.interval !== 'number' ||
      options.interval <= 0
    ) {
      throw new PollingTaskValidationError('Interval must be a positive number');
    }
    if (
      options.fn === undefined ||
      (!Array.isArray(options.fn) && typeof options.fn !== 'function')
    ) {
      throw new PollingTaskValidationError('fn must be a function or array of functions');
    }
    if (
      options.maxRetries !== undefined &&
      (typeof options.maxRetries !== 'number' || options.maxRetries < 0)
    ) {
      throw new PollingTaskValidationError('maxRetries must be a non-negative number');
    }
    if (
      options.backoffDelay !== undefined &&
      (typeof options.backoffDelay !== 'number' || options.backoffDelay <= 0)
    ) {
      throw new PollingTaskValidationError('backoffDelay must be a positive number');
    }
    if (
      options.taskTimeout !== undefined &&
      (typeof options.taskTimeout !== 'number' || options.taskTimeout <= 0)
    ) {
      throw new PollingTaskValidationError('taskTimeout must be a positive number');
    }
  }

  /**
   * Добавляет новую задачу в менеджер.
   * @param {PollingTaskOptions} options - Опции задачи
   */
  public addTask(options: PollingTaskOptions): void {
    try {
      this._validateTaskOptions(options);
      const { id, resourceId } = options;
      if (this.tasks.has(id)) {
        const error = new PollingTaskAlreadyExistsError(id);
        this.logger.error('Failed to add task - already exists', {
          id,
          error: error.message,
        } as LogContext);
        throw error;
      }

      this.logger.trace('Creating TaskController', { id, resourceId } as LogContext);
      const controller = new TaskController(options, this);
      this.tasks.set(id, controller);

      if (resourceId) {
        if (!this.queues.has(resourceId)) {
          this.logger.debug('Creating new TaskQueue', { resourceId } as LogContext);
          this.queues.set(
            resourceId,
            new TaskQueue(resourceId, this, this.queuedOrProcessingTasks, this.loggerInstance)
          );
        }
      }

      if (options.immediate) {
        if (resourceId) {
          controller.scheduleRun();
        } else {
          controller.start();
        }
      }

      this.logger.info('Task added successfully', {
        id,
        resourceId,
        immediate: options.immediate,
      } as LogContext);
      this.loggerInstance.flush();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new PollingManagerError(String(error));
      this.logger.error('Failed to add task', {
        error: err.message,
        options: JSON.stringify(options, null, 2),
      } as LogContext);
      this.loggerInstance.flush();
      throw err;
    }
  }

  /**
   * Обновляет задачу новыми опциями.
   * @param {string} id - Идентификатор задачи
   * @param {Object} newOptions - Новые опции задачи
   */
  public updateTask(id: string, newOptions: Partial<PollingTaskOptions>): void {
    const oldTask = this.tasks.get(id);
    if (!oldTask) {
      const error = new PollingTaskNotFoundError(id);
      this.logger.error('Failed to update task - not found', {
        id,
        error: error.message,
      } as LogContext);
      throw error;
    }

    const oldOptions: PollingTaskOptions = {
      id: oldTask.id,
      resourceId: oldTask.resourceId,
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

    this.logger.info('Updating task', { id, newOptions: JSON.stringify(newOptions) } as LogContext);

    const wasRunning = oldTask.isRunning();
    this.removeTask(id);
    this.addTask(mergedOptions);

    if (wasRunning) {
      this.startTask(id);
    }
  }

  /**
   * Удаляет задачу из менеджера и очереди.
   * @param {string} id - Идентификатор задачи
   */
  public removeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      const resourceId = task.resourceId;
      if (resourceId && this.queues.has(resourceId)) {
        this.queues.get(resourceId)?.removeTask(id);
        if (this.queues.get(resourceId)?.isEmpty()) {
          this.queues.delete(resourceId);
          this.logger.debug('Queue removed - empty', { resourceId } as LogContext);
        }
      }
      this.tasks.delete(id);
      this.logger.info('Task removed', { id, resourceId } as LogContext);
    } else {
      this.logger.warn('Attempt to remove non-existent task', { id } as LogContext);
    }
  }

  /**
   * Перезапускает задачу.
   * @param {string} id - Идентификатор задачи
   */
  public restartTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Restarting task', { id } as LogContext);
      task.stop();
      setTimeout(() => {
        const freshTask = this.tasks.get(id);
        if (freshTask) {
          if (freshTask.resourceId) {
            freshTask.scheduleRun();
          } else {
            freshTask.start();
          }
        }
      }, 0);
    } else {
      this.logger.warn('Attempt to restart non-existent task', { id } as LogContext);
    }
  }

  /**
   * Запускает задачу.
   * @param {string} id - Идентификатор задачи
   */
  public startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Starting task', { id } as LogContext);
      task.start();
    } else {
      throw new PollingTaskNotFoundError(id);
    }
  }

  /**
   * Останавливает задачу.
   * @param {string} id - Идентификатор задачи
   */
  public stopTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Stopping task', { id } as LogContext);
      task.stop();
    } else {
      this.logger.warn('Attempt to stop non-existent task', { id } as LogContext);
    }
  }

  /**
   * Ставит задачу на паузу.
   * @param {string} id - Идентификатор задачи
   */
  public pauseTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Pausing task', { id } as LogContext);
      task.pause();
    } else {
      this.logger.warn('Attempt to pause non-existent task', { id } as LogContext);
    }
  }

  /**
   * Возобновляет задачу.
   * @param {string} id - Идентификатор задачи
   */
  public resumeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Resuming task', { id } as LogContext);
      task.resume();
    } else {
      this.logger.warn('Attempt to resume non-existent task', { id } as LogContext);
    }
  }

  /**
   * Обновляет интервал задачи.
   * @param {string} id - Идентификатор задачи
   * @param {number} interval - Новый интервал
   */
  public setTaskInterval(id: string, interval: number): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Setting task interval', { id, interval } as LogContext);
      task.setInterval(interval);
    } else {
      this.logger.warn('Attempt to set interval for non-existent task', { id } as LogContext);
    }
  }

  /**
   * Проверяет, запущена ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  public isTaskRunning(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? task.isRunning() : false;
  }

  /**
   * Проверяет, приостановлена ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  public isTaskPaused(id: string): boolean {
    const task = this.tasks.get(id);
    return task ? task.isPaused() : false;
  }

  /**
   * Получает состояние задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {PollingTaskState | null}
   */
  public getTaskState(id: string): PollingTaskState | null {
    const task = this.tasks.get(id);
    return task ? task.getState() : null;
  }

  /**
   * Получает статистику задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {PollingTaskStats | null}
   */
  public getTaskStats(id: string): PollingTaskStats | null {
    const task = this.tasks.get(id);
    return task ? task.getStats() : null;
  }

  /**
   * Проверяет, существует ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  public hasTask(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * Возвращает массив ID всех задач.
   * @returns {string[]}
   */
  public getTaskIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Очищает все задачи.
   */
  public clearAll(): void {
    this.logger.info('Clearing all tasks');
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
    for (const queue of this.queues.values()) {
      queue.clear();
    }
    this.queues.clear();
    this.queuedOrProcessingTasks.clear();
    this.logger.info('All tasks cleared');
  }

  /**
   * Перезапускает все задачи.
   */
  public restartAllTasks(): void {
    this.logger.info('Restarting all tasks');
    for (const id of this.tasks.keys()) {
      this.restartTask(id);
    }
    this.logger.info('All tasks scheduled for restart');
  }

  /**
   * Ставит на паузу все задачи.
   */
  public pauseAllTasks(): void {
    this.logger.info('Pausing all tasks');
    for (const task of this.tasks.values()) {
      task.pause();
    }
    this.logger.info('All tasks paused');
  }

  /**
   * Возобновляет все задачи.
   */
  public resumeAllTasks(): void {
    this.logger.info('Resuming all tasks');
    for (const task of this.tasks.values()) {
      task.resume();
    }
    this.logger.info('All tasks resumed');
  }

  /**
   * Запускает все задачи.
   */
  public startAllTasks(): void {
    this.logger.info('Starting all tasks');
    for (const task of this.tasks.values()) {
      task.start();
    }
    this.logger.info('All tasks started');
  }

  /**
   * Останавливает все задачи.
   */
  public stopAllTasks(): void {
    this.logger.info('Stopping all tasks');
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.logger.info('All tasks stopped');
  }

  /**
   * Возвращает статистику всех задач.
   * @returns {Record<string, PollingTaskStats>}
   */
  public getAllTaskStats(): Record<string, PollingTaskStats> {
    const stats: Record<string, PollingTaskStats> = {};
    for (const [id, task] of this.tasks.entries()) {
      stats[id] = task.getStats();
    }
    return stats;
  }

  /**
   * Внутренний метод для запуска задачи менеджером очереди.
   * @param {TaskController} taskController - Контроллер задачи.
   * @returns {Promise<void>}
   * @internal
   */
  public async _executeQueuedTask(taskController: TaskController): Promise<void> {
    return taskController.executeOnce();
  }

  /**
   * Получает информацию о очереди
   * @param {string} resourceId - Идентификатор ресурса
   * @returns {PollingQueueInfo | null}
   */
  public getQueueInfo(resourceId: string): PollingQueueInfo | null {
    const queue = this.queues.get(resourceId);
    if (!queue) return null;
    return {
      resourceId,
      queueLength: queue.taskQueue.length,
      tasks: queue.taskQueue
        .map(id => {
          const task = this.tasks.get(id);
          const state = task?.getState();
          if (!state) return null;
          return { id, state };
        })
        .filter((item): item is { id: string; state: PollingTaskState } => item !== null),
    };
  }

  /**
   * Получает статистику системы
   * @returns {PollingSystemStats}
   */
  public getSystemStats(): PollingSystemStats {
    return {
      totalTasks: this.tasks.size,
      totalQueues: this.queues.size,
      queuedTasks: this.queuedOrProcessingTasks.size,
      tasks: this.getAllTaskStats(),
    };
  }

  // === Методы для управления логгерами ===
  public enablePollingManagerLogger(level: LogLevel = 'info'): void {
    this.logger.setLevel(level);
  }

  public disablePollingManagerLogger(): void {
    this.logger.setLevel('error');
  }

  public enableTaskQueueLoggers(level: LogLevel = 'info'): void {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel(level);
    }
  }

  public disableTaskQueueLoggers(): void {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel('error');
    }
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

  public enableTaskQueueLogger(resourceId: string, level: LogLevel = 'info'): void {
    this.queues.get(resourceId)?.logger.setLevel(level);
  }

  public disableTaskQueueLogger(resourceId: string): void {
    this.queues.get(resourceId)?.logger.setLevel('error');
  }

  public enableTaskControllerLogger(taskId: string, level: LogLevel = 'info'): void {
    this.tasks.get(taskId)?.logger.setLevel(level);
  }

  public disableTaskControllerLogger(taskId: string): void {
    this.tasks.get(taskId)?.logger.setLevel('error');
  }

  public enableAllLoggers(level: LogLevel = 'info'): void {
    this.enablePollingManagerLogger(level);
    this.enableTaskQueueLoggers(level);
    this.enableTaskControllerLoggers(level);
  }

  public disableAllLoggers(): void {
    this.disablePollingManagerLogger();
    this.disableTaskQueueLoggers();
    this.disableTaskControllerLoggers();
  }

  public setLogLevelForAll(level: LogLevel): void {
    this.logger.setLevel(level);
    for (const queue of this.queues.values()) {
      queue.logger.setLevel(level);
    }
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
}

export = PollingManager;
