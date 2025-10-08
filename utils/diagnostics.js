// utils/diagnostics.js
const { FUNCTION_CODES, EXCEPTION_CODES } = require('../constants/constants');
const Logger = require('../logger');
const logger = new Logger();
logger.setLevel('info'); // Включаем info уровень по умолчанию

// Настраиваем формат лога: timestamp, level, logger
logger.setLogFormat(['timestamp', 'level', 'logger']);
// Устанавливаем кастомный форматтер для logger
logger.setCustomFormatter('logger', (value) => {
    return value ? `[${value}]` : '';
});

/**
 * Class that collects and analyzes statistics about Modbus communication.
 * @class
 * @alias Diagnostics
 */
class Diagnostics {
  /**
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.notificationThreshold=10] - Threshold for error notifications
   * @param {number} [options.errorRateThreshold=10] - Threshold for error rate notifications (%)
   * @param {number|number[]} [options.slaveId=1] - Slave ID(s) for metrics and logs
   * @param {string} [options.loggerName='diagnostics'] - Name for categorical logger
   */
  constructor(options = {}) {
    this.notificationThreshold = options.notificationThreshold || 10;
    this.errorRateThreshold = options.errorRateThreshold || 10; // % error rate
    this.slaveIds = Array.isArray(options.slaveId) ? options.slaveId : [options.slaveId || 1];
    this.logger = logger.createLogger(options.loggerName || 'Diagnostics');
    this.logger.setLevel('none'); // Отключаем логгер Diagnostics изначально
    this.reset();
  }

  /**
   * Resets all statistics and counters to their initial state.
   * @private
   */
  reset() {
    this.startTime = Date.now();

    this.totalRequests = 0;
    this.successfulResponses = 0;
    this.errorResponses = 0;

    this.timeouts = 0;
    this.crcErrors = 0;
    this.modbusExceptions = 0;
    this.exceptionCodeCounts = {};

    this.totalRetries = 0;
    this.totalRetrySuccesses = 0;

    this.lastResponseTime = null;
    this.minResponseTime = null;
    this.maxResponseTime = null;
    this._totalResponseTime = 0;
    this._totalResponseTimeAll = 0;

    this.lastErrorMessage = null;
    this.lastErrors = [];

    this.functionCallCounts = {};
    this.errorMessageCounts = {};

    this.lastSuccessDetails = null;
    this._lastFuncCode = null;
    this.lastExceptionCode = null;

    this.totalDataSent = 0;
    this.totalDataReceived = 0;

    this.lastRequestTimestamp = null;
    this.lastSuccessTimestamp = null;
    this.lastErrorTimestamp = null;

    this.totalSessions ??= 0;
    this.totalSessions++;

    this.requestTimestamps = []; // Для расчёта requests per second
  }

  /**
   * Resets specific statistics.
   * @param {string[]} [metrics] - Metrics to reset (e.g., ['errors', 'retries'])
   */
  resetStats(metrics = []) {
    const allMetrics = [
      'requests', 'successes', 'errors', 'timeouts', 'crcErrors', 'modbusExceptions',
      'retries', 'retrySuccesses', 'responseTimes', 'errorsList', 'functionCalls',
      'errorMessages', 'dataSent', 'dataReceived', 'timestamps', 'exceptionCodes'
    ];
    const toReset = metrics.length > 0 ? metrics : allMetrics;

    if (toReset.includes('requests')) this.totalRequests = 0;
    if (toReset.includes('successes')) this.successfulResponses = 0;
    if (toReset.includes('errors')) this.errorResponses = 0;
    if (toReset.includes('timeouts')) this.timeouts = 0;
    if (toReset.includes('crcErrors')) this.crcErrors = 0;
    if (toReset.includes('modbusExceptions')) this.modbusExceptions = 0;
    if (toReset.includes('exceptionCodes')) this.exceptionCodeCounts = {};
    if (toReset.includes('retries')) this.totalRetries = 0;
    if (toReset.includes('retrySuccesses')) this.totalRetrySuccesses = 0;
    if (toReset.includes('responseTimes')) {
      this.lastResponseTime = null;
      this.minResponseTime = null;
      this.maxResponseTime = null;
      this._totalResponseTime = 0;
      this._totalResponseTimeAll = 0;
    }
    if (toReset.includes('errorsList')) {
      this.lastErrorMessage = null;
      this.lastErrors = [];
    }
    if (toReset.includes('functionCalls')) this.functionCallCounts = {};
    if (toReset.includes('errorMessages')) this.errorMessageCounts = {};
    if (toReset.includes('dataSent')) this.totalDataSent = 0;
    if (toReset.includes('dataReceived')) this.totalDataReceived = 0;
    if (toReset.includes('timestamps')) {
      this.lastRequestTimestamp = null;
      this.lastSuccessTimestamp = null;
      this.lastErrorTimestamp = null;
      this.requestTimestamps = [];
    }
  }

