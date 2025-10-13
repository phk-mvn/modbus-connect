"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var diagnostics_exports = {};
__export(diagnostics_exports, {
  Diagnostics: () => Diagnostics
});
module.exports = __toCommonJS(diagnostics_exports);
var import_constants = require("../constants/constants.js");
var import_logger = __toESM(require("../logger.js"));
const loggerInstance = new import_logger.default();
loggerInstance.setLevel("info");
loggerInstance.setLogFormat(["timestamp", "level", "logger"]);
loggerInstance.setCustomFormatter("logger", (value) => {
  return value ? `[${value}]` : "";
});
class Diagnostics {
  notificationThreshold;
  errorRateThreshold;
  slaveIds;
  logger;
  // Typed as LoggerInstance
  startTime;
  totalRequests = 0;
  successfulResponses = 0;
  errorResponses = 0;
  timeouts = 0;
  crcErrors = 0;
  modbusExceptions = 0;
  exceptionCodeCounts = {};
  totalRetries = 0;
  totalRetrySuccesses = 0;
  lastResponseTime = null;
  minResponseTime = null;
  maxResponseTime = null;
  _totalResponseTime = 0;
  _totalResponseTimeAll = 0;
  lastErrorMessage = null;
  lastErrors = [];
  functionCallCounts = {};
  errorMessageCounts = {};
  lastSuccessDetails = null;
  totalDataSent = 0;
  totalDataReceived = 0;
  lastRequestTimestamp = null;
  lastSuccessTimestamp = null;
  lastErrorTimestamp = null;
  totalSessions = 0;
  requestTimestamps = [];
  // Для расчёта requests per second
  // Кэшированные значения для производительности
  static FUNCTION_CODE_NAMES = /* @__PURE__ */ new Map([
    [import_constants.ModbusFunctionCode.READ_COILS, "READ_COILS"],
    [import_constants.ModbusFunctionCode.READ_DISCRETE_INPUTS, "READ_DISCRETE_INPUTS"],
    [import_constants.ModbusFunctionCode.READ_HOLDING_REGISTERS, "READ_HOLDING_REGISTERS"],
    [import_constants.ModbusFunctionCode.READ_INPUT_REGISTERS, "READ_INPUT_REGISTERS"],
    [import_constants.ModbusFunctionCode.WRITE_SINGLE_COIL, "WRITE_SINGLE_COIL"],
    [import_constants.ModbusFunctionCode.WRITE_SINGLE_REGISTER, "WRITE_SINGLE_REGISTER"],
    [import_constants.ModbusFunctionCode.WRITE_MULTIPLE_COILS, "WRITE_MULTIPLE_COILS"],
    [import_constants.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS, "WRITE_MULTIPLE_REGISTERS"],
    [import_constants.ModbusFunctionCode.REPORT_SLAVE_ID, "REPORT_SLAVE_ID"],
    [import_constants.ModbusFunctionCode.READ_DEVICE_COMMENT, "READ_DEVICE_COMMENT"],
    [import_constants.ModbusFunctionCode.WRITE_DEVICE_COMMENT, "WRITE_DEVICE_COMMENT"],
    [import_constants.ModbusFunctionCode.READ_DEVICE_IDENTIFICATION, "READ_DEVICE_IDENTIFICATION"],
    [import_constants.ModbusFunctionCode.READ_FILE_LENGTH, "READ_FILE_LENGTH"],
    [import_constants.ModbusFunctionCode.READ_FILE_CHUNK, "READ_FILE_CHUNK"],
    [import_constants.ModbusFunctionCode.OPEN_FILE, "OPEN_FILE"],
    [import_constants.ModbusFunctionCode.CLOSE_FILE, "CLOSE_FILE"],
    [import_constants.ModbusFunctionCode.RESTART_CONTROLLER, "RESTART_CONTROLLER"],
    [import_constants.ModbusFunctionCode.GET_CONTROLLER_TIME, "GET_CONTROLLER_TIME"],
    [import_constants.ModbusFunctionCode.SET_CONTROLLER_TIME, "SET_CONTROLLER_TIME"]
  ]);
  constructor(options = {}) {
    this.notificationThreshold = options.notificationThreshold || 10;
    this.errorRateThreshold = options.errorRateThreshold || 10;
    this.slaveIds = Array.isArray(options.slaveId) ? options.slaveId : [options.slaveId || 1];
    this.logger = loggerInstance.createLogger(
      options.loggerName || "Diagnostics"
    );
    this.logger.setLevel("error");
    this.startTime = Date.now();
    this.reset();
  }
  /**
   * Resets all statistics and counters to their initial state.
   */
  reset() {
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
    this.totalDataSent = 0;
    this.totalDataReceived = 0;
    this.lastRequestTimestamp = null;
    this.lastSuccessTimestamp = null;
    this.lastErrorTimestamp = null;
    this.totalSessions += 1;
    this.requestTimestamps = [];
  }
  /**
   * Resets specific statistics.
   * @param metrics - Metrics to reset (e.g., ['errors', 'retries'])
   */
  resetStats(metrics = []) {
    const allMetrics = [
      "requests",
      "successes",
      "errors",
      "timeouts",
      "crcErrors",
      "modbusExceptions",
      "retries",
      "retrySuccesses",
      "responseTimes",
      "errorsList",
      "functionCalls",
      "errorMessages",
      "dataSent",
      "dataReceived",
      "timestamps",
      "exceptionCodes"
    ];
    const toReset = metrics.length > 0 ? metrics : allMetrics;
    if (toReset.includes("requests")) this.totalRequests = 0;
    if (toReset.includes("successes")) this.successfulResponses = 0;
    if (toReset.includes("errors")) this.errorResponses = 0;
    if (toReset.includes("timeouts")) this.timeouts = 0;
    if (toReset.includes("crcErrors")) this.crcErrors = 0;
    if (toReset.includes("modbusExceptions")) this.modbusExceptions = 0;
    if (toReset.includes("exceptionCodes")) this.exceptionCodeCounts = {};
    if (toReset.includes("retries")) this.totalRetries = 0;
    if (toReset.includes("retrySuccesses")) this.totalRetrySuccesses = 0;
    if (toReset.includes("responseTimes")) {
      this.lastResponseTime = null;
      this.minResponseTime = null;
      this.maxResponseTime = null;
      this._totalResponseTime = 0;
      this._totalResponseTimeAll = 0;
    }
    if (toReset.includes("errorsList")) {
      this.lastErrorMessage = null;
      this.lastErrors = [];
    }
    if (toReset.includes("functionCalls")) this.functionCallCounts = {};
    if (toReset.includes("errorMessages")) this.errorMessageCounts = {};
    if (toReset.includes("dataSent")) this.totalDataSent = 0;
    if (toReset.includes("dataReceived")) this.totalDataReceived = 0;
    if (toReset.includes("timestamps")) {
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
    this.logger.setLevel("error");
  }
  /**
   * Outputs a notification if error count or error rate exceeds thresholds.
   * @private
   */
  sendNotification() {
    if (this.errorResponses <= this.notificationThreshold && (this.errorRate == null || this.errorRate <= this.errorRateThreshold))
      return;
    const notification = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      slaveIds: this.slaveIds,
      errorCount: this.errorResponses,
      errorRate: this.errorRate?.toFixed(2) || "N/A",
      lastError: this.lastErrorMessage,
      lastErrors: this.lastErrors
    };
    this.logger.warn("Excessive errors detected", {
      slaveId: this.slaveIds.join(","),
      errorCount: notification.errorCount,
      errorRate: notification.errorRate,
      lastError: notification.lastError,
      logger: "Diagnostics"
    });
  }
  /**
   * Records a request event.
   * @param slaveId - Slave ID for the request
   * @param funcCode - Modbus function code
   */
  recordRequest(slaveId, funcCode) {
    this.totalRequests++;
    this.lastRequestTimestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.requestTimestamps.push(Date.now());
    if (this.requestTimestamps.length > 1e3) this.requestTimestamps.shift();
    this.logger.trace("Request sent", {
      slaveId: slaveId || this.slaveIds[0],
      funcCode,
      logger: "Diagnostics"
    });
  }
  /**
   * Records a retry event.
   * @param attempts - Number of retry attempts
   * @param slaveId - Slave ID
   * @param funcCode - Modbus function code
   */
  recordRetry(attempts, slaveId, funcCode) {
    this.totalRetries += attempts;
    this.logger.debug(`Retry attempt #${attempts}`, {
      slaveId: slaveId || this.slaveIds[0],
      funcCode,
      logger: "Diagnostics"
    });
  }
  /**
   * Records a successful retry event.
   * @param slaveId - Slave ID
   * @param funcCode - Modbus function code
   */
  recordRetrySuccess(slaveId, funcCode) {
    this.totalRetrySuccesses++;
    this.logger.debug("Retry successful", {
      slaveId: slaveId || this.slaveIds[0],
      funcCode,
      logger: "Diagnostics"
    });
  }
  /**
   * Records a function call event.
   * @param funcCode - Modbus function code
   * @param slaveId - Slave ID
   */
  recordFunctionCall(funcCode, slaveId) {
    if (funcCode == null) return;
    this.functionCallCounts[funcCode] ??= 0;
    this.functionCallCounts[funcCode]++;
    const funcName = Diagnostics.FUNCTION_CODE_NAMES.get(funcCode) || "Unknown";
    this.logger.trace("Function called", {
      slaveId: slaveId || this.slaveIds[0],
      funcCode,
      funcName,
      logger: "Diagnostics"
    });
  }
  /**
   * Records a successful response event.
   * @param responseTimeMs - Response time in milliseconds
   * @param slaveId - Slave ID
   * @param funcCode - Modbus function code
   */
  recordSuccess(responseTimeMs, slaveId, funcCode) {
    this.successfulResponses++;
    this.lastResponseTime = responseTimeMs;
    this.minResponseTime = this.minResponseTime == null ? responseTimeMs : Math.min(this.minResponseTime, responseTimeMs);
    this.maxResponseTime = this.maxResponseTime == null ? responseTimeMs : Math.max(this.maxResponseTime, responseTimeMs);
    this._totalResponseTime += responseTimeMs;
    this._totalResponseTimeAll += responseTimeMs;
    this.lastSuccessTimestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.lastSuccessDetails = {
      responseTime: responseTimeMs,
      timestamp: this.lastSuccessTimestamp,
      funcCode: funcCode ?? null,
      slaveId: slaveId ?? this.slaveIds[0]
    };
  }
  /**
   * Records an error event.
   * @param error - Error object
   * @param options - Optional parameters
   */
  recordError(error, { code = null, responseTimeMs = 0, exceptionCode = null, slaveId, funcCode } = {}) {
    this.errorResponses++;
    this.lastErrorMessage = error.message || String(error);
    this._totalResponseTimeAll += responseTimeMs;
    this.lastErrorTimestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.lastErrors.push(this.lastErrorMessage);
    if (this.lastErrors.length > 10) this.lastErrors.shift();
    const msg = (error.message || "").toLowerCase();
    if (code === "timeout" || msg.includes("timeout")) {
      this.timeouts++;
    } else if (code === "crc" || msg.includes("crc")) {
      this.crcErrors++;
    } else if (code === "modbus-exception" || msg.includes("modbus exception")) {
      this.modbusExceptions++;
      if (typeof exceptionCode === "number") {
        this.exceptionCodeCounts[exceptionCode] ??= 0;
        this.exceptionCodeCounts[exceptionCode]++;
      }
    }
    this.errorMessageCounts[this.lastErrorMessage] ??= 0;
    if (this.lastErrorMessage != null) {
      this.errorMessageCounts[this.lastErrorMessage] = (this.errorMessageCounts[this.lastErrorMessage] ?? 0) + 1;
    }
    this.logger.error(this.lastErrorMessage, {
      slaveId: slaveId ?? this.slaveIds[0],
      funcCode,
      exceptionCode,
      responseTime: responseTimeMs,
      logger: "Diagnostics"
    });
    this.sendNotification();
  }
  /**
   * Records the amount of outgoing data in bytes.
   * @param byteLength - Number of bytes sent
   * @param slaveId - Slave ID
   * @param funcCode - Modbus function code
   */
  recordDataSent(byteLength, slaveId, funcCode) {
    this.totalDataSent += byteLength;
    this.logger.trace(`Data sent: ${byteLength} bytes`, {
      slaveId: slaveId ?? this.slaveIds[0],
      funcCode,
      logger: "Diagnostics"
    });
  }
  /**
   * Records the amount of incoming data in bytes.
   * @param byteLength - Number of bytes received
   * @param slaveId - Slave ID
   * @param funcCode - Modbus function code
   */
  recordDataReceived(byteLength, slaveId, funcCode) {
    this.totalDataReceived += byteLength;
    this.logger.trace(`Data received: ${byteLength} bytes`, {
      slaveId: slaveId ?? this.slaveIds[0],
      funcCode,
      logger: "Diagnostics"
    });
  }
  /**
   * Returns the average response time in milliseconds for successful responses.
   */
  get averageResponseTime() {
    return this.successfulResponses === 0 ? null : this._totalResponseTime / this.successfulResponses;
  }
  /**
   * Returns the average response time including errors.
   */
  get averageResponseTimeAll() {
    const total = this.successfulResponses + this.errorResponses;
    return total === 0 ? null : this._totalResponseTimeAll / total;
  }
  /**
   * Calculates the error rate as a percentage of total requests.
   */
  get errorRate() {
    return this.totalRequests === 0 ? null : this.errorResponses / this.totalRequests * 100;
  }
  /**
   * Calculates the requests per second based on recent activity.
   */
  get requestsPerSecond() {
    if (this.requestTimestamps.length < 2) return null;
    const first = this.requestTimestamps[0];
    const last = this.requestTimestamps[this.requestTimestamps.length - 1];
    if (first == null || last == null) return null;
    const timeSpan = (last - first) / 1e3;
    return timeSpan === 0 ? null : this.requestTimestamps.length / timeSpan;
  }
  /**
   * Returns the uptime in seconds.
   */
  get uptimeSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1e3);
  }
  /**
   * Analyzes statistics and returns potential issues.
   * @returns Analysis results with warnings
   */
  analyze() {
    const warnings = [];
    if (this.errorRate != null && this.errorRate > this.errorRateThreshold) {
      warnings.push(
        `High error rate: ${this.errorRate.toFixed(2)}% (threshold: ${this.errorRateThreshold}%)`
      );
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
    if (this.maxResponseTime != null && this.maxResponseTime > 1e3) {
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
   * @returns Object containing all statistics and counters
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
      exceptionCodeCounts: Object.entries(this.exceptionCodeCounts).reduce(
        (acc, [code, count]) => {
          const codeNum = Number(code);
          const excName = import_constants.MODBUS_EXCEPTION_MESSAGES[codeNum] || "Unknown";
          acc[`${code}/${excName}`] = count;
          return acc;
        },
        {}
      ),
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
      functionCallCounts: Object.entries(this.functionCallCounts).reduce(
        (acc, [code, count]) => {
          const key = Number(code);
          const name = Diagnostics.FUNCTION_CODE_NAMES.get(key) || "Unknown";
          acc[`${code}/${name}`] = count;
          return acc;
        },
        {}
      ),
      commonErrors: Object.entries(this.errorMessageCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([message, count]) => ({ message, count })),
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
    this.logger.info("=== Modbus Diagnostics ===", { logger: "Diagnostics" });
    this.logger.info(`Slave IDs: ${stats.slaveIds.join(", ")}`, { logger: "Diagnostics" });
    this.logger.info(`Uptime: ${stats.uptimeSeconds} seconds`, { logger: "Diagnostics" });
    this.logger.info(`Total Sessions: ${stats.totalSessions}`, { logger: "Diagnostics" });
    this.logger.info(`Total Requests: ${stats.totalRequests}`, { logger: "Diagnostics" });
    this.logger.info(`Successful Responses: ${stats.successfulResponses}`, {
      logger: "Diagnostics"
    });
    this.logger.info(
      `Error Responses: ${stats.errorResponses} (Rate: ${stats.errorRate?.toFixed(2) || "N/A"}%)`,
      { logger: "Diagnostics" }
    );
    this.logger.info(`Timeouts: ${stats.timeouts}`, { logger: "Diagnostics" });
    this.logger.info(`CRC Errors: ${stats.crcErrors}`, { logger: "Diagnostics" });
    this.logger.info(`Modbus Exceptions: ${stats.modbusExceptions}`, { logger: "Diagnostics" });
    this.logger.info(`Exception Codes: ${JSON.stringify(stats.exceptionCodeCounts, null, 2)}`, {
      logger: "Diagnostics"
    });
    this.logger.info(`Total Retries: ${stats.totalRetries}`, { logger: "Diagnostics" });
    this.logger.info(`Successful Retries: ${stats.totalRetrySuccesses}`, { logger: "Diagnostics" });
    this.logger.info(`Last Response Time: ${stats.lastResponseTime || "N/A"} ms`, {
      logger: "Diagnostics"
    });
    this.logger.info(`Min Response Time: ${stats.minResponseTime || "N/A"} ms`, {
      logger: "Diagnostics"
    });
    this.logger.info(`Max Response Time: ${stats.maxResponseTime || "N/A"} ms`, {
      logger: "Diagnostics"
    });
    this.logger.info(
      `Average Response Time (Success): ${stats.averageResponseTime?.toFixed(2) || "N/A"} ms`,
      { logger: "Diagnostics" }
    );
    this.logger.info(
      `Average Response Time (All): ${stats.averageResponseTimeAll?.toFixed(2) || "N/A"} ms`,
      { logger: "Diagnostics" }
    );
    this.logger.info(`Requests per Second: ${stats.requestsPerSecond?.toFixed(2) || "N/A"}`, {
      logger: "Diagnostics"
    });
    this.logger.info(`Data Sent: ${stats.dataSent} bytes`, { logger: "Diagnostics" });
    this.logger.info(`Data Received: ${stats.dataReceived} bytes`, { logger: "Diagnostics" });
    this.logger.info(`Last Request: ${stats.lastRequestTimestamp || "N/A"}`, {
      logger: "Diagnostics"
    });
    this.logger.info(`Last Success: ${stats.lastSuccessTimestamp || "N/A"}`, {
      logger: "Diagnostics"
    });
    this.logger.info(`Last Error: ${stats.lastErrorTimestamp || "N/A"}`, { logger: "Diagnostics" });
    this.logger.info("Function Calls:", { logger: "Diagnostics" });
    this.logger.info(JSON.stringify(stats.functionCallCounts, null, 2), { logger: "Diagnostics" });
    this.logger.info("Common Errors:", { logger: "Diagnostics" });
    this.logger.info(JSON.stringify(stats.commonErrors, null, 2), { logger: "Diagnostics" });
    this.logger.info("=========================", { logger: "Diagnostics" });
  }
  /**
   * Returns a JSON string containing all statistics and counters.
   * @returns JSON string containing all statistics and counters
   */
  serialize() {
    return JSON.stringify(this.getStats(), null, 2);
  }
  /**
   * Returns an array of objects containing metric names and their values.
   * @returns Array of objects containing metric names and their values
   */
  toTable() {
    const stats = this.getStats();
    return Object.entries(stats).map(([metric, value]) => ({ metric, value }));
  }
  /**
   * Merges another Diagnostics object into this one.
   * @param other - Diagnostics object to merge with
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
      const key = Number(code);
      this.exceptionCodeCounts[key] ??= 0;
      this.exceptionCodeCounts[key] += count;
    }
    this.totalRetries += other.totalRetries;
    this.totalRetrySuccesses += other.totalRetrySuccesses;
    this._totalResponseTime += other._totalResponseTime;
    this._totalResponseTimeAll += other._totalResponseTimeAll;
    if (other.minResponseTime != null) {
      if (this.minResponseTime == null) {
        this.minResponseTime = other.minResponseTime;
      } else {
        this.minResponseTime = Math.min(this.minResponseTime, other.minResponseTime);
      }
    }
    if (other.maxResponseTime != null) {
      if (this.maxResponseTime == null) {
        this.maxResponseTime = other.maxResponseTime;
      } else {
        this.maxResponseTime = Math.max(this.maxResponseTime, other.maxResponseTime);
      }
    }
    this.totalDataSent += other.totalDataSent;
    this.totalDataReceived += other.totalDataReceived;
    other.lastErrors.forEach((err) => this.lastErrors.push(err));
    if (this.lastErrors.length > 10) this.lastErrors = this.lastErrors.slice(-10);
    for (const [code, count] of Object.entries(other.functionCallCounts)) {
      const key = Number(code);
      this.functionCallCounts[key] ??= 0;
      this.functionCallCounts[key] += count;
    }
    for (const [msg, count] of Object.entries(other.errorMessageCounts)) {
      this.errorMessageCounts[msg] ??= 0;
      this.errorMessageCounts[msg] += count;
    }
    this.totalSessions += other.totalSessions ?? 0;
    this.slaveIds = [.../* @__PURE__ */ new Set([...this.slaveIds, ...other.slaveIds])];
    this.requestTimestamps.push(...other.requestTimestamps);
    if (this.requestTimestamps.length > 1e3)
      this.requestTimestamps = this.requestTimestamps.slice(-1e3);
    this.logger.info("Merged diagnostics", {
      slaveIds: other.slaveIds,
      logger: "Diagnostics"
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Diagnostics
});
