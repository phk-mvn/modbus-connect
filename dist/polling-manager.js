"use strict";
// modbus/polling-manager.ts
const async_mutex_1 = require("async-mutex");
const pino_1 = require("pino");
const errors_js_1 = require("./errors.js");
/**
 * TaskController manages the full lifecycle of a single polling task.
 * It is tightly coupled with a PollingManager instance and handles scheduling,
 * execution with retries, timeouts, backoff logic, and all lifecycle callbacks.
 */
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
    logger;
    manager;
    timerId = null;
    isEnqueued = false;
    /**
     * Creates a new TaskController instance.
     * @param options - Configuration options for this polling task
     * @param manager - Reference to the parent PollingManager (used for queue operations)
     */
    constructor(options, manager) {
        const { id, priority = 0, interval, fn, onData, onError, onStart, onStop, onFinish, onBeforeEach, onRetry, shouldRun, onSuccess, onFailure, name = null, maxRetries = 3, backoffDelay = 1000, taskTimeout = 5000, } = options;
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
        this.logger = manager.logger.child({ component: 'Task', taskId: id });
        this.logger.debug({
            id,
            priority,
            interval,
            maxRetries,
            backoffDelay,
            taskTimeout,
        }, 'TaskController created');
    }
    /**
     * Starts the task.
     * If the task is already running, does nothing.
     * Sets the stopped flag to false, calls the `onStart` callback,
     * and schedules the first execution immediately.
     */
    start() {
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
     * - Sets the `stopped` flag to true
     * - Clears any pending timeout
     * - Removes the task from the execution queue
     * - Calls the `onStop` callback
     * After calling `stop()`, the task will no longer be executed automatically.
     */
    stop() {
        if (this.stopped) {
            this.logger.debug('Task already stopped');
            return;
        }
        this.stopped = true;
        this.isEnqueued = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        this.manager.removeFromQueue(this.id);
        this.logger.info('Task stopped');
        this.onStop?.();
    }
    /**
     * Pauses the task temporarily.
     * The task remains in the manager's task list but will not execute
     * until `resume()` is called. Any currently running execution will finish,
     * but the next scheduled run will be skipped while paused.
     */
    pause() {
        if (this.paused) {
            this.logger.debug('Task already paused');
            return;
        }
        this.paused = true;
        this.logger.info('Task paused');
    }
    /**
     * Resumes a previously paused task.
     * If the task is not stopped and is currently paused, it clears the pause flag
     * and schedules the next execution if no timer is active and execution is not in progress.
     */
    resume() {
        if (!this.stopped && this.paused) {
            this.paused = false;
            this.logger.info('Task resumed');
            if (!this.timerId && !this.executionInProgress && !this.isEnqueued) {
                this._scheduleNextRun(true);
            }
        }
        else {
            this.logger.debug({ id: this.id }, 'Cannot resume task - not paused or stopped');
        }
    }
    /**
     * Schedules the next execution of this task.
     * @param immediate - If true, the task will run immediately (delay = 0). Otherwise, it waits for the configured `interval`.
     * Clears any existing timer before setting a new one.
     * The task is enqueued through the manager when the timer fires.
     */
    _scheduleNextRun(immediate = false) {
        if (this.stopped)
            return;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        const delay = immediate ? 0 : this.interval;
        this.timerId = setTimeout(() => {
            this.timerId = null;
            if (this.stopped)
                return;
            this.isEnqueued = true;
            this.manager.enqueueTask(this);
        }, delay);
    }
    /**
     * Executes the task's functions with full retry logic, timeouts, and callbacks.
     * This is the core execution method called by the queue processor.
     * It handles:
     * - Checking stopped/paused state and `shouldRun` condition
     * - Executing each function in sequence
     * - Retrying failed functions with exponential backoff + jitter
     * - Special handling for ModbusFlushError (faster retry)
     * - Timeout protection for each function
     * - Calling all lifecycle callbacks (`onBeforeEach`, `onData`, `onSuccess`, `onFailure`, `onFinish`, etc.)
     * After execution completes (success or failure), it always schedules the next run.
     */
    async execute() {
        this.isEnqueued = false;
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
        try {
            let overallSuccess = false;
            const results = [];
            for (let fnIndex = 0; fnIndex < this.fn.length; fnIndex++) {
                if (this.stopped || this.paused)
                    break;
                let retryCount = 0;
                let result = null;
                let fnSuccess = false;
                while (!this.stopped && !this.paused && retryCount <= this.maxRetries) {
                    try {
                        const fnToExecute = this.fn[fnIndex];
                        if (typeof fnToExecute !== 'function')
                            break;
                        const executionResult = fnToExecute();
                        result = await this._withTimeout(Promise.resolve(executionResult), this.taskTimeout);
                        if (this.stopped || this.paused)
                            return;
                        fnSuccess = true;
                        break;
                    }
                    catch (err) {
                        if (this.stopped || this.paused)
                            return;
                        const error = err instanceof Error ? err : new errors_js_1.PollingManagerError(String(err));
                        this._logSpecificError(error, fnIndex, retryCount);
                        retryCount++;
                        this.onRetry?.(error, fnIndex, retryCount);
                        if (retryCount > this.maxRetries) {
                            this.onFailure?.(error);
                            this.onError?.(error, fnIndex, retryCount);
                        }
                        else {
                            const isFlushedError = error instanceof errors_js_1.ModbusFlushError;
                            const baseDelay = isFlushedError
                                ? 50
                                : this.backoffDelay * Math.pow(2, retryCount - 1);
                            const delay = baseDelay + Math.random() * baseDelay * 0.5;
                            await this._sleep(delay);
                        }
                    }
                }
                results.push(result);
                overallSuccess = overallSuccess || fnSuccess;
            }
            if (this.stopped || this.paused)
                return;
            if (results.length > 0 && results.some(r => r !== null && r !== undefined)) {
                this.onData?.(results);
            }
            if (overallSuccess) {
                this.onSuccess?.(results);
            }
            this.onFinish?.(overallSuccess, results);
        }
        catch (err) {
            if (!this.stopped && !this.paused) {
                this.logger.error({ id: this.id, error: err.message }, 'Fatal error in task');
            }
        }
        finally {
            this.executionInProgress = false;
            if (!this.stopped && !this.paused) {
                this._scheduleNextRun();
            }
        }
    }
    /**
     * Returns whether the task is currently running (not stopped).
     */
    isRunning() {
        return !this.stopped;
    }
    /**
     * Returns whether the task is currently paused.
     */
    isPaused() {
        return this.paused;
    }
    /**
     * Updates the interval for this task.
     * Note: The new interval will take effect on the next scheduling cycle.
     * @param ms - New interval in milliseconds
     */
    setInterval(ms) {
        this.interval = ms;
        this.logger.info('Interval updated');
    }
    /**
     * Returns the current state of the task.
     */
    getState() {
        return {
            stopped: this.stopped,
            paused: this.paused,
            running: !this.stopped,
            inProgress: this.executionInProgress,
        };
    }
    /**
     * Logs a specific error that occurred during function execution.
     * @param error - The error that occurred
     * @param fnIdx - Index of the function in the fn array
     * @param retry - Current retry count
     */
    _logSpecificError(error, fnIdx, retry) {
        const errorName = error.constructor.name;
        this.logger.error(`Fail (fn:${fnIdx}, retry:${retry}) -> ${errorName}: ${error.message}`);
    }
    /**
     * Helper method that returns a promise which resolves after the specified delay.
     * @param ms - Delay in milliseconds
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Wraps a promise with a timeout.
     * If the promise does not settle within the timeout period, it rejects with a `ModbusTimeoutError`.
     * @param promise - Promise to execute with timeout
     * @param timeout - Timeout in milliseconds
     */
    _withTimeout(promise, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new errors_js_1.ModbusTimeoutError('Task timed out')), timeout);
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
 * PollingManager is the main class responsible for managing multiple polling tasks.
 * It handles task registration, lifecycle control (start/stop/pause), priority-based queuing,
 * concurrent execution safety via mutex, and comprehensive logging.
 */
