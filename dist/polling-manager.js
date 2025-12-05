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
class TaskController {
  id;
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
  executionInProgress;
  stats;
  logger;
  manager;
  timerId = null;
  constructor(options, manager) {
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
      backoffDelay = 1e3,
      taskTimeout = 5e3
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
      failures: 0
    };
    this.logger = manager.loggerInstance.createLogger(`Task:${id}`);
    this.logger.setLevel("error");
    this.logger.debug("TaskController created", {
      id,
      priority,
      interval,
      maxRetries,
      backoffDelay,
      taskTimeout
    });
  }
  start() {
    if (!this.stopped) {
      this.logger.debug("Task already running");
      return;
    }
    this.stopped = false;
    this.logger.info("Task started", { id: this.id });
    this.onStart?.();
    this._scheduleNextRun(true);
  }
  stop() {
    if (this.stopped) {
      this.logger.debug("Task already stopped", { id: this.id });
      return;
    }
    this.stopped = true;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.manager.removeFromQueue(this.id);
    this.logger.info("Task stopped", { id: this.id });
    this.onStop?.();
  }
  pause() {
    if (this.paused) {
      this.logger.debug("Task already paused", { id: this.id });
      return;
    }
    this.paused = true;
    this.logger.info("Task paused", { id: this.id });
  }
  resume() {
    if (!this.stopped && this.paused) {
      this.paused = false;
      this.logger.info("Task resumed", { id: this.id });
      if (!this.timerId && !this.executionInProgress) {
        this._scheduleNextRun(true);
      }
    } else {
      this.logger.debug("Cannot resume task - not paused or stopped", {
        id: this.id
      });
    }
  }
  _scheduleNextRun(immediate = false) {
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
  async execute() {
    if (this.stopped || this.paused) {
      this.logger.debug("Cannot execute - task is stopped or paused", {
        id: this.id
      });
      this._scheduleNextRun();
      return;
    }
    if (this.shouldRun && !this.shouldRun()) {
      this.logger.debug("Task should not run according to shouldRun function", {
        id: this.id
      });
      this._scheduleNextRun();
      return;
    }
    this.onBeforeEach?.();
    this.executionInProgress = true;
    this.stats.totalRuns++;
    this.logger.debug("Executing task", { id: this.id });
    try {
      let overallSuccess = false;
      const results = [];
      for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
        if (this.stopped) break;
        if (this.paused) break;
        let retryCount = 0;
        let result = null;
        let fnSuccess = false;
        while (!this.stopped && retryCount <= this.maxRetries) {
          if (this.paused) break;
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
      }
      if (overallSuccess) {
        this.onSuccess?.(results);
      }
      this.onFinish?.(overallSuccess, results);
      this.logger.info("Task execution completed", {
        id: this.id,
        success: overallSuccess,
        resultsCount: results.length
      });
    } catch (err) {
      this.logger.error("Fatal error during task execution cycle", {
        id: this.id,
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      this.executionInProgress = false;
      this._scheduleNextRun();
    }
  }
  isRunning() {
    return !this.stopped;
  }
  isPaused() {
    return this.paused;
  }
  setInterval(ms) {
    this.interval = ms;
    this.logger.info("Interval updated", { id: this.id, interval: ms });
  }
  getState() {
    return {
      stopped: this.stopped,
      paused: this.paused,
      running: !this.stopped,
      inProgress: this.executionInProgress
    };
  }
  getStats() {
    return { ...this.stats };
  }
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
    else this.logger.error("Polling error", logContext);
  }
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
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
class PollingManager {
  config;
  tasks;
  executionQueue;
  mutex;
  isProcessing;
  paused;
  loggerInstance;
  logger;
  constructor(config = {}, loggerInstance) {
    this.config = {
      defaultMaxRetries: 3,
      defaultBackoffDelay: 1e3,
      defaultTaskTimeout: 5e3,
      logLevel: "trace",
      ...config
    };
    this.tasks = /* @__PURE__ */ new Map();
    this.executionQueue = [];
    this.mutex = new import_async_mutex.Mutex();
    this.isProcessing = false;
    this.paused = false;
    this.loggerInstance = loggerInstance || new import_logger.default();
    if (!loggerInstance) {
      this.loggerInstance.setLogFormat(["timestamp", "level", "logger"]);
      this.loggerInstance.setCustomFormatter("logger", (value) => {
        return value ? `[${value}]` : "";
      });
    }
    this.logger = this.loggerInstance.createLogger("PollingManager");
    this.logger.setLevel(this.config.logLevel);
    this.logger.info("PollingManager initialized", {
      config: JSON.stringify(this.config)
    });
  }
  _validateTaskOptions(options) {
    if (!options || typeof options !== "object")
      throw new import_errors.PollingTaskValidationError("Task options must be an object");
    if (!options.id) throw new import_errors.PollingTaskValidationError('Task must have an "id"');
    if (typeof options.interval !== "number" || options.interval <= 0)
      throw new import_errors.PollingTaskValidationError("Interval must be a positive number");
    if (!options.fn || !Array.isArray(options.fn) && typeof options.fn !== "function")
      throw new import_errors.PollingTaskValidationError("fn must be a function or array of functions");
  }
  addTask(options) {
    try {
      this._validateTaskOptions(options);
      if (this.tasks.has(options.id)) throw new import_errors.PollingTaskAlreadyExistsError(options.id);
      const task = new TaskController(
        {
          ...options,
          maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
          backoffDelay: options.backoffDelay ?? this.config.defaultBackoffDelay,
          taskTimeout: options.taskTimeout ?? this.config.defaultTaskTimeout
        },
        this
      );
      this.tasks.set(options.id, task);
      if (options.immediate !== false) {
        task.start();
      }
      this.logger.info("Task added successfully", { id: options.id });
    } catch (error) {
      const err = error instanceof Error ? error : new import_errors.PollingManagerError(String(error));
      this.logger.error("Failed to add task", { error: err.message });
      throw err;
    }
  }
  updateTask(id, newOptions) {
    const oldTask = this.tasks.get(id);
    if (!oldTask) throw new import_errors.PollingTaskNotFoundError(id);
    const oldOptions = {
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
      name: oldTask.name ?? void 0,
      maxRetries: oldTask.maxRetries,
      backoffDelay: oldTask.backoffDelay,
      taskTimeout: oldTask.taskTimeout
    };
    const mergedOptions = { ...oldOptions, ...newOptions };
    const wasRunning = oldTask.isRunning();
    this.removeTask(id);
    this.addTask(mergedOptions);
    if (wasRunning) this.startTask(id);
  }
  removeTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
      this.removeFromQueue(id);
      this.logger.info("Task removed", { id });
    } else {
      this.logger.warn("Attempt to remove non-existent task", { id });
    }
  }
  restartTask(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      setTimeout(() => {
        const freshTask = this.tasks.get(id);
        if (freshTask) freshTask.start();
      }, 0);
    }
  }
  startTask(id) {
    const task = this.tasks.get(id);
    if (task) task.start();
    else throw new import_errors.PollingTaskNotFoundError(id);
  }
  stopTask(id) {
    const task = this.tasks.get(id);
    if (task) task.stop();
  }
  pauseTask(id) {
    const task = this.tasks.get(id);
    if (task) task.pause();
  }
  resumeTask(id) {
    const task = this.tasks.get(id);
    if (task) task.resume();
  }
  setTaskInterval(id, interval) {
    const task = this.tasks.get(id);
    if (task) task.setInterval(interval);
  }
  isTaskRunning(id) {
    const task = this.tasks.get(id);
    return task ? task.isRunning() : false;
  }
  isTaskPaused(id) {
    const task = this.tasks.get(id);
    return task ? task.isPaused() : false;
  }
  getTaskState(id) {
    const task = this.tasks.get(id);
    return task ? task.getState() : null;
  }
  getTaskStats(id) {
    const task = this.tasks.get(id);
    return task ? task.getStats() : null;
  }
  hasTask(id) {
    return this.tasks.has(id);
  }
  getTaskIds() {
    return Array.from(this.tasks.keys());
  }
  clearAll() {
    this.logger.info("Clearing all tasks");
    this.paused = true;
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
    this.executionQueue = [];
    this.logger.info("All tasks cleared");
  }
  restartAllTasks() {
    for (const id of this.tasks.keys()) {
      this.restartTask(id);
    }
  }
  pauseAllTasks() {
    this.paused = true;
    for (const task of this.tasks.values()) {
      task.pause();
    }
  }
  resumeAllTasks() {
    this.paused = false;
    for (const task of this.tasks.values()) {
      task.resume();
    }
    this._processQueue();
  }
  startAllTasks() {
    this.paused = false;
    for (const task of this.tasks.values()) {
      task.start();
    }
  }
  stopAllTasks() {
    this.paused = true;
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.executionQueue = [];
  }
  getAllTaskStats() {
    const stats = {};
    for (const [id, task] of this.tasks.entries()) {
      stats[id] = task.getStats();
    }
    return stats;
  }
  getQueueInfo() {
    return {
      queueLength: this.executionQueue.length,
      tasks: this.executionQueue.map((task) => ({
        id: task.id,
        state: task.getState()
      }))
    };
  }
  getSystemStats() {
    return {
      totalTasks: this.tasks.size,
      totalQueues: 1,
      queuedTasks: this.executionQueue.length,
      tasks: this.getAllTaskStats()
    };
  }
  enqueueTask(task) {
    if (!this.executionQueue.includes(task)) {
      this.executionQueue.push(task);
      this.executionQueue.sort((a, b) => b.priority - a.priority);
      this.logger.debug("Task enqueued", {
        id: task.id,
        queueLen: this.executionQueue.length
      });
      this._processQueue();
    }
  }
  removeFromQueue(taskId) {
    this.executionQueue = this.executionQueue.filter((t) => t.id !== taskId);
  }
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Основной цикл обработки очереди.
   */
  async _processQueue() {
    if (this.isProcessing || this.paused || this.executionQueue.length === 0) {
      return;
    }
    this.isProcessing = true;
    try {
      while (this.executionQueue.length > 0 && !this.paused) {
        const task = this.executionQueue[0];
        if (task) {
          this.executionQueue.shift();
          this.logger.debug("Processing task from queue", { id: task.id });
          await this._sleep(30);
          await task.execute();
        }
        await this._sleep(10);
      }
    } catch (error) {
      this.logger.error("Critical error in processQueue loop", {
        error: error instanceof Error ? error.message : String(error)
      });
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
  async executeImmediate(fn) {
    const release = await this.mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
  // === Логгеры ===
  enablePollingManagerLogger(level = "info") {
    this.logger.setLevel(level);
  }
  disablePollingManagerLogger() {
    this.logger.setLevel("error");
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
  enableTaskControllerLogger(taskId, level = "info") {
    this.tasks.get(taskId)?.logger.setLevel(level);
  }
  disableTaskControllerLogger(taskId) {
    this.tasks.get(taskId)?.logger.setLevel("error");
  }
  enableAllLoggers(level = "info") {
    this.enablePollingManagerLogger(level);
    this.enableTaskControllerLoggers(level);
  }
  disableAllLoggers() {
    this.disablePollingManagerLogger();
    this.disableTaskControllerLoggers();
  }
  setLogLevelForAll(level) {
    this.logger.setLevel(level);
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
}
module.exports = PollingManager;
