// logger.js
const { FUNCTION_CODES, EXCEPTION_CODES } = require('./constants/constants');

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error'];

let currentLevel = 'info';
let enabled = true;
let useColors = true;
let buffering = true;
let flushInterval = 300;
const MAX_BUFFER_SIZE = 1000;

const COLORS = {
  trace: '\x1b[1;35m', // яркий пурпурный
  debug: '\x1b[1;36m', // яркий циан
  info: '\x1b[1;32m', // яркий зелёный
  warn: '\x1b[1;33m', // яркий жёлтый
  error: '\x1b[1;31m', // яркий красный
  exception: '\x1b[1;41m', // красный фон для исключений
  reset: '\x1b[0m'
};

let groupLevel = 0;
let globalContext = {};
let buffer = [];
let flushTimeout = null;
const categoryLevels = {};
const logCounts = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 };
const logStats = { bySlaveId: {}, byFuncCode: {}, byExceptionCode: {} };
let logFormat = ['timestamp', 'level', 'slaveId', 'funcCode', 'exceptionCode', 'address', 'quantity', 'responseTime'];
let customFormatters = {};
const filters = { slaveId: new Set(), funcCode: new Set(), exceptionCode: new Set() };
let highlightRules = []; // Правила для выделения логов
let watchCallback = null; // Callback для watch
let logRateLimit = 100; // Динамический rate limit

function getIndent() {
  return '  '.repeat(groupLevel);
}

function getTimestamp() {
  return new Date().toISOString().slice(11, 19); // HH:mm:ss
}

/**
 * Formats a log message according to the specified level and context.
 * @param {string} level - Log level (trace, debug, info, warn, error)
 * @param {Array<any>} args - Arguments to be logged
 * @param {Object} [context={}] - Context object with additional information
 * @returns {Array<string>} Formatted log message
 */