  /**
   * Destroys the diagnostics instance, clearing resources.
   */
  destroy() {
    this.reset();
    this.logger.setLevel('none'); // Отключаем логгер
  }

  /**
   * Outputs a notification if error count or error rate exceeds thresholds.
   * @private
   */
  sendNotification() {
    if (this.errorResponses <= this.notificationThreshold && this.errorRate <= this.errorRateThreshold) return;

    const notification = {
      timestamp: new Date().toISOString(),
      slaveIds: this.slaveIds,
      errorCount: this.errorResponses,
      errorRate: this.errorRate?.toFixed(2) || 'N/A',
      lastError: this.lastErrorMessage,
      lastErrors: this.lastErrors
    };

    this.logger.warn('Excessive errors detected', {
      slaveId: this.slaveIds.join(','),
      errorCount: notification.errorCount,
      errorRate: notification.errorRate,
      lastError: notification.lastError,
      logger: 'Diagnostics'
    });
  }

  /**
   * Records a request event.
   * @param {number} [slaveId] - Slave ID for the request
   * @param {number} [funcCode] - Modbus function code
   */
  recordRequest(slaveId, funcCode) {
    this.totalRequests++;
    this.lastRequestTimestamp = new Date().toISOString();
    this.requestTimestamps.push(Date.now());
    if (this.requestTimestamps.length > 1000) this.requestTimestamps.shift(); // Ограничиваем историю

    this.logger.trace('Request sent', { 
      slaveId: slaveId || this.slaveIds[0], 
      funcCode,
      logger: 'Diagnostics' 
    });
  }

  /**
   * Records a retry event.
   * @param {number} attempts - Number of retry attempts
   * @param {number} [slaveId] - Slave ID
   * @param {number} [funcCode] - Modbus function code
   */
  recordRetry(attempts, slaveId, funcCode) {
    this.totalRetries += attempts;
    this.logger.debug(`Retry attempt #${attempts}`, { 
      slaveId: slaveId || this.slaveIds[0], 
      funcCode,
      logger: 'Diagnostics' 
    });
  }

  /**
   * Records a successful retry event.
   * @param {number} [slaveId] - Slave ID
   * @param {number} [funcCode] - Modbus function code
   */
  recordRetrySuccess(slaveId, funcCode) {
    this.totalRetrySuccesses++;
    this.logger.debug('Retry successful', { 
      slaveId: slaveId || this.slaveIds[0], 
      funcCode,
      logger: 'Diagnostics' 
    });
  }

