"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_async_mutex = require("async-mutex");
var import_logger = __toESM(require("./logger.js"));
var import_errors = require("./errors.js");
function hasTransportProperty(obj) {
  return typeof obj === "object" && obj !== null && "transport" in obj;
}
function hasFlushMethod(obj) {
  return typeof obj === "object" && obj !== null && "flush" in obj && typeof obj.flush === "function";
}
class TaskController {
  id;
  resourceId;
  priority;
  name;
  fn;
  interval;
  onData;
  onError;
  onStart;
  onStop;
  onFinish;
  onBeforeEach;
  onRetry;
  shouldRun;
  onSuccess;
  onFailure;
  maxRetries;
  backoffDelay;
  taskTimeout;
  stopped;
  paused;
  loopRunning;
  executionInProgress;
  stats;
  transportMutex;
  logger;
  pollingManager;
  constructor(options, pollingManager) {
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
      backoffDelay = 1e3,
      taskTimeout = 5e3
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
      failures: 0
    };
    this.transportMutex = new import_async_mutex.Mutex();
    this.logger = pollingManager.loggerInstance.createLogger("TaskController");
    this.logger.setLevel("error");
    this.logger.debug("TaskController created", {
      id,
      resourceId: resourceId || void 0,
      priority,
      interval,
      maxRetries,
      backoffDelay,
      taskTimeout
    });
  }
  /**
   * Запускает задачу.
   */
  async start() {
    if (!this.stopped) {
      this.logger.debug("Task already running");
      return;
    }
    this.stopped = false;
    this.loopRunning = true;
    this.logger.info("Task started", { id: this.id });
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
  stop() {
    if (this.stopped) {
      this.logger.debug("Task already stopped", { id: this.id });
      return;
    }
    this.stopped = true;
    this.loopRunning = false;
    this.logger.info("Task stopped", { id: this.id });
    this.onStop?.();
  }
  /**
   * Ставит задачу на паузу.
   */
  pause() {
    if (this.paused) {
      this.logger.debug("Task already paused", { id: this.id });
      return;
    }
    this.paused = true;
    this.logger.info("Task paused", { id: this.id });
  }
  /**
   * Возобновляет задачу.
   */
  resume() {
    if (!this.stopped && this.paused) {
      this.paused = false;
      this.logger.info("Task resumed", { id: this.id });
      this.scheduleRun();
    } else {
      this.logger.debug("Cannot resume task - not paused or stopped", {
        id: this.id
      });
    }
  }
  /**
   * Планирует запуск задачи.
   */
  scheduleRun() {
    if (this.stopped) {
      this.logger.debug("Cannot schedule run - task is stopped", { id: this.id });
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
  async executeOnce() {
    if (this.stopped || this.paused) {
      this.logger.debug("Cannot execute - task is stopped or paused", {
        id: this.id
      });
      return;
    }
    if (this.shouldRun && !this.shouldRun()) {
      this.logger.debug("Task should not run according to shouldRun function", {
        id: this.id
      });
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
  async _performExecution() {
    this.onBeforeEach?.();
    this.executionInProgress = true;
    this.stats.totalRuns++;
    this.logger.debug("Executing task", { id: this.id });
    const release = await this.transportMutex.acquire();
    try {
      const firstFunction = this.fn[0];
      if (firstFunction && typeof firstFunction === "function") {
        const result = firstFunction();
        if (result && hasTransportProperty(result) && result.transport) {
          if (hasFlushMethod(result.transport)) {
            try {
              await result.transport.flush();
              this.logger.debug("Transport flushed successfully", { id: this.id });
            } catch (flushErr) {
              const error = flushErr instanceof Error ? flushErr : new import_errors.PollingManagerError(String(flushErr));
              this.logger.warn("Flush failed", { id: this.id, error: error.message });
            }
          }
        }
      }
      let overallSuccess = false;
      const results = [];
      for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
        let retryCount = 0;
        let result = null;
        let fnSuccess = false;
        while (!this.stopped && retryCount <= this.maxRetries) {
          if (this.paused) {
            this.logger.debug("Task paused during execution", { id: this.id });
            this.executionInProgress = false;
            return;
          }
          try {
            const fnToExecute = this.fn[fnIndex];
            if (typeof fnToExecute !== "function") {
              throw new import_errors.PollingManagerError(
                `Task ${this.id} fn at index ${fnIndex} is not a function`
              );
            }
            const promiseResult = fnToExecute();
            if (!(promiseResult instanceof Promise)) {
              throw new import_errors.PollingManagerError(
                `Task ${this.id} fn ${fnIndex} did not return a Promise`
              );
            }
            result = await this._withTimeout(promiseResult, this.taskTimeout);
            fnSuccess = true;
            this.stats.successes++;
            this.stats.lastError = null;
            break;
          } catch (err) {
            const error = err instanceof Error ? err : new import_errors.PollingManagerError(String(err));
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
              this.logger.warn("Max retries exhausted for fn[" + fnIndex + "]", {
                id: this.id,
                fnIndex,
                retryCount,
                error: error.message
              });
            } else {
              const isFlushedError = error instanceof import_errors.ModbusFlushError;
              const baseDelay = isFlushedError ? 50 : this.backoffDelay * Math.pow(2, retryCount - 1);
              const jitter = Math.random() * baseDelay * 0.5;
              const delay = baseDelay + jitter;
              this.logger.debug("Retrying fn[" + fnIndex + "] with delay", {
                id: this.id,
                delay,
                retryCount
              });
              await this._sleep(delay);
            }
          }
        }
        results.push(result);
        overallSuccess = overallSuccess || fnSuccess;
      }
      this.stats.lastResult = results;
      this.stats.lastRunTime = Date.now();
      if (results.length > 0 && results.some((r) => r !== null && r !== void 0)) {
        this.onData?.(results);
        this.logger.debug("Data callback executed", {
          id: this.id,
          resultsCount: results.length
        });
      } else {
        this.logger.warn("Skipping onData - all results invalid", {
          id: this.id,
          results: "invalid"
        });
      }
      this.onFinish?.(overallSuccess, results);
      this.logger.info("Task execution completed", {
        id: this.id,
        success: overallSuccess,
        resultsCount: results.length
      });
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
  _scheduleNextRun() {
    if (this.stopped) return;
    const scheduleFn = () => {
      if (this.stopped) return;
      if (this.resourceId) {
        this.logger.debug("Scheduling next run (queued)", { id: this.id });
        this.scheduleRun();
      } else if (this.loopRunning) {
        this.logger.debug("Scheduling next run (loop)", { id: this.id });
      }
    };
    setTimeout(scheduleFn, this.interval);
  }
  /**
   * Проверяет, запущена ли задача.
   */
  isRunning() {
    return !this.stopped;
  }
  /**
   * Проверяет, приостановлена ли задача.
   */
  isPaused() {
    return this.paused;
  }
  /**
   * Устанавливает интервал задачи.
   */
  setInterval(ms) {
    this.interval = ms;
    this.logger.info("Interval updated", { id: this.id, interval: ms });
  }
  /**
   * Возвращает состояние задачи.
   */
  getState() {
    return {
      stopped: this.stopped,
      paused: this.paused,
      running: this.loopRunning,
      inProgress: this.executionInProgress
    };
  }
  /**
   * Возвращает статистику задачи.
   */
  getStats() {
    return { ...this.stats };
  }
  /**
   * Цикл выполнения для задач без resourceId.
   * @private
   */
  async _runLoop() {
    this.logger.info("Starting run loop", { id: this.id });
    while (this.loopRunning && !this.stopped) {
      if (this.paused) {
        this.logger.debug("Task paused in loop", { id: this.id });
        await this._sleep(this.interval);
        continue;
      }
      if (this.shouldRun && !this.shouldRun()) {
        this.logger.debug("Task should not run according to shouldRun function", {
          id: this.id
        });
        await this._sleep(this.interval);
        continue;
      }
      await this._performExecution();
      if (this.loopRunning && !this.stopped) {
        await this._sleep(this.interval);
      }
    }
    this.loopRunning = false;
    this.logger.debug("Run loop finished", { id: this.id });
  }
  /**
   * Инкапсулирует логирование специфичных ошибок Modbus для чистоты кода.
   * @param {Error} error - Ошибка для логирования.
   * @private
   */
  _logSpecificError(error) {
    const logContext = { id: this.id, error: error.message };
    if (error instanceof import_errors.ModbusTimeoutError) this.logger.error("Modbus timeout error", logContext);
    else if (error instanceof import_errors.ModbusCRCError) this.logger.error("Modbus CRC error", logContext);
    else if (error instanceof import_errors.ModbusParityError)
      this.logger.error("Modbus parity error", logContext);
    else if (error instanceof import_errors.ModbusNoiseError) this.logger.error("Modbus noise error", logContext);
    else if (error instanceof import_errors.ModbusFramingError)
      this.logger.error("Modbus framing error", logContext);
    else if (error instanceof import_errors.ModbusOverrunError)
      this.logger.error("Modbus overrun error", logContext);
    else if (error instanceof import_errors.ModbusCollisionError)
      this.logger.error("Modbus collision error", logContext);
    else if (error instanceof import_errors.ModbusConfigError)
      this.logger.error("Modbus config error", logContext);
    else if (error instanceof import_errors.ModbusBaudRateError)
      this.logger.error("Modbus baud rate error", logContext);
    else if (error instanceof import_errors.ModbusSyncError) this.logger.error("Modbus sync error", logContext);
    else if (error instanceof import_errors.ModbusFrameBoundaryError)
      this.logger.error("Modbus frame boundary error", logContext);
    else if (error instanceof import_errors.ModbusLRCError) this.logger.error("Modbus LRC error", logContext);
    else if (error instanceof import_errors.ModbusChecksumError)
      this.logger.error("Modbus checksum error", logContext);
    else if (error instanceof import_errors.ModbusDataConversionError)
      this.logger.error("Modbus data conversion error", logContext);
    else if (error instanceof import_errors.ModbusBufferOverflowError)
      this.logger.error("Modbus buffer overflow error", logContext);
    else if (error instanceof import_errors.ModbusBufferUnderrunError)
      this.logger.error("Modbus buffer underrun error", logContext);
    else if (error instanceof import_errors.ModbusMemoryError)
      this.logger.error("Modbus memory error", logContext);
    else if (error instanceof import_errors.ModbusStackOverflowError)
      this.logger.error("Modbus stack overflow error", logContext);
    else if (error instanceof import_errors.ModbusResponseError)
      this.logger.error("Modbus response error", logContext);
    else if (error instanceof import_errors.ModbusInvalidAddressError)
      this.logger.error("Modbus invalid address error", logContext);
    else if (error instanceof import_errors.ModbusInvalidFunctionCodeError)
      this.logger.error("Modbus invalid function code error", logContext);
    else if (error instanceof import_errors.ModbusInvalidQuantityError)
      this.logger.error("Modbus invalid quantity error", logContext);
    else if (error instanceof import_errors.ModbusIllegalDataAddressError)
      this.logger.error("Modbus illegal data address error", logContext);
    else if (error instanceof import_errors.ModbusIllegalDataValueError)
      this.logger.error("Modbus illegal data value error", logContext);
    else if (error instanceof import_errors.ModbusSlaveBusyError)
      this.logger.error("Modbus slave busy error", logContext);
    else if (error instanceof import_errors.ModbusAcknowledgeError)
      this.logger.error("Modbus acknowledge error", logContext);
    else if (error instanceof import_errors.ModbusSlaveDeviceFailureError)
      this.logger.error("Modbus slave device failure error", logContext);
    else if (error instanceof import_errors.ModbusMalformedFrameError)
      this.logger.error("Modbus malformed frame error", logContext);
    else if (error instanceof import_errors.ModbusInvalidFrameLengthError)
      this.logger.error("Modbus invalid frame length error", logContext);
    else if (error instanceof import_errors.ModbusInvalidTransactionIdError)
      this.logger.error("Modbus invalid transaction ID error", logContext);
    else if (error instanceof import_errors.ModbusUnexpectedFunctionCodeError)
      this.logger.error("Modbus unexpected function code error", logContext);
    else if (error instanceof import_errors.ModbusConnectionRefusedError)
      this.logger.error("Modbus connection refused error", logContext);
    else if (error instanceof import_errors.ModbusConnectionTimeoutError)
      this.logger.error("Modbus connection timeout error", logContext);
    else if (error instanceof import_errors.ModbusNotConnectedError)
      this.logger.error("Modbus not connected error", logContext);
    else if (error instanceof import_errors.ModbusAlreadyConnectedError)
      this.logger.error("Modbus already connected error", logContext);
    else if (error instanceof import_errors.ModbusInsufficientDataError)
      this.logger.error("Modbus insufficient data error", logContext);
    else if (error instanceof import_errors.ModbusGatewayPathUnavailableError)
      this.logger.error("Modbus gateway path unavailable error", logContext);
    else if (error instanceof import_errors.ModbusGatewayTargetDeviceError)
      this.logger.error("Modbus gateway target device error", logContext);
    else if (error instanceof import_errors.ModbusInvalidStartingAddressError)
      this.logger.error("Modbus invalid starting address error", logContext);
    else if (error instanceof import_errors.ModbusMemoryParityError)
      this.logger.error("Modbus memory parity error", logContext);
    else if (error instanceof import_errors.ModbusBroadcastError)
      this.logger.error("Modbus broadcast error", logContext);
    else if (error instanceof import_errors.ModbusGatewayBusyError)
      this.logger.error("Modbus gateway busy error", logContext);
    else if (error instanceof import_errors.ModbusDataOverrunError)
      this.logger.error("Modbus data overrun error", logContext);
    else if (error instanceof import_errors.ModbusTooManyEmptyReadsError)
      this.logger.error("Modbus too many empty reads error", logContext);
    else if (error instanceof import_errors.ModbusInterFrameTimeoutError)
      this.logger.error("Modbus inter-frame timeout error", logContext);
    else if (error instanceof import_errors.ModbusSilentIntervalError)
      this.logger.error("Modbus silent interval error", logContext);
  }
  /**
   * Sleeps for given amount of milliseconds.
   * @param {number} ms
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Wraps a promise with a timeout.
   * @param {Promise} promise
   * @param {number} timeout
   * @private
   */
  _withTimeout(promise, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new import_errors.ModbusTimeoutError("Task timed out")), timeout);
      promise.then((result) => {
        clearTimeout(timer);
        resolve(result);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
class TaskQueue {
  resourceId;
  pollingManager;
  queuedOrProcessingTasks;
  taskQueue;
  mutex;
  processing;
  logger;
  constructor(resourceId, pollingManager, taskSet, loggerInstance) {
    this.resourceId = resourceId;
    this.pollingManager = pollingManager;
    this.queuedOrProcessingTasks = taskSet;
    this.taskQueue = [];
    this.mutex = new import_async_mutex.Mutex();
    this.processing = false;
    this.logger = loggerInstance.createLogger("TaskQueue");
    this.logger.setLevel("error");
  }
  /**
   * Добавляет задачу в очередь на обработку.
   * @param {TaskController} taskController
   */
  enqueue(taskController) {
    if (!taskController.stopped && taskController.resourceId === this.resourceId) {
      const taskKey = `${this.resourceId}:${taskController.id}`;
      if (!this.queuedOrProcessingTasks.has(taskKey)) {
        this.queuedOrProcessingTasks.add(taskKey);
        this.taskQueue.push(taskController.id);
        this.logger.debug("Task enqueued", { taskId: taskController.id });
        this._processNext();
      } else {
        this.logger.debug("Task already queued", { taskId: taskController.id });
      }
    }
  }
  /**
   * Удаляет задачу из очереди.
   * @param {string} taskId
   */
  removeTask(taskId) {
    const taskKey = `${this.resourceId}:${taskId}`;
    this.queuedOrProcessingTasks.delete(taskKey);
    this.taskQueue = this.taskQueue.filter((id) => id !== taskId);
    this.logger.debug("Task removed from queue", { taskId });
  }
  /**
   * Проверяет, пуста ли очередь.
   * @returns {boolean}
   */
  isEmpty() {
    return this.taskQueue.length === 0;
  }
  /**
   * Очищает очередь.
   */
  clear() {
    for (const taskId of this.taskQueue) {
      const taskKey = `${this.resourceId}:${taskId}`;
      this.queuedOrProcessingTasks.delete(taskKey);
    }
    this.taskQueue = [];
    this.logger.debug("Queue cleared", { resourceId: this.resourceId });
  }
  /**
   * Сообщает очереди, что задача готова к следующему запуску.
   * @param {TaskController} taskController
   */
  markTaskReady(taskController) {
    if (!taskController.stopped && taskController.resourceId === this.resourceId) {
      const taskKey = `${this.resourceId}:${taskController.id}`;
      if (!this.queuedOrProcessingTasks.has(taskKey)) {
        this.queuedOrProcessingTasks.add(taskKey);
        this.taskQueue.push(taskController.id);
        this.logger.debug("Task marked as ready", { taskId: taskController.id });
        this._processNext();
      }
    }
  }
  /**
   * Обрабатывает очередь задач.
   * @private
   */
  async _processNext() {
    if (this.processing || this.taskQueue.length === 0) {
      if (this.taskQueue.length === 0) {
        this.logger.debug("Queue is empty", { resourceId: this.resourceId });
      }
      return;
    }
    this.processing = true;
    this.logger.debug("Acquiring mutex for task processing", {
      resourceId: this.resourceId
    });
    const release = await this.mutex.acquire();
    let taskKey = null;
    try {
      const taskId = this.taskQueue.shift();
      if (!taskId) return;
      taskKey = `${this.resourceId}:${taskId}`;
      this.logger.debug("Processing task", { taskId });
      const taskController = this.pollingManager.tasks.get(taskId);
      if (!taskController || taskController.stopped) {
        this.logger.debug("Task is stopped or does not exist", { taskId });
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
      this.logger.debug("Task executed successfully", { taskId });
    } catch (error) {
      const err = error instanceof Error ? error : new import_errors.PollingManagerError(String(error));
      this._logSpecificError(err);
      this.logger.error("Error executing task in queue", {
        resourceId: this.resourceId,
        error: err.message
      });
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
  _logSpecificError(error) {
    const logContext = { resourceId: this.resourceId, error: error.message };
    if (error instanceof import_errors.ModbusTimeoutError)
      this.logger.error("Modbus timeout error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusCRCError)
      this.logger.error("Modbus CRC error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusParityError)
      this.logger.error("Modbus parity error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusNoiseError)
      this.logger.error("Modbus noise error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusFramingError)
      this.logger.error("Modbus framing error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusOverrunError)
      this.logger.error("Modbus overrun error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusCollisionError)
      this.logger.error("Modbus collision error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusConfigError)
      this.logger.error("Modbus config error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusBaudRateError)
      this.logger.error("Modbus baud rate error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusSyncError)
      this.logger.error("Modbus sync error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusFrameBoundaryError)
      this.logger.error("Modbus frame boundary error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusLRCError)
      this.logger.error("Modbus LRC error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusChecksumError)
      this.logger.error("Modbus checksum error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusDataConversionError)
      this.logger.error("Modbus data conversion error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusBufferOverflowError)
      this.logger.error("Modbus buffer overflow error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusBufferUnderrunError)
      this.logger.error("Modbus buffer underrun error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusMemoryError)
      this.logger.error("Modbus memory error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusStackOverflowError)
      this.logger.error("Modbus stack overflow error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusResponseError)
      this.logger.error("Modbus response error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInvalidAddressError)
      this.logger.error("Modbus invalid address error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInvalidFunctionCodeError)
      this.logger.error("Modbus invalid function code error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInvalidQuantityError)
      this.logger.error("Modbus invalid quantity error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusIllegalDataAddressError)
      this.logger.error("Modbus illegal data address error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusIllegalDataValueError)
      this.logger.error("Modbus illegal data value error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusSlaveBusyError)
      this.logger.error("Modbus slave busy error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusAcknowledgeError)
      this.logger.error("Modbus acknowledge error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusSlaveDeviceFailureError)
      this.logger.error("Modbus slave device failure error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusMalformedFrameError)
      this.logger.error("Modbus malformed frame error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInvalidFrameLengthError)
      this.logger.error("Modbus invalid frame length error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInvalidTransactionIdError)
      this.logger.error("Modbus invalid transaction ID error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusUnexpectedFunctionCodeError)
      this.logger.error("Modbus unexpected function code error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusConnectionRefusedError)
      this.logger.error("Modbus connection refused error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusConnectionTimeoutError)
      this.logger.error("Modbus connection timeout error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusNotConnectedError)
      this.logger.error("Modbus not connected error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusAlreadyConnectedError)
      this.logger.error("Modbus already connected error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInsufficientDataError)
      this.logger.error("Modbus insufficient data error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusGatewayPathUnavailableError)
      this.logger.error("Modbus gateway path unavailable error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusGatewayTargetDeviceError)
      this.logger.error("Modbus gateway target device error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInvalidStartingAddressError)
      this.logger.error("Modbus invalid starting address error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusMemoryParityError)
      this.logger.error("Modbus memory parity error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusBroadcastError)
      this.logger.error("Modbus broadcast error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusGatewayBusyError)
      this.logger.error("Modbus gateway busy error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusDataOverrunError)
      this.logger.error("Modbus data overrun error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusTooManyEmptyReadsError)
      this.logger.error("Modbus too many empty reads error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusInterFrameTimeoutError)
      this.logger.error("Modbus inter-frame timeout error in queue processing", logContext);
    else if (error instanceof import_errors.ModbusSilentIntervalError)
      this.logger.error("Modbus silent interval error in queue processing", logContext);
  }
}
class PollingManager {
  config;
  tasks;
  queues;
  queuedOrProcessingTasks;
  loggerInstance;
  logger;
  constructor(config = {}) {
    this.config = {
      defaultMaxRetries: 3,
      defaultBackoffDelay: 1e3,
      defaultTaskTimeout: 5e3,
      logLevel: "trace",
      ...config
    };
    this.tasks = /* @__PURE__ */ new Map();
    this.queues = /* @__PURE__ */ new Map();
    this.queuedOrProcessingTasks = /* @__PURE__ */ new Set();
    this.loggerInstance = new import_logger.default();
    this.loggerInstance.setLogFormat(["timestamp", "level", "logger"]);
    this.loggerInstance.setCustomFormatter("logger", (value) => {
      return value ? `[${value}]` : "";
    });
    this.logger = this.loggerInstance.createLogger("PollingManager");
    this.logger.setLevel("error");
    this.logger.info("PollingManager initialized", {
      config: JSON.stringify(this.config)
    });
    this.loggerInstance.flush();
  }
  /**
   * Валидирует опции задачи
   * @param {Object} options - Опции задачи
   * @private
   */
  _validateTaskOptions(options) {
    if (!options || typeof options !== "object") {
      throw new import_errors.PollingTaskValidationError("Task options must be an object");
    }
    if (!options.id) {
      throw new import_errors.PollingTaskValidationError('Task must have an "id"');
    }
    if (options.interval === void 0 || typeof options.interval !== "number" || options.interval <= 0) {
      throw new import_errors.PollingTaskValidationError("Interval must be a positive number");
    }
    if (options.fn === void 0 || !Array.isArray(options.fn) && typeof options.fn !== "function") {
      throw new import_errors.PollingTaskValidationError("fn must be a function or array of functions");
    }
    if (options.maxRetries !== void 0 && (typeof options.maxRetries !== "number" || options.maxRetries < 0)) {
      throw new import_errors.PollingTaskValidationError("maxRetries must be a non-negative number");
    }
    if (options.backoffDelay !== void 0 && (typeof options.backoffDelay !== "number" || options.backoffDelay <= 0)) {
      throw new import_errors.PollingTaskValidationError("backoffDelay must be a positive number");
    }
    if (options.taskTimeout !== void 0 && (typeof options.taskTimeout !== "number" || options.taskTimeout <= 0)) {
      throw new import_errors.PollingTaskValidationError("taskTimeout must be a positive number");
    }
  }
  /**
   * Добавляет новую задачу в менеджер.
   * @param {PollingTaskOptions} options - Опции задачи
   */
  addTask(options) {
    try {
      this._validateTaskOptions(options);
      const { id, resourceId } = options;
      if (this.tasks.has(id)) {
        const error = new import_errors.PollingTaskAlreadyExistsError(id);
        this.logger.error("Failed to add task - already exists", {
          id,
          error: error.message
        });
        throw error;
      }
      this.logger.trace("Creating TaskController", { id, resourceId });
      const controller = new TaskController(options, this);
      this.tasks.set(id, controller);
      if (resourceId) {
        if (!this.queues.has(resourceId)) {
          this.logger.debug("Creating new TaskQueue", { resourceId });
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
      this.logger.info("Task added successfully", {
        id,
        resourceId,
        immediate: options.immediate
      });
      this.loggerInstance.flush();
    } catch (error) {
      const err = error instanceof Error ? error : new import_errors.PollingManagerError(String(error));
      this.logger.error("Failed to add task", {
        error: err.message,
        options: JSON.stringify(options, null, 2)
      });
      this.loggerInstance.flush();
      throw err;
    }
  }
  /**
   * Обновляет задачу новыми опциями.
   * @param {string} id - Идентификатор задачи
   * @param {Object} newOptions - Новые опции задачи
   */
  updateTask(id, newOptions) {
    const oldTask = this.tasks.get(id);
    if (!oldTask) {
      const error = new import_errors.PollingTaskNotFoundError(id);
      this.logger.error("Failed to update task - not found", {
        id,
        error: error.message
      });
      throw error;
    }
    const oldOptions = {
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
      name: oldTask.name ?? void 0,
      // ИСПРАВЛЕНИЕ: Преобразуем null в undefined
      maxRetries: oldTask.maxRetries,
      backoffDelay: oldTask.backoffDelay,
      taskTimeout: oldTask.taskTimeout
    };
    const mergedOptions = { ...oldOptions, ...newOptions };
    this.logger.info("Updating task", { id, newOptions: JSON.stringify(newOptions) });
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
  removeTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      const resourceId = task.resourceId;
      if (resourceId && this.queues.has(resourceId)) {
        this.queues.get(resourceId)?.removeTask(id);
        if (this.queues.get(resourceId)?.isEmpty()) {
          this.queues.delete(resourceId);
          this.logger.debug("Queue removed - empty", { resourceId });
        }
      }
      this.tasks.delete(id);
      this.logger.info("Task removed", { id, resourceId });
    } else {
      this.logger.warn("Attempt to remove non-existent task", { id });
    }
  }
  /**
   * Перезапускает задачу.
   * @param {string} id - Идентификатор задачи
   */
  restartTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info("Restarting task", { id });
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
      this.logger.warn("Attempt to restart non-existent task", { id });
    }
  }
  /**
   * Запускает задачу.
   * @param {string} id - Идентификатор задачи
   */
  startTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info("Starting task", { id });
      task.start();
    } else {
      throw new import_errors.PollingTaskNotFoundError(id);
    }
  }
  /**
   * Останавливает задачу.
   * @param {string} id - Идентификатор задачи
   */
  stopTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info("Stopping task", { id });
      task.stop();
    } else {
      this.logger.warn("Attempt to stop non-existent task", { id });
    }
  }
  /**
   * Ставит задачу на паузу.
   * @param {string} id - Идентификатор задачи
   */
  pauseTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info("Pausing task", { id });
      task.pause();
    } else {
      this.logger.warn("Attempt to pause non-existent task", { id });
    }
  }
  /**
   * Возобновляет задачу.
   * @param {string} id - Идентификатор задачи
   */
  resumeTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info("Resuming task", { id });
      task.resume();
    } else {
      this.logger.warn("Attempt to resume non-existent task", { id });
    }
  }
  /**
   * Обновляет интервал задачи.
   * @param {string} id - Идентификатор задачи
   * @param {number} interval - Новый интервал
   */
  setTaskInterval(id, interval) {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info("Setting task interval", { id, interval });
      task.setInterval(interval);
    } else {
      this.logger.warn("Attempt to set interval for non-existent task", { id });
    }
  }
  /**
   * Проверяет, запущена ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  isTaskRunning(id) {
    const task = this.tasks.get(id);
    return task ? task.isRunning() : false;
  }
  /**
   * Проверяет, приостановлена ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  isTaskPaused(id) {
    const task = this.tasks.get(id);
    return task ? task.isPaused() : false;
  }
  /**
   * Получает состояние задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {PollingTaskState | null}
   */
  getTaskState(id) {
    const task = this.tasks.get(id);
    return task ? task.getState() : null;
  }
  /**
   * Получает статистику задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {PollingTaskStats | null}
   */
  getTaskStats(id) {
    const task = this.tasks.get(id);
    return task ? task.getStats() : null;
  }
  /**
   * Проверяет, существует ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  hasTask(id) {
    return this.tasks.has(id);
  }
  /**
   * Возвращает массив ID всех задач.
   * @returns {string[]}
   */
  getTaskIds() {
    return Array.from(this.tasks.keys());
  }
  /**
   * Очищает все задачи.
   */
  clearAll() {
    this.logger.info("Clearing all tasks");
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
    for (const queue of this.queues.values()) {
      queue.clear();
    }
    this.queues.clear();
    this.queuedOrProcessingTasks.clear();
    this.logger.info("All tasks cleared");
  }
  /**
   * Перезапускает все задачи.
   */
  restartAllTasks() {
    this.logger.info("Restarting all tasks");
    for (const id of this.tasks.keys()) {
      this.restartTask(id);
    }
    this.logger.info("All tasks scheduled for restart");
  }
  /**
   * Ставит на паузу все задачи.
   */
  pauseAllTasks() {
    this.logger.info("Pausing all tasks");
    for (const task of this.tasks.values()) {
      task.pause();
    }
    this.logger.info("All tasks paused");
  }
  /**
   * Возобновляет все задачи.
   */
  resumeAllTasks() {
    this.logger.info("Resuming all tasks");
    for (const task of this.tasks.values()) {
      task.resume();
    }
    this.logger.info("All tasks resumed");
  }
  /**
   * Запускает все задачи.
   */
  startAllTasks() {
    this.logger.info("Starting all tasks");
    for (const task of this.tasks.values()) {
      task.start();
    }
    this.logger.info("All tasks started");
  }
  /**
   * Останавливает все задачи.
   */
  stopAllTasks() {
    this.logger.info("Stopping all tasks");
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.logger.info("All tasks stopped");
  }
  /**
   * Возвращает статистику всех задач.
   * @returns {Record<string, PollingTaskStats>}
   */
  getAllTaskStats() {
    const stats = {};
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
  async _executeQueuedTask(taskController) {
    return taskController.executeOnce();
  }
  /**
   * Получает информацию о очереди
   * @param {string} resourceId - Идентификатор ресурса
   * @returns {PollingQueueInfo | null}
   */
  getQueueInfo(resourceId) {
    const queue = this.queues.get(resourceId);
    if (!queue) return null;
    return {
      resourceId,
      queueLength: queue.taskQueue.length,
      tasks: queue.taskQueue.map((id) => {
        const task = this.tasks.get(id);
        const state = task?.getState();
        if (!state) return null;
        return { id, state };
      }).filter((item) => item !== null)
    };
  }
  /**
   * Получает статистику системы
   * @returns {PollingSystemStats}
   */
  getSystemStats() {
    return {
      totalTasks: this.tasks.size,
      totalQueues: this.queues.size,
      queuedTasks: this.queuedOrProcessingTasks.size,
      tasks: this.getAllTaskStats()
    };
  }
  // === Методы для управления логгерами ===
  enablePollingManagerLogger(level = "info") {
    this.logger.setLevel(level);
  }
  disablePollingManagerLogger() {
    this.logger.setLevel("error");
  }
  enableTaskQueueLoggers(level = "info") {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel(level);
    }
  }
  disableTaskQueueLoggers() {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel("error");
    }
  }
  enableTaskControllerLoggers(level = "info") {
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
  disableTaskControllerLoggers() {
    for (const task of this.tasks.values()) {
      task.logger.setLevel("error");
    }
  }
  enableTaskQueueLogger(resourceId, level = "info") {
    this.queues.get(resourceId)?.logger.setLevel(level);
  }
  disableTaskQueueLogger(resourceId) {
    this.queues.get(resourceId)?.logger.setLevel("error");
  }
  enableTaskControllerLogger(taskId, level = "info") {
    this.tasks.get(taskId)?.logger.setLevel(level);
  }
  disableTaskControllerLogger(taskId) {
    this.tasks.get(taskId)?.logger.setLevel("error");
  }
  enableAllLoggers(level = "info") {
    this.enablePollingManagerLogger(level);
    this.enableTaskQueueLoggers(level);
    this.enableTaskControllerLoggers(level);
  }
  disableAllLoggers() {
    this.disablePollingManagerLogger();
    this.disableTaskQueueLoggers();
    this.disableTaskControllerLoggers();
  }
  setLogLevelForAll(level) {
    this.logger.setLevel(level);
    for (const queue of this.queues.values()) {
      queue.logger.setLevel(level);
    }
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
}
module.exports = PollingManager;