function format(level, args, context = {}) {
  const color = useColors ? COLORS[level] : '';
  const reset = useColors ? COLORS.reset : '';
  const indent = getIndent();
  const isHighlighted = highlightRules.some(rule =>
    (!rule.slaveId || rule.slaveId === context.slaveId) &&
    (!rule.funcCode || rule.funcCode === context.funcCode) &&
    (!rule.exceptionCode || rule.exceptionCode === context.exceptionCode)
  );

  const headerParts = [];
  if (logFormat.includes('timestamp')) headerParts.push(`[${getTimestamp()}]`);
  if (logFormat.includes('level')) headerParts.push(`[${level.toUpperCase()}]`);
  if (logFormat.includes('slaveId')) {
    const slaveId = context.slaveId ?? globalContext.slaveId ?? 'N/A';
    const formatter = customFormatters.slaveId || (v => v);
    headerParts.push(`[S:${formatter(slaveId)}]`);
  }
  if (logFormat.includes('funcCode')) {
    const funcCode = context.funcCode != null ? `0x${context.funcCode.toString(16).padStart(2, '0')}` : 'N/A';
    const funcName = context.funcCode != null ? Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === context.funcCode) || 'Unknown' : 'N/A';
    const formatter = customFormatters.funcCode || (v => `${v}/${funcName}`);
    headerParts.push(`[F:${formatter(funcCode)}]`);
  }
  if (logFormat.includes('exceptionCode') && context.exceptionCode != null) {
    const exceptionName = EXCEPTION_CODES[context.exceptionCode] || 'Unknown';
    const formatter = customFormatters.exceptionCode || (v => `${v}/${exceptionName}`);
    headerParts.push(`${useColors && isHighlighted ? COLORS.exception : ''}[E:${formatter(context.exceptionCode)}]${reset}`);
  }
  if (logFormat.includes('address') && context.address != null) {
    const formatter = customFormatters.address || (v => v);
    headerParts.push(`[A:${formatter(context.address)}]`);
  }
  if (logFormat.includes('quantity') && context.quantity != null) {
    const formatter = customFormatters.quantity || (v => v);
    headerParts.push(`[Q:${formatter(context.quantity)}]`);
  }
  if (logFormat.includes('responseTime') && context.responseTime != null) {
    const formatter = customFormatters.responseTime || (v => `${v}ms`);
    headerParts.push(`[RT:${formatter(context.responseTime)}]`);
  }

  const formattedArgs = args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`.trim();
    }
    return arg;
  });

  return [`${color}${headerParts.join('')}${isHighlighted ? COLORS.exception : ''}`, indent, ...formattedArgs, reset];
}

/**
 * Determines whether a log message should be logged based on level, context, and filters.
 * @param {string} level - Log level (trace, debug, info, warn, error)
 * @param {Object} [context={}] - Context object with additional information
 * @returns {boolean} Whether the log message should be logged
 */
function shouldLog(level, context = {}) {
  if (!enabled) return false;
  if (filters.slaveId.size > 0 && context.slaveId != null && filters.slaveId.has(context.slaveId)) return false;
  if (filters.funcCode.size > 0 && context.funcCode != null && filters.funcCode.has(context.funcCode)) return false;
  if (filters.exceptionCode.size > 0 && context.exceptionCode != null && filters.exceptionCode.has(context.exceptionCode)) return false;
  if (context.logger && categoryLevels[context.logger] === 'none') return false;
  if (context.logger && categoryLevels[context.logger]) {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(categoryLevels[context.logger]);
  }
  return LEVELS.indexOf(level) >= LEVELS.indexOf(currentLevel);
}

/**
 * Flushes the log buffer and outputs all log messages to the console.
 */
function flushBuffer() {
  for (const item of buffer) {
    const formatted = format(item.level, item.args, item.context);
    if (useColors) {
      const [head, indent, ...rest] = formatted;
      console[item.level](head + indent, ...rest);
    } else {
      console[item.level](...formatted);
    }
  }
  buffer = [];
  flushTimeout = null;
}

/**
 * Outputs a log message to the console.
 * @param {string} level - Log level (trace, debug, info, warn, error)
 * @param {Array<any>} args - Arguments to be logged
 * @param {Object} [context={}] - Context object with additional information
 * @param {boolean} [immediate=false] - Whether to output immediately
 */
let lastLogTime = 0;

async function output(level, args, context, immediate = false) {
  if (!shouldLog(level, context)) return;

  logCounts[level] = (logCounts[level] || 0) + 1;
  if (context.slaveId != null) logStats.bySlaveId[context.slaveId] = (logStats.bySlaveId[context.slaveId] || 0) + 1;
  if (context.funcCode != null) logStats.byFuncCode[context.funcCode] = (logStats.byFuncCode[context.funcCode] || 0) + 1;
  if (context.exceptionCode != null) logStats.byExceptionCode[context.exceptionCode] = (logStats.byExceptionCode[context.exceptionCode] || 0) + 1;

  if (watchCallback) {
    watchCallback({ level, args, context });
  }

  const now = Date.now();
  if (!immediate && now - lastLogTime < logRateLimit && level !== 'error' && level !== 'warn') return;
  lastLogTime = now;

  if (buffer.length >= MAX_BUFFER_SIZE) {
    console.warn('[TRACE] Log buffer overflow, dumping contents:');
    buffer.forEach((item, index) => {
      const formatted = format(item.level, item.args, item.context);
      console[item.level](`[${index}]`, ...formatted);
    });
    buffer = [];
  }

  if (immediate || !buffering || level === 'error' || level === 'warn') {
    const formatted = format(level, args, context);
    if (useColors) {
      const [head, indent, ...rest] = formatted;
      console[level](head + indent, ...rest);
    } else {
      console[level](...formatted);
    }
    return;
  }

  buffer.push({ level, args, context });
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushBuffer, flushInterval);
  }
}

/**
 * Splits the arguments into the main arguments and the context object.
 * @param {Array<any>} args - Arguments to be logged
 * @returns {{ args: Array<any>, context: Object }}
 */
function splitArgsAndContext(args) {
  if (args.length > 1 && typeof args[args.length - 1] === 'object' && !Array.isArray(args[args.length - 1])) {
    const context = args.pop();
    return { args, context };
  }
  return { args, context: {} };
}

/**
 * Logger is a logging utility that supports different log levels and categories.
 * @example
 * logger.trace('Detailed debug', { slaveId: 1, funcCode: 0x03, exceptionCode: 1 });
 * logger.setLogFormat(['timestamp', 'level', 'slaveId']);
 * logger.setCustomFormatter('slaveId', id => `Device${id}`);
 * logger.highlight({ exceptionCode: 1 });
 * logger.watch(log => console.log('Watched:', log));
 */
const logger = {
  trace: async (...args) => {
    const { args: newArgs, context } = splitArgsAndContext([...args]);
    await output('trace', newArgs, context);
  },
  debug: async (...args) => {
    const { args: newArgs, context } = splitArgsAndContext([...args]);
    await output('debug', newArgs, context);
  },
  info: async (...args) => {
    const { args: newArgs, context } = splitArgsAndContext([...args]);
    await output('info', newArgs, context);
  },
  warn: async (...args) => {
    const { args: newArgs, context } = splitArgsAndContext([...args]);
    await output('warn', newArgs, context, true);
  },
  error: async (...args) => {
    const { args: newArgs, context } = splitArgsAndContext([...args]);
    await output('error', newArgs, context, true);
  },

  group() {
    groupLevel++;
  },

  groupCollapsed() {
    groupLevel++;
  },

  groupEnd() {
    if (groupLevel > 0) groupLevel--;
  },

  setLevel(level) {
    if (LEVELS.includes(level)) {
      currentLevel = level;
    } else {
      throw new Error(`Unknown log level: ${level}`);
    }
  },

  setLevelFor(category, level) {
    if (level !== 'none' && !LEVELS.includes(level)) throw new Error(`Unknown log level: ${level}`);
    categoryLevels[category] = level;
  },

  pauseCategory(category) {
    categoryLevels[category] = 'none';
  },

  resumeCategory(category) {
    delete categoryLevels[category];
  },

  enable() {
    enabled = true;
  },

  disable() {
    enabled = false;
  },

  getLevel() {
    return currentLevel;
  },

  isEnabled() {
    return enabled;
  },

  disableColors() {
    useColors = false;
  },

  setGlobalContext(ctx) {
    globalContext = { ...ctx };
  },

  addGlobalContext(ctx) {
    globalContext = { ...globalContext, ...ctx };
  },

  setTransportType(type) {
    globalContext.transport = type;
  },

  setBuffering(value) {
    buffering = !!value;
  },

  setFlushInterval(ms) {
    if (typeof ms !== 'number' || ms < 0) throw new Error('Flush interval must be a non-negative number');
    flushInterval = ms;
  },

  setRateLimit(ms) {
    if (typeof ms !== 'number' || ms < 0) throw new Error('Rate limit must be a non-negative number');
    logRateLimit = ms;
  },

  setLogFormat(fields) {
    const validFields = ['timestamp', 'level', 'slaveId', 'funcCode', 'exceptionCode', 'address', 'quantity', 'responseTime'];
    if (!Array.isArray(fields) || !fields.every(f => validFields.includes(f))) {
      throw new Error(`Invalid log format. Valid fields: ${validFields.join(', ')}`);
    }
    logFormat = fields;
  },

  setCustomFormatter(field, formatter) {
    if (!['slaveId', 'funcCode', 'exceptionCode', 'address', 'quantity', 'responseTime'].includes(field)) {
      throw new Error(`Invalid formatter field: ${field}`);
    }
    if (typeof formatter !== 'function') {
      throw new Error('Formatter must be a function');
    }
    customFormatters[field] = formatter;
  },

  mute({ slaveId, funcCode, exceptionCode } = {}) {
    if (slaveId != null) filters.slaveId.add(slaveId);
    if (funcCode != null) filters.funcCode.add(funcCode);
    if (exceptionCode != null) filters.exceptionCode.add(exceptionCode);
  },

  unmute({ slaveId, funcCode, exceptionCode } = {}) {
    if (slaveId != null) filters.slaveId.delete(slaveId);
    if (funcCode != null) filters.funcCode.delete(funcCode);
    if (exceptionCode != null) filters.exceptionCode.delete(exceptionCode);
  },

  highlight({ slaveId, funcCode, exceptionCode } = {}) {
    highlightRules.push({ slaveId, funcCode, exceptionCode });
  },

  clearHighlights() {
    highlightRules = [];
  },

  watch(callback) {
    if (typeof callback !== 'function') throw new Error('Watch callback must be a function');
    watchCallback = callback;
  },

  clearWatch() {
    watchCallback = null;
  },

  flush() {
    flushBuffer();
  },

  inspectBuffer() {
    console.log('\x1b[1;36m=== Log Buffer Contents ===\x1b[0m');
    if (buffer.length === 0) {
      console.log('Buffer is empty');
    } else {
      buffer.forEach((item, index) => {
        const formatted = format(item.level, item.args, item.context);
        console.log(`[${index}] ${formatted.join(' ')}`);
      });
    }
    console.log(`Buffer Size: ${buffer.length}/${MAX_BUFFER_SIZE}`);
    console.log('\x1b[1;36m==========================\x1b[0m');
  },

  summary() {
    console.log('\x1b[1;36m=== Logger Summary ===\x1b[0m');
    console.log(`Trace Messages: ${logCounts.trace || 0}`);
    console.log(`Debug Messages: ${logCounts.debug || 0}`);
    console.log(`Info Messages: ${logCounts.info || 0}`);
    console.log(`Warn Messages: ${logCounts.warn || 0}`);
    console.log(`Error Messages: ${logCounts.error || 0}`);
    console.log(`Total Messages: ${Object.values(logCounts).reduce((sum, count) => sum + count, 0)}`);
    console.log(`By Slave ID: ${JSON.stringify(logStats.bySlaveId, null, 2)}`);
    console.log(`By Function Code: ${JSON.stringify(
      Object.entries(logStats.byFuncCode).reduce((acc, [code, count]) => {
        const name = Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === parseInt(code)) || 'Unknown';
        acc[`${code}/${name}`] = count;
        return acc;
      }, {}),
      null,
      2
    )}`);
    console.log(`By Exception Code: ${JSON.stringify(
      Object.entries(logStats.byExceptionCode).reduce((acc, [code, count]) => {
        acc[`${code}/${EXCEPTION_CODES[code] || 'Unknown'}`] = count;
        return acc;
      }, {}),
      null,
      2
    )}`);
    console.log(`Buffering: ${buffering ? 'Enabled' : 'Disabled'} (Interval: ${flushInterval}ms)`);
    console.log(`Rate Limit: ${logRateLimit}ms`);
    console.log(`Buffer Size: ${buffer.length}/${MAX_BUFFER_SIZE}`);
    console.log(`Current Level: ${currentLevel}`);
    console.log(`Categories: ${Object.keys(categoryLevels).length ? JSON.stringify(categoryLevels, null, 2) : 'None'}`);
    console.log(`Filters: slaveId=${JSON.stringify([...filters.slaveId])}, funcCode=${JSON.stringify([...filters.funcCode])}, exceptionCode=${JSON.stringify([...filters.exceptionCode])}`);
    console.log(`Highlights: ${highlightRules.length ? JSON.stringify(highlightRules, null, 2) : 'None'}`);
    console.log('\x1b[1;36m=====================\x1b[0m');
  },

  createLogger(name) {
    if (!name) throw new Error('Logger name required');
    return {
      trace: (...args) => {
        const { args: newArgs, context } = splitArgsAndContext([...args]);
        output('trace', newArgs, { ...context, logger: name });
      },
      debug: (...args) => {
        const { args: newArgs, context } = splitArgsAndContext([...args]);
        output('debug', newArgs, { ...context, logger: name });
      },
      info: (...args) => {
        const { args: newArgs, context } = splitArgsAndContext([...args]);
        output('info', newArgs, { ...context, logger: name });
      },
      warn: (...args) => {
        const { args: newArgs, context } = splitArgsAndContext([...args]);
        output('warn', newArgs, { ...context, logger: name }, true);
      },
      error: (...args) => {
        const { args: newArgs, context } = splitArgsAndContext([...args]);
        output('error', newArgs, { ...context, logger: name }, true);
      },
      group: () => logger.group(),
      groupCollapsed: () => logger.groupCollapsed(),
      groupEnd: () => logger.groupEnd(),
      setLevel: (lvl) => logger.setLevelFor(name, lvl),
      pause: () => logger.pauseCategory(name),
      resume: () => logger.resumeCategory(name)
    };
  }
};

module.exports = logger;