  /**
   * Records a function call event.
   * @param {number} funcCode - Modbus function code
   * @param {number} [slaveId] - Slave ID
   */
  recordFunctionCall(funcCode, slaveId) {
    if (funcCode == null) return;
    this._lastFuncCode = funcCode;
    this.functionCallCounts[funcCode] ??= 0;
    this.functionCallCounts[funcCode]++;
    this.logger.trace('Function called', {
      slaveId: slaveId || this.slaveIds[0],
      funcCode,
      funcName: Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === funcCode) || 'Unknown',
      logger: 'Diagnostics'
    });
  }

  /**
   * Records a successful response event.
   * @param {number} responseTimeMs - Response time in milliseconds
   * @param {number} [slaveId] - Slave ID
   * @param {number} [funcCode] - Modbus function code
   */
  recordSuccess(responseTimeMs, slaveId, funcCode) {
    this.successfulResponses++;
    this.lastResponseTime = responseTimeMs;
    this.minResponseTime = this.minResponseTime == null ? responseTimeMs : Math.min(this.minResponseTime, responseTimeMs);
    this.maxResponseTime = this.maxResponseTime == null ? responseTimeMs : Math.max(this.maxResponseTime, responseTimeMs);
    this._totalResponseTime += responseTimeMs;
    this._totalResponseTimeAll += responseTimeMs;

    this.lastSuccessTimestamp = new Date().toISOString();

    this.lastSuccessDetails = {
      responseTime: responseTimeMs,
      timestamp: this.lastSuccessTimestamp,
      funcCode,
      slaveId: slaveId || this.slaveIds[0]
    };

    // this.logger.info('Response received', {
    //   slaveId: slaveId || this.slaveIds[0],
    //   funcCode,
    //   responseTime: responseTimeMs,
    //   logger: 'Diagnostics'
    // });
  }

  /**
   * Records an error event.
   * @param {Error} error - Error object
   * @param {Object} [options] - Optional parameters
   * @param {string} [options.code] - Error code (e.g., 'timeout', 'crc')
   * @param {number} [options.responseTimeMs=0] - Response time in milliseconds
   * @param {number} [options.exceptionCode] - Modbus exception code
   * @param {number} [options.slaveId] - Slave ID
   * @param {number} [options.funcCode] - Modbus function code
   */
  recordError(error, { code = null, responseTimeMs = 0, exceptionCode = null, slaveId, funcCode } = {}) {
    this.errorResponses++;
    this.lastErrorMessage = error.message || String(error);
    this._totalResponseTimeAll += responseTimeMs;

    this.lastErrorTimestamp = new Date().toISOString();

    this.lastErrors.push(this.lastErrorMessage);
    if (this.lastErrors.length > 10) this.lastErrors.shift();

    const msg = (error.message || '').toLowerCase();
    if (code === 'timeout' || msg.includes('timeout')) {
      this.timeouts++;
    } else if (code === 'crc' || msg.includes('crc')) {
      this.crcErrors++;
    } else if (code === 'modbus-exception' || msg.includes('modbus exception')) {
      this.modbusExceptions++;
      if (typeof exceptionCode === 'number') {
        this.lastExceptionCode = exceptionCode;
        this.exceptionCodeCounts[exceptionCode] ??= 0;
        this.exceptionCodeCounts[exceptionCode]++;
      }
    }

    this.errorMessageCounts[this.lastErrorMessage] ??= 0;
    this.errorMessageCounts[this.lastErrorMessage]++;

    this.logger.error(this.lastErrorMessage, {
      slaveId: slaveId || this.slaveIds[0],
      funcCode,
      exceptionCode,
      responseTime: responseTimeMs,
      logger: 'Diagnostics'
    });

    this.sendNotification();
  }

  /**
   * Records the amount of outgoing data in bytes.
   * @param {number} byteLength - Number of bytes sent
   * @param {number} [slaveId] - Slave ID
   * @param {number} [funcCode] - Modbus function code
   */
  recordDataSent(byteLength, slaveId, funcCode) {
    this.totalDataSent += byteLength;
    this.logger.trace(`Data sent: ${byteLength} bytes`, { 
      slaveId: slaveId || this.slaveIds[0], 
      funcCode,
      logger: 'Diagnostics' 
    });
  }

  /**
   * Records the amount of incoming data in bytes.
   * @param {number} byteLength - Number of bytes received
   * @param {number} [slaveId] - Slave ID
   * @param {number} [funcCode] - Modbus function code
   */
  recordDataReceived(byteLength, slaveId, funcCode) {
    this.totalDataReceived += byteLength;
    this.logger.trace(`Data received: ${byteLength} bytes`, { 
      slaveId: slaveId || this.slaveIds[0], 
      funcCode,
      logger: 'Diagnostics' 
    });
  }

  /**
   * Returns the average response time in milliseconds for successful responses.
   * @returns {number|null} Average response time in milliseconds
   */
  get averageResponseTime() {
    return this.successfulResponses === 0
      ? null
      : this._totalResponseTime / this.successfulResponses;
  }

  /**
   * Returns the average response time including errors.
   * @returns {number|null} Average response time in milliseconds
   */
  get averageResponseTimeAll() {
    const total = this.successfulResponses + this.errorResponses;
    return total === 0 ? null : this._totalResponseTimeAll / total;
  }

  /**
   * Calculates the error rate as a percentage of total requests.
   * @returns {number|null} Error rate percentage or null if totalRequests is zero
   */
  get errorRate() {
    return this.totalRequests === 0 ? null : (this.errorResponses / this.totalRequests) * 100;
  }

  /**
   * Calculates the requests per second based on recent activity.
   * @returns {number|null} Requests per second or null if insufficient data
   */
  get requestsPerSecond() {
    if (this.requestTimestamps.length < 2) return null;
    const timeSpan = (this.requestTimestamps[this.requestTimestamps.length - 1] - this.requestTimestamps[0]) / 1000;
    return timeSpan === 0 ? null : this.requestTimestamps.length / timeSpan;
  }

  /**
   * Returns the uptime in seconds.
   * @returns {number} Uptime in seconds
   */
  get uptimeSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Analyzes statistics and returns potential issues.
   * @returns {Object} Analysis results with warnings
   */
  analyze() {
    const warnings = [];
    if (this.errorRate > this.errorRateThreshold) {
      warnings.push(`High error rate: ${this.errorRate.toFixed(2)}% (threshold: ${this.errorRateThreshold}%)`);
    }
    if (this.timeouts > this.notificationThreshold) {
      warnings.push(`High timeout count: ${this.timeouts}`);
    }
    if (this.crcErrors > this.notificationThreshold) {
      warnings.push(`High CRC error count: ${this.crcErrors}`);
    }
    if (this.modbusExceptions > this.notificationThreshold) {
      warnings.push(`High Modbus exception count: ${this.modbusExceptions}`);
    }
    if (this.maxResponseTime > 1000) {
      warnings.push(`High max response time: ${this.maxResponseTime}ms`);
    }
    return {
      warnings,
      isHealthy: warnings.length === 0,
      stats: this.getStats()
    };
  }

  /**
   * Returns a JSON object containing all statistics and counters.
   * @returns {Object} Object containing all statistics and counters
   */
  getStats() {
    return {
      uptimeSeconds: this.uptimeSeconds,
      totalSessions: this.totalSessions,
      totalRequests: this.totalRequests,
      successfulResponses: this.successfulResponses,
      errorResponses: this.errorResponses,
      timeouts: this.timeouts,
      crcErrors: this.crcErrors,
      modbusExceptions: this.modbusExceptions,
      exceptionCodeCounts: Object.entries(this.exceptionCodeCounts).reduce((acc, [code, count]) => {
        acc[`${code}/${EXCEPTION_CODES[code] || 'Unknown'}`] = count;
        return acc;
      }, {}),
      totalRetries: this.totalRetries,
      totalRetrySuccesses: this.totalRetrySuccesses,
      lastResponseTime: this.lastResponseTime,
      minResponseTime: this.minResponseTime,
      maxResponseTime: this.maxResponseTime,
      averageResponseTime: this.averageResponseTime,
      averageResponseTimeAll: this.averageResponseTimeAll,
      requestsPerSecond: this.requestsPerSecond,
      errorRate: this.errorRate,
      lastErrorMessage: this.lastErrorMessage,
      lastErrors: [...this.lastErrors],
      lastSuccessDetails: this.lastSuccessDetails,
      functionCallCounts: Object.entries(this.functionCallCounts).reduce((acc, [code, count]) => {
        acc[`${code}/${Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === parseInt(code)) || 'Unknown'}`] = count;
        return acc;
      }, {}),
      commonErrors: Object.entries(this.errorMessageCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([message, count]) => ({ message, count })),
      dataSent: this.totalDataSent,
      dataReceived: this.totalDataReceived,
      lastRequestTimestamp: this.lastRequestTimestamp,
      lastSuccessTimestamp: this.lastSuccessTimestamp,
      lastErrorTimestamp: this.lastErrorTimestamp,
      slaveIds: [...this.slaveIds]
    };
  }

  /**
   * Prints formatted statistics to the console.
   */
  printStats() {
    const stats = this.getStats();
    this.logger.info('=== Modbus Diagnostics ===', { logger: 'Diagnostics' });
    this.logger.info(`Slave IDs: ${stats.slaveIds.join(', ')}`, { logger: 'Diagnostics' });
    this.logger.info(`Uptime: ${stats.uptimeSeconds} seconds`, { logger: 'Diagnostics' });
    this.logger.info(`Total Sessions: ${stats.totalSessions}`, { logger: 'Diagnostics' });
    this.logger.info(`Total Requests: ${stats.totalRequests}`, { logger: 'Diagnostics' });
    this.logger.info(`Successful Responses: ${stats.successfulResponses}`, { logger: 'Diagnostics' });
    this.logger.info(`Error Responses: ${stats.errorResponses} (Rate: ${stats.errorRate?.toFixed(2) || 'N/A'}%)`, { logger: 'Diagnostics' });
    this.logger.info(`Timeouts: ${stats.timeouts}`, { logger: 'Diagnostics' });
    this.logger.info(`CRC Errors: ${stats.crcErrors}`, { logger: 'Diagnostics' });
    this.logger.info(`Modbus Exceptions: ${stats.modbusExceptions}`, { logger: 'Diagnostics' });
    this.logger.info(`Exception Codes: ${JSON.stringify(stats.exceptionCodeCounts, null, 2)}`, { logger: 'Diagnostics' });
    this.logger.info(`Total Retries: ${stats.totalRetries}`, { logger: 'Diagnostics' });
    this.logger.info(`Successful Retries: ${stats.totalRetrySuccesses}`, { logger: 'Diagnostics' });
    this.logger.info(`Last Response Time: ${stats.lastResponseTime || 'N/A'} ms`, { logger: 'Diagnostics' });
    this.logger.info(`Min Response Time: ${stats.minResponseTime || 'N/A'} ms`, { logger: 'Diagnostics' });
    this.logger.info(`Max Response Time: ${stats.maxResponseTime || 'N/A'} ms`, { logger: 'Diagnostics' });
    this.logger.info(`Average Response Time (Success): ${stats.averageResponseTime?.toFixed(2) || 'N/A'} ms`, { logger: 'Diagnostics' });
    this.logger.info(`Average Response Time (All): ${stats.averageResponseTimeAll?.toFixed(2) || 'N/A'} ms`, { logger: 'Diagnostics' });
    this.logger.info(`Requests per Second: ${stats.requestsPerSecond?.toFixed(2) || 'N/A'}`, { logger: 'Diagnostics' });
    this.logger.info(`Data Sent: ${stats.dataSent} bytes`, { logger: 'Diagnostics' });
    this.logger.info(`Data Received: ${stats.dataReceived} bytes`, { logger: 'Diagnostics' });
    this.logger.info(`Last Request: ${stats.lastRequestTimestamp || 'N/A'}`, { logger: 'Diagnostics' });
    this.logger.info(`Last Success: ${stats.lastSuccessTimestamp || 'N/A'}`, { logger: 'Diagnostics' });
    this.logger.info(`Last Error: ${stats.lastErrorTimestamp || 'N/A'}`, { logger: 'Diagnostics' });
    this.logger.info('Function Calls:', { logger: 'Diagnostics' });
    this.logger.info(JSON.stringify(stats.functionCallCounts, null, 2), { logger: 'Diagnostics' });
    this.logger.info('Common Errors:', { logger: 'Diagnostics' });
    this.logger.info(JSON.stringify(stats.commonErrors, null, 2), { logger: 'Diagnostics' });
    this.logger.info('=========================', { logger: 'Diagnostics' });
  }

  /**
   * Returns a JSON string containing all statistics and counters.
   * @returns {string} JSON string containing all statistics and counters
   */
  serialize() {
    return JSON.stringify(this.getStats(), null, 2);
  }

  /**
   * Returns an array of objects containing metric names and their values.
   * @returns {Array<Object>} Array of objects containing metric names and their values
   */
  toTable() {
    const stats = this.getStats();
    return Object.entries(stats).map(([metric, value]) => ({ metric, value }));
  }

  /**
   * Merges another Diagnostics object into this one.
   * @param {Diagnostics} other - Diagnostics object to merge with
   */
  mergeWith(other) {
    if (!(other instanceof Diagnostics)) return;

    this.totalRequests += other.totalRequests;
    this.successfulResponses += other.successfulResponses;
    this.errorResponses += other.errorResponses;

    this.timeouts += other.timeouts;
    this.crcErrors += other.crcErrors;
    this.modbusExceptions += other.modbusExceptions;

    for (const [code, count] of Object.entries(other.exceptionCodeCounts)) {
      this.exceptionCodeCounts[code] ??= 0;
      this.exceptionCodeCounts[code] += count;
    }

    this.totalRetries += other.totalRetries;
    this.totalRetrySuccesses += other.totalRetrySuccesses;

    this._totalResponseTime += other._totalResponseTime;
    this._totalResponseTimeAll += other._totalResponseTimeAll;
    if (other.minResponseTime != null) {
      this.minResponseTime = this.minResponseTime == null
        ? other.minResponseTime
        : Math.min(this.minResponseTime, other.minResponseTime);
    }
    if (other.maxResponseTime != null) {
      this.maxResponseTime = this.maxResponseTime == null
        ? other.maxResponseTime
        : Math.max(this.maxResponseTime, other.maxResponseTime);
    }

    this.totalDataSent += other.totalDataSent;
    this.totalDataReceived += other.totalDataReceived;

    other.lastErrors.forEach(err => this.lastErrors.push(err));
    if (this.lastErrors.length > 10) this.lastErrors = this.lastErrors.slice(-10);

    for (const [code, count] of Object.entries(other.functionCallCounts)) {
      this.functionCallCounts[code] ??= 0;
      this.functionCallCounts[code] += count;
    }

    for (const [msg, count] of Object.entries(other.errorMessageCounts)) {
      this.errorMessageCounts[msg] ??= 0;
      this.errorMessageCounts[msg] += count;
    }

    this.totalSessions += other.totalSessions ?? 0;
    this.slaveIds = [...new Set([...this.slaveIds, ...other.slaveIds])];
    this.requestTimestamps.push(...other.requestTimestamps);
    if (this.requestTimestamps.length > 1000) this.requestTimestamps = this.requestTimestamps.slice(-1000);

    this.logger.info('Merged diagnostics', { 
      slaveIds: other.slaveIds,
      logger: 'Diagnostics' 
    });
  }
}

module.exports = { Diagnostics };