"use strict";
var import_constants = require("./constants/constants.js");
class Logger {
  LEVELS = ["trace", "debug", "info", "warn", "error"];
  currentLevel = "info";
  enabled = true;
  useColors = true;
  buffering = false;
  flushInterval = 300;
  MAX_BUFFER_SIZE = 1e3;
  COLORS = {
    trace: "\x1B[1;35m",
    debug: "\x1B[1;36m",
    info: "\x1B[1;32m",
    warn: "\x1B[1;33m",
    error: "\x1B[1;31m",
    exception: "\x1B[1;41m",
    reset: "\x1B[0m"
  };
  groupLevel = 0;
  globalContext = {};
  buffer = [];
  // private flushTimeout: NodeJS.Timeout | null = null;
  categoryLevels = {};
  logCounts = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 };
  logStats = { bySlaveId: {}, byFuncCode: {}, byExceptionCode: {} };
  logFormat = [
    "timestamp",
    "level",
    "logger",
    "slaveId",
    "funcCode",
    "exceptionCode",
    "address",
    "quantity",
    "responseTime"
  ];
  customFormatters = {};
  filters = { slaveId: /* @__PURE__ */ new Set(), funcCode: /* @__PURE__ */ new Set(), exceptionCode: /* @__PURE__ */ new Set() };
  highlightRules = [];
  watchCallback = null;
  logRateLimit = 100;
  lastLogTime = 0;
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
  getIndent() {
    return "  ".repeat(this.groupLevel);
  }
  getTimestamp() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(11, 19);
  }
  /**
   * Formats a log message according to the specified level and context.
   * @param level - Log level (trace, debug, info, warn, error)
   * @param args - Arguments to be logged
   * @param context - Context object with additional information
   * @returns Formatted log message
   */
  format(level, args, context = {}) {
    const color = this.useColors ? this.COLORS[level] : "";
    const reset = this.useColors ? this.COLORS.reset : "";
    const indent = this.getIndent();
    const isHighlighted = this.highlightRules.some(
      (rule) => (!rule.slaveId || rule.slaveId === context.slaveId) && (!rule.funcCode || rule.funcCode === context.funcCode) && (!rule.exceptionCode || rule.exceptionCode === context.exceptionCode)
    );
    const headerParts = [];
    if (this.logFormat.includes("timestamp")) headerParts.push(`[${this.getTimestamp()}]`);
    if (this.logFormat.includes("level")) headerParts.push(`[${level.toUpperCase()}]`);
    if (this.logFormat.includes("logger") && context["logger"]) {
      const formatter = this.customFormatters["logger"] || ((v) => `[${v}]`);
      headerParts.push(formatter(context["logger"]));
    }
    if (this.logFormat.includes("slaveId")) {
      const slaveId = context["slaveId"] ?? this.globalContext["slaveId"] ?? "N/A";
      const formatter = this.customFormatters["slaveId"] || ((v) => `[S:${v}]`);
      headerParts.push(formatter(String(slaveId)));
    }
    if (this.logFormat.includes("funcCode")) {
      const funcCode = context["funcCode"] != null ? `0x${context["funcCode"].toString(16).padStart(2, "0")}` : "N/A";
      const funcName = context["funcCode"] != null ? Logger.FUNCTION_CODE_NAMES.get(context["funcCode"]) || "Unknown" : "N/A";
      const formatter = this.customFormatters["funcCode"] || ((v) => `[F:${v}/${funcName}]`);
      headerParts.push(formatter(`${funcCode}`));
    }
    if (this.logFormat.includes("exceptionCode") && context["exceptionCode"] != null) {
      const exceptionName = import_constants.MODBUS_EXCEPTION_MESSAGES[context["exceptionCode"]] || "Unknown";
      const formatter = this.customFormatters["exceptionCode"] || ((v) => `[E:${v}/${exceptionName}]`);
      headerParts.push(
        `${this.useColors && isHighlighted ? this.COLORS.exception : ""}${formatter(context["exceptionCode"])}${reset}`
      );
    }
    if (this.logFormat.includes("address") && context["address"] != null) {
      const formatter = this.customFormatters["address"] || ((v) => `[A:${v}]`);
      headerParts.push(formatter(String(context["address"])));
    }
    if (this.logFormat.includes("quantity") && context["quantity"] != null) {
      const formatter = this.customFormatters["quantity"] || ((v) => `[Q:${v}]`);
      headerParts.push(formatter(String(context["quantity"])));
    }
    if (this.logFormat.includes("responseTime") && context["responseTime"] != null) {
      const formatter = this.customFormatters["responseTime"] || ((v) => `[RT:${v}ms]`);
      headerParts.push(formatter(String(context["responseTime"])));
    }
    const formattedArgs = args.map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}
