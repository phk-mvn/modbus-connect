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
   * Выполняет задачу один раз.
   * @returns {Promise<void>}
   */
  async executeOnce() {
    if (this.stopped || this.paused) {
      this.logger.debug("Cannot execute - task is stopped or paused", {
        id: this.id
      });
      return;
    }
    if (this.shouldRun && this.shouldRun() === false) {
      this.logger.debug("Task should not run according to shouldRun function", {
        id: this.id
      });
      this._scheduleNextRun();
      return;
    }
    this.onBeforeEach?.();
    this.executionInProgress = true;
    this.stats.totalRuns++;
    this.logger.debug("Executing task once", { id: this.id });
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
              const error = flushErr instanceof Error ? flushErr : new Error(String(flushErr));
              this.logger.warn("Flush failed", { id: this.id, error: error.message });
            }
          }
        }
      }
      let success = false;
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
            const fnResult = this.fn[fnIndex];
            if (typeof fnResult !== "function") {
              throw new import_errors.PollingManagerError(
                `Task ${this.id} fn at index ${fnIndex} is not a function`
              );
            }
            const promiseResult = fnResult();
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
            const error = err instanceof Error ? err : new Error(String(err));
            retryCount++;
            this.stats.totalErrors++;
            this.stats.retries++;
            this.stats.lastError = error;
            this.onRetry?.(error, fnIndex, retryCount);
            const isFlushedError = error instanceof import_errors.ModbusFlushError;
            let backoffDelay = this.backoffDelay;
            if (isFlushedError) {
              this.logger.debug("Flush error detected, resetting backoff", {
                id: this.id
              });
              backoffDelay = this.backoffDelay;
            }
            const delay = isFlushedError ? Math.min(50, backoffDelay) : backoffDelay * Math.pow(2, retryCount - 1);
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
              this.logger.debug("Retrying fn[" + fnIndex + "] with delay", {
                id: this.id,
                delay,
                retryCount
              });
              await this._sleep(delay);
              if (this.stopped) {
                this.executionInProgress = false;
                return;
              }
            }
          }
        }
        results.push(result);
        success = success || fnSuccess;
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
      this.onFinish?.(success, results);
      this.logger.info("Task execution completed", {
        id: this.id,
        success,
        resultsCount: results.length
      });
      this.pollingManager.loggerInstance.flush();
    } finally {
      release();
      this.executionInProgress = false;
    }
    this._scheduleNextRun();
  }
  /**
   * Планирует следующий запуск задачи.
   * @private
   */
  _scheduleNextRun() {
    if (!this.stopped && this.resourceId) {
      setTimeout(() => {
        if (!this.stopped) {
          this.logger.debug("Scheduling next run (queued)", { id: this.id });
          this.scheduleRun();
        }
      }, this.interval);
    } else if (!this.stopped && !this.resourceId) {
      setTimeout(() => {
        if (!this.stopped && this.loopRunning) {
          this.logger.debug("Scheduling next run (loop)", { id: this.id });
          this._runLoop();
        }
      }, this.interval);
    }
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
   * Оригинальный цикл выполнения задачи (для задач без resourceId).
   * @private
   */
  async _runLoop() {
    let backoffDelay = this.backoffDelay;
    this.logger.info("Starting run loop", { id: this.id });
    while (this.loopRunning && !this.stopped) {
      if (this.paused) {
        this.logger.debug("Task paused in loop", { id: this.id });
        await this._sleep(this.interval);
        continue;
      }
      if (this.shouldRun && this.shouldRun() === false) {
        this.logger.debug("Task should not run according to shouldRun function", {
          id: this.id
        });
        await this._sleep(this.interval);
        continue;
      }
      this.onBeforeEach?.();
      this.executionInProgress = true;
      this.stats.totalRuns++;
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
                const error = flushErr instanceof Error ? flushErr : new Error(String(flushErr));
                this.logger.warn("Flush failed", {
                  id: this.id,
                  error: error.message
                });
              }
            }
          }
        }
        let success = false;
        const results = [];
        for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
          let retryCount = 0;
          let result = null;
          let fnSuccess = false;
          while (this.loopRunning && !this.stopped && retryCount <= this.maxRetries) {
            try {
              const fnResult = this.fn[fnIndex];
              if (typeof fnResult !== "function") {
                throw new import_errors.PollingManagerError(
                  `Task ${this.id} fn at index ${fnIndex} is not a function`
                );
              }
              const promiseResult = fnResult();
              if (!(promiseResult instanceof Promise)) {
                throw new import_errors.PollingManagerError(
                  `Task ${this.id} fn ${fnIndex} did not return a Promise`
                );
              }
              result = await this._withTimeout(promiseResult, this.taskTimeout);
              fnSuccess = true;
              this.stats.successes++;
              this.stats.lastError = null;
              backoffDelay = this.backoffDelay;
              break;
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              retryCount++;
              this.stats.totalErrors++;
              this.stats.retries++;
              this.stats.lastError = error;
              this.onRetry?.(error, fnIndex, retryCount);
              const isFlushedError = error instanceof import_errors.ModbusFlushError;
              if (isFlushedError) {
                this.logger.debug("Flush error detected, resetting backoff", {
                  id: this.id
                });
                backoffDelay = this.backoffDelay;
              }
              const delay = isFlushedError ? Math.min(50, backoffDelay) : backoffDelay * Math.pow(2, retryCount - 1);
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
          success = success || fnSuccess;
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
        this.onFinish?.(success, results);
        this.logger.info("Task execution completed", {
          id: this.id,
          success,
          resultsCount: results.length
        });
        this.pollingManager.loggerInstance.flush();
      } finally {
        release();
        this.executionInProgress = false;
      }
      await this._sleep(this.interval);
    }
    this.loopRunning = false;
    this.logger.debug("Run loop finished", { id: this.id });
  }
  /**
   * Sleeps for given amount of milliseconds.
   * @param {number} ms
   * @returns {Promise}
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Wraps a promise with a timeout.
   * @param {Promise} promise
   * @param {number} timeout
   * @returns {Promise}
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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Error executing task", {
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
}
class PollingManager {
  config;
  tasks;
  queues;
  queuedOrProcessingTasks;
  loggerInstance;
  logger;
  /**
   * @param {Object} config - Конфигурация менеджера
   * @param {number} [config.defaultMaxRetries=3] - Максимальное количество попыток по умолчанию
   * @param {number} [config.defaultBackoffDelay=1000] - Задержка между попытками по умолчанию
   * @param {number} [config.defaultTaskTimeout=5000] - Таймаут задачи по умолчанию
   * @param {string} [config.logLevel='info'] - Уровень логирования
   */
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
    if (options.interval && (typeof options.interval !== "number" || options.interval <= 0)) {
      throw new import_errors.PollingTaskValidationError("Interval must be a positive number");
    }
    if (options.fn && !Array.isArray(options.fn) && typeof options.fn !== "function") {
      throw new import_errors.PollingTaskValidationError("Function must be a function or array of functions");
    }
    if (options.maxRetries && (typeof options.maxRetries !== "number" || options.maxRetries < 0)) {
      throw new import_errors.PollingTaskValidationError("maxRetries must be a non-negative number");
    }
    if (options.backoffDelay && (typeof options.backoffDelay !== "number" || options.backoffDelay <= 0)) {
      throw new import_errors.PollingTaskValidationError("backoffDelay must be a positive number");
    }
    if (options.taskTimeout && (typeof options.taskTimeout !== "number" || options.taskTimeout <= 0)) {
      throw new import_errors.PollingTaskValidationError("taskTimeout must be a positive number");
    }
  }
  /**
   * Добавляет новую задачу в менеджер.
   * @param {Object} options - Опции задачи
   * @param {string} options.id - Уникальный идентификатор задачи
   * @param {string} [options.resourceId] - Идентификатор ресурса для очереди
   * @param {number} [options.priority=0] - Приоритет задачи
   * @param {number} options.interval - Интервал выполнения в миллисекундах
   * @param {Function|Function[]} options.fn - Функция(и) для выполнения
   * @param {Function} [options.onData] - Callback для данных
   * @param {Function} [options.onError] - Callback для ошибок
   * @param {Function} [options.onStart] - Callback при запуске
   * @param {Function} [options.onStop] - Callback при остановке
   * @param {Function} [options.onFinish] - Callback при завершении
   * @param {Function} [options.onBeforeEach] - Callback перед каждой итерацией
   * @param {Function} [options.onRetry] - Callback при повторной попытке
   * @param {Function} [options.shouldRun] - Функция проверки возможности запуска
   * @param {Function} [options.onSuccess] - Callback при успешном выполнении
   * @param {Function} [options.onFailure] - Callback при неудачном выполнении
   * @param {string} [options.name] - Имя задачи
   * @param {boolean} [options.immediate=false] - Немедленный запуск
   * @param {number} [options.maxRetries] - Максимальное количество попыток
   * @param {number} [options.backoffDelay] - Задержка между попытками
   * @param {number} [options.taskTimeout] - Таймаут задачи
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
        this.queues.get(resourceId)?.enqueue(controller);
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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Failed to add task", {
        error: err.message,
        options: JSON.stringify(options)
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
    if (!this.tasks.has(id)) {
      const error = new import_errors.PollingTaskNotFoundError(id);
      this.logger.error("Failed to update task - not found", {
        id,
        error: error.message
      });
      throw error;
    }
    this.logger.info("Updating task", { id, newOptions: JSON.stringify(newOptions) });
    this.removeTask(id);
    this.addTask({ id, ...newOptions });
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
      if (task.resourceId && this.queues.has(task.resourceId)) {
        task.scheduleRun();
      } else {
        task.start();
      }
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
      this.logger.warn("Attempt to start non-existent task", { id });
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
    const result = task ? task.isRunning() : false;
    return result;
  }
  /**
   * Проверяет, приостановлена ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  isTaskPaused(id) {
    const task = this.tasks.get(id);
    const result = task ? task.isPaused() : false;
    return result;
  }
  /**
   * Получает состояние задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {Object|null}
   */
  getTaskState(id) {
    const task = this.tasks.get(id);
    const result = task ? task.getState() : null;
    return result;
  }
  /**
   * Получает статистику задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {Object|null}
   */
  getTaskStats(id) {
    const task = this.tasks.get(id);
    const result = task ? task.getStats() : null;
    return result;
  }
  /**
   * Проверяет, существует ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  hasTask(id) {
    const result = this.tasks.has(id);
    return result;
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
    for (const task of this.tasks.values()) {
      task.stop();
      task.scheduleRun();
    }
    this.logger.info("All tasks restarted");
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
      task.scheduleRun();
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
   * @returns {Object}
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
   */
  async _executeQueuedTask(taskController) {
    return taskController.executeOnce();
  }
  /**
   * Получает информацию о очереди
   * @param {string} resourceId - Идентификатор ресурса
   * @returns {Object|null}
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
        return {
          id,
          state
        };
      }).filter((item) => item !== null)
      // Фильтруем null значения
    };
  }
  /**
   * Получает статистику системы
   * @returns {Object}
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
  /**
   * Включает логгер PollingManager
   * @param {string} [level='info'] - Уровень логирования
   */
  enablePollingManagerLogger(level = "info") {
    this.logger.setLevel(level);
  }
  /**
   * Отключает логгер PollingManager
   */
  disablePollingManagerLogger() {
    this.logger.setLevel("error");
  }
  /**
   * Включает логгеры всех TaskQueue
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskQueueLoggers(level = "info") {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel(level);
    }
  }
  /**
   * Отключает логгеры всех TaskQueue
   */
  disableTaskQueueLoggers() {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel("error");
    }
  }
  /**
   * Включает логгеры всех TaskController
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskControllerLoggers(level = "info") {
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }
  /**
   * Отключает логгеры всех TaskController
   */
  disableTaskControllerLoggers() {
    for (const task of this.tasks.values()) {
      task.logger.setLevel("error");
    }
  }
  /**
   * Включает логгеры для конкретной очереди
   * @param {string} resourceId - Идентификатор ресурса очереди
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskQueueLogger(resourceId, level = "info") {
    const queue = this.queues.get(resourceId);
    if (queue) {
      queue.logger.setLevel(level);
    }
  }
  /**
   * Отключает логгеры для конкретной очереди
   * @param {string} resourceId - Идентификатор ресурса очереди
   */
  disableTaskQueueLogger(resourceId) {
    const queue = this.queues.get(resourceId);
    if (queue) {
      queue.logger.setLevel("error");
    }
  }
  /**
   * Включает логгер для конкретной задачи
   * @param {string} taskId - Идентификатор задачи
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskControllerLogger(taskId, level = "info") {
    const task = this.tasks.get(taskId);
    if (task) {
      task.logger.setLevel(level);
    }
  }
  /**
   * Отключает логгер для конкретной задачи
   * @param {string} taskId - Идентификатор задачи
   */
  disableTaskControllerLogger(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.logger.setLevel("error");
    }
  }
  /**
   * Включает все логгеры
   * @param {string} [level='info'] - Уровень логирования
   */
  enableAllLoggers(level = "info") {
    this.enablePollingManagerLogger(level);
    this.enableTaskQueueLoggers(level);
    this.enableTaskControllerLoggers(level);
  }
  /**
   * Отключает все логгеры
   */
  disableAllLoggers() {
    this.disablePollingManagerLogger();
    this.disableTaskQueueLoggers();
    this.disableTaskControllerLoggers();
  }
  /**
   * Устанавливает уровень логирования для всех компонентов
   * @param {string} level - Уровень логирования
   */
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
