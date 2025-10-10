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
} from './errors.js';

function hasTransportProperty(obj: unknown): obj is { transport: unknown } {
  return typeof obj === 'object' && obj !== null && 'transport' in obj;
}

function hasFlushMethod(obj: unknown): obj is { flush: () => Promise<void> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'flush' in obj &&
    typeof (obj as { flush: unknown }).flush === 'function'
  );
}

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
   * Выполняет задачу один раз.
   * @returns {Promise<void>}
   */
  async executeOnce(): Promise<void> {
    if (this.stopped || this.paused) {
      this.logger.debug('Cannot execute - task is stopped or paused', {
        id: this.id,
      } as LogContext);
      return;
    }

    if (this.shouldRun && this.shouldRun() === false) {
      this.logger.debug('Task should not run according to shouldRun function', {
        id: this.id,
      } as LogContext);
      this._scheduleNextRun();
      return;
    }

    this.onBeforeEach?.();
    this.executionInProgress = true;
    this.stats.totalRuns++;

    this.logger.debug('Executing task once', { id: this.id } as LogContext);
    const release = await this.transportMutex.acquire();
    try {
      // Проверяем существование transport перед обращением к его методам
      const firstFunction = this.fn[0];
      if (firstFunction && typeof firstFunction === 'function') {
        const result = firstFunction();
        // Используем type guard для проверки наличия свойства transport
        if (result && hasTransportProperty(result) && result.transport) {
          // Используем type guard для проверки наличия метода flush у transport
          if (hasFlushMethod(result.transport)) {
            try {
              await result.transport.flush();
              this.logger.debug('Transport flushed successfully', { id: this.id } as LogContext);
            } catch (flushErr: unknown) {
              const error = flushErr instanceof Error ? flushErr : new Error(String(flushErr));
              this.logger.warn('Flush failed', { id: this.id, error: error.message } as LogContext);
            }
          }
        }
      }

      let success = false;
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
            const fnResult = this.fn[fnIndex]; // Извлекаем элемент массива
            if (typeof fnResult !== 'function') {
              // Проверяем, что это функция
              throw new PollingManagerError(
                `Task ${this.id} fn at index ${fnIndex} is not a function`
              );
            }
            const promiseResult = fnResult(); // Вызываем функцию
            if (!(promiseResult instanceof Promise)) {
              throw new PollingManagerError(
                `Task ${this.id} fn ${fnIndex} did not return a Promise`
              );
            }
            result = await this._withTimeout(promiseResult, this.taskTimeout); // Ждем результата
            fnSuccess = true;
            this.stats.successes++;
            this.stats.lastError = null;
            break;
          } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            retryCount++;
            this.stats.totalErrors++;
            this.stats.retries++;
            this.stats.lastError = error;
            this.onRetry?.(error, fnIndex, retryCount);

            const isFlushedError = error instanceof ModbusFlushError;
            let backoffDelay = this.backoffDelay;
            if (isFlushedError) {
              this.logger.debug('Flush error detected, resetting backoff', {
                id: this.id,
              } as LogContext);
              backoffDelay = this.backoffDelay;
            }

            const delay = isFlushedError
              ? Math.min(50, backoffDelay)
              : backoffDelay * Math.pow(2, retryCount - 1);
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
              this.logger.debug('Retrying fn[' + fnIndex + '] with delay', {
                id: this.id,
                delay,
                retryCount,
              } as LogContext);
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

      if (results.length > 0 && results.some(r => r !== null && r !== undefined)) {
        this.onData?.(results);
        // Используем только разрешенные поля в LogContext
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

      this.onFinish?.(success, results);
      // Используем только разрешенные поля в LogContext
      this.logger.info('Task execution completed', {
        id: this.id,
        success,
        resultsCount: results.length,
      } as LogContext);
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
  _scheduleNextRun(): void {
    if (!this.stopped && this.resourceId) {
      setTimeout(() => {
        if (!this.stopped) {
          this.logger.debug('Scheduling next run (queued)', { id: this.id } as LogContext);
          this.scheduleRun();
        }
      }, this.interval);
    } else if (!this.stopped && !this.resourceId) {
      setTimeout(() => {
        if (!this.stopped && this.loopRunning) {
          this.logger.debug('Scheduling next run (loop)', { id: this.id } as LogContext);
          this._runLoop();
        }
      }, this.interval);
    }
  }

  /**
   * Проверяет, запущена ли задача.
   */
  isRunning(): boolean {
    return !this.stopped;
  }

  /**
   * Проверяет, приостановлена ли задача.
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Устанавливает интервал задачи.
   */
  setInterval(ms: number): void {
    this.interval = ms;
    this.logger.info('Interval updated', { id: this.id, interval: ms } as LogContext);
  }

  /**
   * Возвращает состояние задачи.
   */
  getState(): PollingTaskState {
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
  getStats(): PollingTaskStats {
    return { ...this.stats };
  }

  /**
   * Оригинальный цикл выполнения задачи (для задач без resourceId).
   * @private
   */
  async _runLoop(): Promise<void> {
    let backoffDelay = this.backoffDelay;

    this.logger.info('Starting run loop', { id: this.id } as LogContext);
    while (this.loopRunning && !this.stopped) {
      if (this.paused) {
        this.logger.debug('Task paused in loop', { id: this.id } as LogContext);
        await this._sleep(this.interval);
        continue;
      }

      if (this.shouldRun && this.shouldRun() === false) {
        this.logger.debug('Task should not run according to shouldRun function', {
          id: this.id,
        } as LogContext);
        await this._sleep(this.interval);
        continue;
      }

      this.onBeforeEach?.();
      this.executionInProgress = true;
      this.stats.totalRuns++;

      const release = await this.transportMutex.acquire();
      try {
        // Проверяем существование transport перед обращением к его методам
        const firstFunction = this.fn[0];
        if (firstFunction && typeof firstFunction === 'function') {
          const result = firstFunction();
          // Используем type guard для проверки наличия свойства transport
          if (result && hasTransportProperty(result) && result.transport) {
            // Используем type guard для проверки наличия метода flush у transport
            if (hasFlushMethod(result.transport)) {
              try {
                await result.transport.flush();
                this.logger.debug('Transport flushed successfully', { id: this.id } as LogContext);
              } catch (flushErr: unknown) {
                const error = flushErr instanceof Error ? flushErr : new Error(String(flushErr));
                this.logger.warn('Flush failed', {
                  id: this.id,
                  error: error.message,
                } as LogContext);
              }
            }
          }
        }

        let success = false;
        const results: unknown[] = [];
        for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
          let retryCount = 0;
          let result: unknown = null;
          let fnSuccess = false;
          while (this.loopRunning && !this.stopped && retryCount <= this.maxRetries) {
            try {
              const fnResult = this.fn[fnIndex]; // Извлекаем элемент массива
              if (typeof fnResult !== 'function') {
                // Проверяем, что это функция
                throw new PollingManagerError(
                  `Task ${this.id} fn at index ${fnIndex} is not a function`
                );
              }
              const promiseResult = fnResult(); // Вызываем функцию
              if (!(promiseResult instanceof Promise)) {
                throw new PollingManagerError(
                  `Task ${this.id} fn ${fnIndex} did not return a Promise`
                );
              }
              result = await this._withTimeout(promiseResult, this.taskTimeout); // Ждем результата
              fnSuccess = true;
              this.stats.successes++;
              this.stats.lastError = null;
              backoffDelay = this.backoffDelay;
              break;
            } catch (err: unknown) {
              const error = err instanceof Error ? err : new Error(String(err));
              retryCount++;
              this.stats.totalErrors++;
              this.stats.retries++;
              this.stats.lastError = error;
              this.onRetry?.(error, fnIndex, retryCount);

              const isFlushedError = error instanceof ModbusFlushError;
              if (isFlushedError) {
                this.logger.debug('Flush error detected, resetting backoff', {
                  id: this.id,
                } as LogContext);
                backoffDelay = this.backoffDelay;
              }

              const delay = isFlushedError
                ? Math.min(50, backoffDelay)
                : backoffDelay * Math.pow(2, retryCount - 1);
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
          success = success || fnSuccess;
        }

        this.stats.lastResult = results;
        this.stats.lastRunTime = Date.now();

        if (results.length > 0 && results.some(r => r !== null && r !== undefined)) {
          this.onData?.(results);
          // Используем только разрешенные поля в LogContext
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

        this.onFinish?.(success, results);
        // Используем только разрешенные поля в LogContext
        this.logger.info('Task execution completed', {
          id: this.id,
          success,
          resultsCount: results.length,
        } as LogContext);
        this.pollingManager.loggerInstance.flush();
      } finally {
        release();
        this.executionInProgress = false;
      }
      await this._sleep(this.interval);
    }
    this.loopRunning = false;
    this.logger.debug('Run loop finished', { id: this.id } as LogContext);
  }

  /**
   * Sleeps for given amount of milliseconds.
   * @param {number} ms
   * @returns {Promise}
   * @private
   */
  _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wraps a promise with a timeout.
   * @param {Promise} promise
   * @param {number} timeout
   * @returns {Promise}
   * @private
   */
  _withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
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
 * Гарантирует отсутствие дубликатов и последовательное выполнение.
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
  enqueue(taskController: TaskController): void {
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
  removeTask(taskId: string): void {
    const taskKey = `${this.resourceId}:${taskId}`;
    this.queuedOrProcessingTasks.delete(taskKey);
    this.taskQueue = this.taskQueue.filter(id => id !== taskId);
    this.logger.debug('Task removed from queue', { taskId } as LogContext);
  }

  /**
   * Проверяет, пуста ли очередь.
   * @returns {boolean}
   */
  isEmpty(): boolean {
    return this.taskQueue.length === 0;
  }

  /**
   * Очищает очередь.
   */
  clear(): void {
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
  markTaskReady(taskController: TaskController): void {
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
  async _processNext(): Promise<void> {
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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error executing task', {
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
}

/**
 * PollingManager управляет набором задач и очередями для ресурсов.
 * Обеспечивает последовательное выполнение задач, связанных с одним ресурсом.
 */
class PollingManager {
  private config: Required<PollingManagerConfig>;
  public tasks: Map<string, TaskController>;
  public queues: Map<string, TaskQueue>;
  private queuedOrProcessingTasks: Set<string>;
  public loggerInstance: Logger;
  public logger: LoggerInstance;

  /**
   * @param {Object} config - Конфигурация менеджера
   * @param {number} [config.defaultMaxRetries=3] - Максимальное количество попыток по умолчанию
   * @param {number} [config.defaultBackoffDelay=1000] - Задержка между попытками по умолчанию
   * @param {number} [config.defaultTaskTimeout=5000] - Таймаут задачи по умолчанию
   * @param {string} [config.logLevel='info'] - Уровень логирования
   */
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

    // Используем только разрешенные поля в LogContext
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

    if (options.interval && (typeof options.interval !== 'number' || options.interval <= 0)) {
      throw new PollingTaskValidationError('Interval must be a positive number');
    }

    if (options.fn && !Array.isArray(options.fn) && typeof options.fn !== 'function') {
      throw new PollingTaskValidationError('Function must be a function or array of functions');
    }

    if (options.maxRetries && (typeof options.maxRetries !== 'number' || options.maxRetries < 0)) {
      throw new PollingTaskValidationError('maxRetries must be a non-negative number');
    }

    if (
      options.backoffDelay &&
      (typeof options.backoffDelay !== 'number' || options.backoffDelay <= 0)
    ) {
      throw new PollingTaskValidationError('backoffDelay must be a positive number');
    }

    if (
      options.taskTimeout &&
      (typeof options.taskTimeout !== 'number' || options.taskTimeout <= 0)
    ) {
      throw new PollingTaskValidationError('taskTimeout must be a positive number');
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
  addTask(options: PollingTaskOptions): void {
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
        this.queues.get(resourceId)?.enqueue(controller);
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
      const err = error instanceof Error ? error : new Error(String(error));
      // Используем только разрешенные поля в LogContext
      this.logger.error('Failed to add task', {
        error: err.message,
        options: JSON.stringify(options),
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
  updateTask(id: string, newOptions: Partial<PollingTaskOptions>): void {
    if (!this.tasks.has(id)) {
      const error = new PollingTaskNotFoundError(id);
      this.logger.error('Failed to update task - not found', {
        id,
        error: error.message,
      } as LogContext);
      throw error;
    }

    // Используем только разрешенные поля в LogContext
    this.logger.info('Updating task', { id, newOptions: JSON.stringify(newOptions) } as LogContext);
    this.removeTask(id);
    this.addTask({ id, ...newOptions } as PollingTaskOptions);
  }

  /**
   * Удаляет задачу из менеджера и очереди.
   * @param {string} id - Идентификатор задачи
   */
  removeTask(id: string): void {
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
  restartTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Restarting task', { id } as LogContext);
      task.stop();
      if (task.resourceId && this.queues.has(task.resourceId)) {
        task.scheduleRun();
      } else {
        task.start();
      }
    } else {
      this.logger.warn('Attempt to restart non-existent task', { id } as LogContext);
    }
  }

  /**
   * Запускает задачу.
   * @param {string} id - Идентификатор задачи
   */
  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      this.logger.info('Starting task', { id } as LogContext);
      task.start();
    } else {
      this.logger.warn('Attempt to start non-existent task', { id } as LogContext);
    }
  }

  /**
   * Останавливает задачу.
   * @param {string} id - Идентификатор задачи
   */
  stopTask(id: string): void {
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
  pauseTask(id: string): void {
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
  resumeTask(id: string): void {
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
  setTaskInterval(id: string, interval: number): void {
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
  isTaskRunning(id: string): boolean {
    const task = this.tasks.get(id);
    const result = task ? task.isRunning() : false;
    return result;
  }

  /**
   * Проверяет, приостановлена ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  isTaskPaused(id: string): boolean {
    const task = this.tasks.get(id);
    const result = task ? task.isPaused() : false;
    return result;
  }

  /**
   * Получает состояние задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {Object|null}
   */
  getTaskState(id: string): PollingTaskState | null {
    const task = this.tasks.get(id);
    const result = task ? task.getState() : null;
    return result;
  }

  /**
   * Получает статистику задачи.
   * @param {string} id - Идентификатор задачи
   * @returns {Object|null}
   */
  getTaskStats(id: string): PollingTaskStats | null {
    const task = this.tasks.get(id);
    const result = task ? task.getStats() : null;
    return result;
  }

  /**
   * Проверяет, существует ли задача.
   * @param {string} id - Идентификатор задачи
   * @returns {boolean}
   */
  hasTask(id: string): boolean {
    const result = this.tasks.has(id);
    return result;
  }

  /**
   * Возвращает массив ID всех задач.
   * @returns {string[]}
   */
  getTaskIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Очищает все задачи.
   */
  clearAll(): void {
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
  restartAllTasks(): void {
    this.logger.info('Restarting all tasks');
    for (const task of this.tasks.values()) {
      task.stop();
      task.scheduleRun();
    }
    this.logger.info('All tasks restarted');
  }

  /**
   * Ставит на паузу все задачи.
   */
  pauseAllTasks(): void {
    this.logger.info('Pausing all tasks');
    for (const task of this.tasks.values()) {
      task.pause();
    }
    this.logger.info('All tasks paused');
  }

  /**
   * Возобновляет все задачи.
   */
  resumeAllTasks(): void {
    this.logger.info('Resuming all tasks');
    for (const task of this.tasks.values()) {
      task.resume();
    }
    this.logger.info('All tasks resumed');
  }

  /**
   * Запускает все задачи.
   */
  startAllTasks(): void {
    this.logger.info('Starting all tasks');
    for (const task of this.tasks.values()) {
      task.scheduleRun();
    }
    this.logger.info('All tasks started');
  }

  /**
   * Останавливает все задачи.
   */
  stopAllTasks(): void {
    this.logger.info('Stopping all tasks');
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.logger.info('All tasks stopped');
  }

  /**
   * Возвращает статистику всех задач.
   * @returns {Object}
   */
  getAllTaskStats(): Record<string, PollingTaskStats> {
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
   */
  async _executeQueuedTask(taskController: TaskController): Promise<void> {
    return taskController.executeOnce();
  }

  /**
   * Получает информацию о очереди
   * @param {string} resourceId - Идентификатор ресурса
   * @returns {Object|null}
   */
  getQueueInfo(resourceId: string): PollingQueueInfo | null {
    const queue = this.queues.get(resourceId);
    if (!queue) return null;

    return {
      resourceId,
      queueLength: queue.taskQueue.length,
      tasks: queue.taskQueue
        .map(id => {
          const task = this.tasks.get(id);
          const state = task?.getState();
          // Пропускаем задачи, которые не найдены или у которых состояние undefined
          if (!state) return null;
          return {
            id,
            state,
          };
        })
        .filter((item): item is { id: string; state: PollingTaskState } => item !== null), // Фильтруем null значения
    };
  }

  /**
   * Получает статистику системы
   * @returns {Object}
   */
  getSystemStats(): PollingSystemStats {
    return {
      totalTasks: this.tasks.size,
      totalQueues: this.queues.size,
      queuedTasks: this.queuedOrProcessingTasks.size,
      tasks: this.getAllTaskStats(),
    };
  }

  // === Методы для управления логгерами ===

  /**
   * Включает логгер PollingManager
   * @param {string} [level='info'] - Уровень логирования
   */
  enablePollingManagerLogger(level: LogLevel = 'info'): void {
    this.logger.setLevel(level);
  }

  /**
   * Отключает логгер PollingManager
   */
  disablePollingManagerLogger(): void {
    this.logger.setLevel('error');
  }

  /**
   * Включает логгеры всех TaskQueue
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskQueueLoggers(level: LogLevel = 'info'): void {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel(level);
    }
  }

  /**
   * Отключает логгеры всех TaskQueue
   */
  disableTaskQueueLoggers(): void {
    for (const queue of this.queues.values()) {
      queue.logger.setLevel('error');
    }
  }

  /**
   * Включает логгеры всех TaskController
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskControllerLoggers(level: LogLevel = 'info'): void {
    for (const task of this.tasks.values()) {
      task.logger.setLevel(level);
    }
  }

  /**
   * Отключает логгеры всех TaskController
   */
  disableTaskControllerLoggers(): void {
    for (const task of this.tasks.values()) {
      task.logger.setLevel('error');
    }
  }

  /**
   * Включает логгеры для конкретной очереди
   * @param {string} resourceId - Идентификатор ресурса очереди
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskQueueLogger(resourceId: string, level: LogLevel = 'info'): void {
    const queue = this.queues.get(resourceId);
    if (queue) {
      queue.logger.setLevel(level);
    }
  }

  /**
   * Отключает логгеры для конкретной очереди
   * @param {string} resourceId - Идентификатор ресурса очереди
   */
  disableTaskQueueLogger(resourceId: string): void {
    const queue = this.queues.get(resourceId);
    if (queue) {
      queue.logger.setLevel('error');
    }
  }

  /**
   * Включает логгер для конкретной задачи
   * @param {string} taskId - Идентификатор задачи
   * @param {string} [level='info'] - Уровень логирования
   */
  enableTaskControllerLogger(taskId: string, level: LogLevel = 'info'): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.logger.setLevel(level);
    }
  }

  /**
   * Отключает логгер для конкретной задачи
   * @param {string} taskId - Идентификатор задачи
   */
  disableTaskControllerLogger(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.logger.setLevel('error');
    }
  }

  /**
   * Включает все логгеры
   * @param {string} [level='info'] - Уровень логирования
   */
  enableAllLoggers(level: LogLevel = 'info'): void {
    this.enablePollingManagerLogger(level);
    this.enableTaskQueueLoggers(level);
    this.enableTaskControllerLoggers(level);
  }

  /**
   * Отключает все логгеры
   */
  disableAllLoggers(): void {
    this.disablePollingManagerLogger();
    this.disableTaskQueueLoggers();
    this.disableTaskControllerLoggers();
  }

  /**
   * Устанавливает уровень логирования для всех компонентов
   * @param {string} level - Уровень логирования
   */
  setLogLevelForAll(level: LogLevel): void {
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