${arg.stack || ""}`.trim();
      }
      return String(arg);
    });
    const contextToPrint = { ...context };
    delete contextToPrint["logger"];
    if (Object.keys(contextToPrint).length > 0) {
      formattedArgs.push(JSON.stringify(contextToPrint));
    }
    return [
      `${color}${headerParts.join("")}${isHighlighted ? this.COLORS.exception : ""}`,
      indent,
      ...formattedArgs,
      reset
    ];
  }
  /**
   * Determines whether a log message should be logged based on level, context, and filters.
   * @param level - Log level (trace, debug, info, warn, error)
   * @param context - Context object with additional information
   * @returns Whether the log message should be logged
   */
  shouldLog(level, context = {}) {
    if (!this.enabled) return false;
    if (this.filters.slaveId.size > 0 && context["slaveId"] != null && this.filters.slaveId.has(context["slaveId"]))
      return false;
    if (this.filters.funcCode.size > 0 && context["funcCode"] != null && this.filters.funcCode.has(context["funcCode"]))
      return false;
    if (this.filters.exceptionCode.size > 0 && context["exceptionCode"] != null && this.filters.exceptionCode.has(context["exceptionCode"]))
      return false;
    if (context["logger"] && this.categoryLevels[context["logger"]] === "none") return false;
    if (context["logger"] && this.categoryLevels[context["logger"]] !== "none") {
      const categoryLevel = this.categoryLevels[context["logger"]];
      return this.LEVELS.indexOf(level) >= this.LEVELS.indexOf(categoryLevel);
    }
    return this.LEVELS.indexOf(level) >= this.LEVELS.indexOf(this.currentLevel);
  }
  /**
   * Outputs a log message to the console immediately (asynchronous).
   * @param level - Log level (trace, debug, info, warn, error)
   * @param args - Arguments to be logged
   * @param context - Context object with additional information
   * @param immediate - Whether to output immediately
   */
  async output(level, args, context, immediate = false) {
    if (!this.shouldLog(level, context)) return;
    this.logCounts[level] = (this.logCounts[level] || 0) + 1;
    if (context["slaveId"] != null)
      this.logStats.bySlaveId[context["slaveId"]] = (this.logStats.bySlaveId[context["slaveId"]] || 0) + 1;
    if (context["funcCode"] != null)
      this.logStats.byFuncCode[context["funcCode"]] = (this.logStats.byFuncCode[context["funcCode"]] || 0) + 1;
    if (context["exceptionCode"] != null)
      this.logStats.byExceptionCode[context["exceptionCode"]] = (this.logStats.byExceptionCode[context["exceptionCode"]] || 0) + 1;
    if (this.watchCallback) {
      this.watchCallback({ level, args, context });
    }
    const now = Date.now();
    if (!immediate && now - this.lastLogTime < this.logRateLimit && level !== "error" && level !== "warn")
      return;
    this.lastLogTime = now;
    const formatted = this.format(level, args, context);
    if (this.useColors) {
      const head = formatted[0] || "";
      const indent = formatted[1] || "";
      const rest = formatted.slice(2);
      console[level](head + indent, ...rest);
    } else {
      console[level](...formatted);
    }
  }
  /**
   * Splits the arguments into the main arguments and the context object.
   * @param args - Arguments to be logged
   * @returns { args, context }
   */
  splitArgsAndContext(args) {
    if (args.length > 1) {
      const lastArg = args[args.length - 1];
      if (typeof lastArg === "object" && lastArg !== null) {
        const context = args.pop();
        return { args, context };
      }
    }
    return { args, context: {} };
  }
  async trace(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output("trace", newArgs, context);
  }
  async debug(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output("debug", newArgs, context);
  }
  async info(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output("info", newArgs, context);
  }
  async warn(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output("warn", newArgs, context, true);
  }
  async error(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output("error", newArgs, context, true);
  }
  group() {
    this.groupLevel++;
  }
  groupCollapsed() {
    this.groupLevel++;
  }
  groupEnd() {
    if (this.groupLevel > 0) this.groupLevel--;
  }
  setLevel(level) {
    if (this.LEVELS.includes(level)) {
      this.currentLevel = level;
    } else {
      throw new Error(`Unknown log level: ${level}`);
    }
  }
  setLevelFor(category, level) {
    if (level !== "none" && !this.LEVELS.includes(level))
      throw new Error(`Unknown log level: ${level}`);
    this.categoryLevels[category] = level;
  }
  pauseCategory(category) {
    this.categoryLevels[category] = "none";
  }
  resumeCategory(category) {
    delete this.categoryLevels[category];
  }
  enable() {
    this.enabled = true;
  }
  disable() {
    this.enabled = false;
  }
  getLevel() {
    return this.currentLevel;
  }
  isEnabled() {
    return this.enabled;
  }
  disableColors() {
    this.useColors = false;
  }
  setGlobalContext(ctx) {
    this.globalContext = { ...ctx };
  }
  addGlobalContext(ctx) {
    this.globalContext = { ...this.globalContext, ...ctx };
  }
  setTransportType(type) {
    this.globalContext["transport"] = type;
  }
  setBuffering(value) {
    this.buffering = !!value;
  }
  setFlushInterval(ms) {
    if (typeof ms !== "number" || ms < 0)
      throw new Error("Flush interval must be a non-negative number");
    this.flushInterval = ms;
  }
  setRateLimit(ms) {
    if (typeof ms !== "number" || ms < 0)
      throw new Error("Rate limit must be a non-negative number");
    this.logRateLimit = ms;
  }
  setLogFormat(fields) {
    const validFields = [
      "timestamp",
      "level",
      "logger",
      "slaveId",
      "funcCode",
      "exceptionCode",
      "address",
      "quantity",
      "responseTime"
    ];
    if (!Array.isArray(fields) || !fields.every((f) => validFields.includes(f))) {
      throw new Error(`Invalid log format. Valid fields: ${validFields.join(", ")}`);
    }
    this.logFormat = fields;
  }
  setCustomFormatter(field, formatter) {
    const fieldStr = field;
    if (![
      "logger",
      "slaveId",
      "funcCode",
      "exceptionCode",
      "address",
      "quantity",
      "responseTime"
    ].includes(fieldStr)) {
      throw new Error(`Invalid formatter field: ${fieldStr}`);
    }
    if (typeof formatter !== "function") {
      throw new Error("Formatter must be a function");
    }
    this.customFormatters[field] = formatter;
  }
  mute({ slaveId, funcCode, exceptionCode } = {}) {
    if (slaveId != null) this.filters.slaveId.add(slaveId);
    if (funcCode != null) this.filters.funcCode.add(funcCode);
    if (exceptionCode != null) this.filters.exceptionCode.add(exceptionCode);
  }
  unmute({ slaveId, funcCode, exceptionCode } = {}) {
    if (slaveId != null) this.filters.slaveId.delete(slaveId);
    if (funcCode != null) this.filters.funcCode.delete(funcCode);
    if (exceptionCode != null) this.filters.exceptionCode.delete(exceptionCode);
  }
  highlight({ slaveId, funcCode, exceptionCode } = {}) {
    this.highlightRules.push({ slaveId, funcCode, exceptionCode });
  }
  clearHighlights() {
    this.highlightRules = [];
  }
  watch(callback) {
    if (typeof callback !== "function") throw new Error("Watch callback must be a function");
    this.watchCallback = callback;
  }
  clearWatch() {
    this.watchCallback = null;
  }
  flush() {
  }
  inspectBuffer() {
    console.log("\x1B[1;36m=== Log Buffer Contents ===\x1B[0m");
    if (this.buffer.length === 0) {
      console.log("Buffer is empty");
    } else {
      this.buffer.forEach((item, index) => {
        if (typeof item === "object" && item !== null && "level" in item && "args" in item && "context" in item) {
          const typedItem = item;
          if (typeof typedItem.level === "string" && Array.isArray(typedItem.args) && typeof typedItem.context === "object" && typedItem.context !== null) {
            const formatted = this.format(
              typedItem.level,
              typedItem.args,
              typedItem.context
            );
            console.log(`[${index}] ${formatted.join(" ")}`);
          } else {
            console.log(`[${index}] ${String(item)}`);
          }
        } else {
          console.log(`[${index}] ${String(item)}`);
        }
      });
    }
    console.log(`Buffer Size: ${this.buffer.length}/${this.MAX_BUFFER_SIZE}`);
    console.log("\x1B[1;36m==========================\x1B[0m");
  }
  summary() {
    console.log("\x1B[1;36m=== Logger Summary ===\x1B[0m");
    console.log(`Trace Messages: ${this.logCounts.trace || 0}`);
    console.log(`Debug Messages: ${this.logCounts.debug || 0}`);
    console.log(`Info Messages: ${this.logCounts.info || 0}`);
    console.log(`Warn Messages: ${this.logCounts.warn || 0}`);
    console.log(`Error Messages: ${this.logCounts.error || 0}`);
    console.log(
      `Total Messages: ${Object.values(this.logCounts).reduce((sum, count) => sum + count, 0)}`
    );
    console.log(`By Slave ID: ${JSON.stringify(this.logStats.bySlaveId, null, 2)}`);
    console.log(
      `By Function Code: ${JSON.stringify(
        Object.entries(this.logStats.byFuncCode).reduce(
          (acc, [code, count]) => {
            const name = Logger.FUNCTION_CODE_NAMES.get(parseInt(code)) || "Unknown";
            acc[`${code}/${name}`] = count;
            return acc;
          },
          {}
        ),
        null,
        2
      )}`
    );
    console.log(
      `By Exception Code: ${JSON.stringify(
        Object.entries(this.logStats.byExceptionCode).reduce(
          (acc, [code, count]) => {
            acc[`${code}/${import_constants.MODBUS_EXCEPTION_MESSAGES[parseInt(code)] || "Unknown"}`] = count;
            return acc;
          },
          {}
        ),
        null,
        2
      )}`
    );
    console.log(
      `Buffering: ${this.buffering ? "Enabled" : "Disabled"} (Interval: ${this.flushInterval}ms)`
    );
    console.log(`Rate Limit: ${this.logRateLimit}ms`);
    console.log(`Buffer Size: ${this.buffer.length}/${this.MAX_BUFFER_SIZE}`);
    console.log(`Current Level: ${this.currentLevel}`);
    console.log(
      `Categories: ${Object.keys(this.categoryLevels).length ? JSON.stringify(this.categoryLevels, null, 2) : "None"}`
    );
    console.log(
      `Filters: slaveId=${JSON.stringify([...this.filters.slaveId])}, funcCode=${JSON.stringify([...this.filters.funcCode])}, exceptionCode=${JSON.stringify([...this.filters.exceptionCode])}`
    );
    console.log(
      `Highlights: ${this.highlightRules.length ? JSON.stringify(this.highlightRules, null, 2) : "None"}`
    );
    console.log("\x1B[1;36m=====================\x1B[0m");
  }
  /**
   * Creates a logger instance with category.
   * @param name - Logger name
   * @returns Logger instance
   */
  createLogger(name) {
    if (!name) throw new Error("Logger name required");
    return {
      trace: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output("trace", newArgs, { ...context, logger: name });
      },
      debug: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output("debug", newArgs, { ...context, logger: name });
      },
      info: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output("info", newArgs, { ...context, logger: name });
      },
      warn: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output("warn", newArgs, { ...context, logger: name }, true);
      },
      error: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output("error", newArgs, { ...context, logger: name }, true);
      },
      group: () => this.group(),
      groupCollapsed: () => this.groupCollapsed(),
      groupEnd: () => this.groupEnd(),
      setLevel: (lvl) => this.setLevelFor(name, lvl),
      pause: () => this.pauseCategory(name),
      resume: () => this.resumeCategory(name)
    };
  }
}
module.exports = Logger;