class PollingManager {
    config;
    tasks;
    executionQueue;
    mutex;
    isProcessing;
    paused;
    logger;
    /**
     * Creates a new PollingManager instance.
     * @param config - Optional configuration for the manager (defaults, log level, etc.)
     */
    constructor(config = {}) {
        this.logger = (0, pino_1.pino)({
            level: config.logLevel || 'info',
            base: { component: 'Polling Manager' },
            transport: process.env.NODE_ENV !== 'production'
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
        this.config = {
            defaultMaxRetries: 3,
            defaultBackoffDelay: 1000,
            defaultTaskTimeout: 5000,
            interTaskDelay: config.interTaskDelay ?? 0,
            logLevel: 'info',
            ...config,
        };
        this.tasks = new Map();
        this.executionQueue = [];
        this.mutex = new async_mutex_1.Mutex();
        this.isProcessing = false;
        this.paused = false;
        this.logger.debug('PollingManager initialized');
    }
    /**
     * Validates the options object passed when adding a task.
     * @throws PollingTaskValidationError if validation fails
     */
    _validateTaskOptions(options) {
        if (!options || typeof options !== 'object') {
            throw new errors_js_1.PollingTaskValidationError('Task options must be an object');
        }
        if (!options.id) {
            throw new errors_js_1.PollingTaskValidationError('Task must have an "id"');
        }
        if (typeof options.interval !== 'number' || options.interval <= 0) {
            throw new errors_js_1.PollingTaskValidationError('Interval must be a positive number');
        }
        const { fn } = options;
        if (Array.isArray(fn)) {
            if (fn.length === 0) {
                throw new errors_js_1.PollingTaskValidationError('fn array cannot be empty');
            }
            if (fn.some(f => typeof f !== 'function')) {
                throw new errors_js_1.PollingTaskValidationError('All elements in fn array must be functions');
            }
        }
        else if (typeof fn !== 'function') {
            throw new errors_js_1.PollingTaskValidationError('fn must be a function or an array of functions');
        }
    }
    /**
     * Adds a new polling task to the manager.
     * @param options - Configuration for the new task
     * @throws PollingTaskAlreadyExistsError if a task with the same id already exists
     * @throws PollingTaskValidationError if options are invalid
     */
    addTask(options) {
        try {
            this._validateTaskOptions(options);
            if (this.tasks.has(options.id))
                throw new errors_js_1.PollingTaskAlreadyExistsError(options.id);
            const task = new TaskController({
                ...options,
                maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
                backoffDelay: options.backoffDelay ?? this.config.defaultBackoffDelay,
                taskTimeout: options.taskTimeout ?? this.config['defaultTaskTimeout'],
            }, this);
            this.tasks.set(options.id, task);
            this.logger.info(`Task added -> ${options.id}`);
            if (options.immediate !== false)
                task.start();
        }
        catch (error) {
            const err = error instanceof Error ? error : new errors_js_1.PollingManagerError(String(error));
            this.logger.error({ error: err.message }, 'Failed to add task');
            throw err;
        }
    }
    /**
     * Updates an existing task by replacing it with new options.
     * Preserves the previous running state: if the task was running before update, it will be restarted after the update.
     * @param id - ID of the task to update
     * @param newOptions - New options to merge with existing ones
     * @throws PollingTaskNotFoundError if task with given id does not exist
     */
    updateTask(id, newOptions) {
        const oldTask = this.tasks.get(id);
        if (!oldTask)
            throw new errors_js_1.PollingTaskNotFoundError(id);
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
            name: oldTask.name ?? undefined,
            maxRetries: oldTask.maxRetries,
            backoffDelay: oldTask.backoffDelay,
            taskTimeout: oldTask.taskTimeout,
        };
        const mergedOptions = { ...oldOptions, ...newOptions };
        const wasRunning = oldTask.isRunning();
        this.removeTask(id);
        this.addTask(mergedOptions);
        if (wasRunning)
            this.startTask(id);
    }
    /**
     * Removes a task completely from the manager.
     * Stops the task first, then deletes it from the tasks map and removes it from the queue.
     * @param id - ID of the task to remove
     */
    removeTask(id) {
        const task = this.tasks.get(id);
        if (task) {
            task.stop();
            this.tasks.delete(id);
            this.removeFromQueue(id);
            this.logger.info({ id }, 'Task removed');
        }
        else {
            this.logger.warn({ id }, 'Attempt to remove non-existent task');
        }
    }
    /**
     * Restarts a task (stops it and starts it again with a small delay).
     * @param id - ID of the task to restart
     */
    restartTask(id) {
        const task = this.tasks.get(id);
        if (task) {
            task.stop();
            setTimeout(() => {
                const freshTask = this.tasks.get(id);
                if (freshTask)
                    freshTask.start();
            }, 0);
        }
    }
    /**
     * Starts a specific task by its ID.
     * @param id - ID of the task to start
     * @throws PollingTaskNotFoundError if task does not exist
     */
    startTask(id) {
        const task = this.tasks.get(id);
        if (task)
            task.start();
        else
            throw new errors_js_1.PollingTaskNotFoundError(id);
    }
    /**
     * Stops a specific task by its ID.
     * @param id - ID of the task to stop
     */
    stopTask(id) {
        const task = this.tasks.get(id);
        if (task)
            task.stop();
    }
    /**
     * Pauses a specific task by its ID.
     * @param id - ID of the task to pause
     */
    pauseTask(id) {
        const task = this.tasks.get(id);
        if (task)
            task.pause();
    }
    /**
     * Resumes a specific task by its ID.
     * @param id - ID of the task to resume
     */
    resumeTask(id) {
        const task = this.tasks.get(id);
        if (task) {
            task.resume();
            this._processQueue();
        }
    }
    /**
     * Changes the polling interval for a specific task.
     * @param id - ID of the task
     * @param interval - New interval in milliseconds
     */
    setTaskInterval(id, interval) {
        const task = this.tasks.get(id);
        if (task)
            task.setInterval(interval);
    }
    /**
     * Checks if a task is currently running.
     * @param id - ID of the task
     * @returns true if the task exists and is running
     */
    isTaskRunning(id) {
        const task = this.tasks.get(id);
        return task ? task.isRunning() : false;
    }
    /**
     * Checks if a task is currently paused.
     * @param id - ID of the task
     * @returns true if the task exists and is paused
     */
    isTaskPaused(id) {
        const task = this.tasks.get(id);
        return task ? task.isPaused() : false;
    }
    /**
     * Returns the current state of a task.
     * @param id - ID of the task
     * @returns Task state object or null if task does not exist
     */
    getTaskState(id) {
        const task = this.tasks.get(id);
        return task ? task.getState() : null;
    }
    /**
     * Checks if a task with the given ID exists.
     * @param id - Task ID
     */
    hasTask(id) {
        return this.tasks.has(id);
    }
    /**
     * Returns an array of all task IDs currently registered.
     */
    getTaskIds() {
        return Array.from(this.tasks.keys());
    }
    /**
     * Removes all tasks from the manager.
     * Stops every task, clears the task map and execution queue.
     */
    clearAll() {
        this.logger.info('Clearing all tasks');
        this.paused = true;
        this.tasks.forEach(task => task.stop());
        this.tasks.clear();
        this.executionQueue = [];
        this.logger.info('All tasks cleared');
    }
    /**
     * Restarts all registered tasks.
     */
    restartAllTasks() {
        Array.from(this.tasks.keys()).forEach(id => {
            const task = this.tasks.get(id);
            if (task) {
                task.stop();
                setTimeout(() => task.start(), 0);
            }
        });
    }
    /**
     * Pauses all tasks.
     */
    pauseAllTasks() {
        this.paused = true;
        this.tasks.forEach(task => task.pause());
    }
    /**
     * Resumes all paused tasks and restarts queue processing.
     */
    resumeAllTasks() {
        this.paused = false;
        this.tasks.forEach(task => task.resume());
        this._processQueue();
    }
    /**
     * Starts all tasks immediately.
     */
    startAllTasks() {
        this.paused = false;
        this.tasks.forEach(task => task.start());
    }
    /**
     * Stops all tasks and clears the execution queue.
     */
    stopAllTasks() {
        this.paused = true;
        this.tasks.forEach(task => task.stop());
        this.executionQueue = [];
    }
    /**
     * Returns information about the current execution queue.
     */
    getQueueInfo() {
        return {
            queueLength: this.executionQueue.length,
            tasks: this.executionQueue.map(task => ({
                id: task.id,
                state: task.getState(),
            })),
        };
    }
    /**
     * Returns basic system statistics about the polling manager.
     */
    getSystemStats() {
        return {
            totalTasks: this.tasks.size,
            totalQueues: 1,
            queuedTasks: this.executionQueue.length,
        };
    }
    /**
     * Adds a task to the priority-based execution queue.
     * If the task is not already in the queue, it is added and the queue is sorted by priority (higher first).
     * Then triggers queue processing.
     * @param task - TaskController instance to enqueue
     */
    enqueueTask(task) {
        if (!this.executionQueue.includes(task)) {
            this.executionQueue.push(task);
            this.executionQueue.sort((a, b) => b.priority - a.priority);
            this.logger.debug({ id: task.id, queueLen: this.executionQueue.length }, 'Enqueued');
            this._processQueue();
        }
    }
    /**
     * Removes a task from the execution queue by its ID.
     * @param taskId - ID of the task to remove from queue
     */
    removeFromQueue(taskId) {
        this.executionQueue = this.executionQueue.filter(t => t.id !== taskId);
    }
    /**
     * Helper method that returns a promise which resolves after the specified delay.
     * @param ms - Delay in milliseconds
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Main queue processing loop.
     * Processes tasks from the queue one by one with small delays between executions
     * to prevent overwhelming the system. Uses `isProcessing` flag to avoid concurrent processing loops.
     * This method is called automatically whenever a task is enqueued.
     */
    async _processQueue() {
        if (this.isProcessing || this.paused || this.executionQueue.length === 0) {
            return;
        }
        this.isProcessing = true;
        try {
            while (this.executionQueue.length > 0 && !this.paused) {
                const task = this.executionQueue.shift();
                if (!task)
                    continue;
                this.logger.debug({ id: task.id }, 'Processing task from queue');
                try {
                    await this.mutex.runExclusive(async () => {
                        if (!task.stopped && !task.paused) {
                            await task.execute();
                        }
                    });
                }
                catch (taskError) {
                    this.logger.error({ id: task.id, error: taskError.message }, 'Task execution failed in queue');
                }
                if (this.config.interTaskDelay > 0 && this.executionQueue.length > 0) {
                    await this._sleep(this.config.interTaskDelay);
                }
                else {
                    await new Promise(resolve => setImmediate?.(resolve) || setTimeout(resolve, 0));
                }
            }
        }
        catch (criticalError) {
            this.logger.error({ error: criticalError.message }, 'Critical error in _processQueue loop');
        }
        finally {
            this.isProcessing = false;
            if (this.executionQueue.length > 0 && !this.paused) {
                setTimeout(() => this._processQueue(), 0);
            }
        }
    }
    /**
     * Executes a function immediately with exclusive access using an internal mutex.
     * This method is intended to be used by ModbusClient or other components
     * that need to ensure atomicity of read/write operations while polling is active.
     * @param fn - Async function to execute under mutex protection
     * @returns Result of the executed function
     */
    async executeImmediate(fn) {
        const release = await this.mutex.acquire();
        try {
            return await fn();
        }
        finally {
            release();
        }
    }
    /**
     * Changes the log level for the manager and all its tasks.
     * @param level - Winston log level
     */
    setLogLevel(level) {
        this.logger.level = level;
        this.tasks.forEach(task => (task.logger.level = level));
    }
    /**
     * Disables all logging by setting the log level to 'error'.
     */
    disableAllLoggers() {
        this.setLogLevel('error');
    }
}
module.exports = PollingManager;
//# sourceMappingURL=polling-manager.js.map