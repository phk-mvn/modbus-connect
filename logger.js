// logger.js

// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
// ⣿⠘⢿⣿⣿⣿⣿⣿⣿⣏⢿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣹⣿⣿⣿⣿⣿⣿⡿⠃⣿
// ⣿⡆⠄⠻⣿⣿⣿⣿⣿⣿⠄⠹⣿⣿⣿⣿⣿⣿⠏⠄⣿⣿⣿⣿⣿⣿⠟⠄⢰⣿
// ⣿⡇⠄⠄⠈⠻⠿⢿⣿⣿⡆⠄⠈⠿⠿⠿⠿⠁⠄⢰⣿⣿⡿⠿⠟⠁⠄⠄⢸⣿
// ⣿⣿⠄⠄⠄⠄⠄⠄⠄⠉⣧⠄⠄⠄⠄⠄⠄⠄⠄⣼⠉⠄⠄⠄⠄⠄⠄⠄⣿⣿
// ⣿⣿⡀⠄⠄⠹⠶⢶⣤⣄⣹⡄⠄⠄⢻⡟⠄⠄⢠⣏⣠⣤⡶⠶⠏⠄⠄⢀⣿⣿
// ⣿⣿⡇⠄⠄⠄⣀⠄⠄⠉⠹⡇⠄⠄⠘⠃⠄⠄⢸⠏⠉⠄⠄⣀⠄⠄⠄⢸⣿⣿
// ⣿⣿⣿⠄⠄⠄⠉⠛⠛⠶⣦⣿⡄⠄⠄⠄⠄⢠⣿⣴⠶⠛⠛⠉⠄⠄⠄⣿⣿⣿
// ⣿⣿⣿⣧⡀⠄⠄⢀⣀⠄⠄⠄⠙⢦⡀⢀⡴⠋⠄⠄⠄⣀⡀⠄⠄⢀⣼⣿⣿⣿
// ⣿⣿⣿⡏⢳⡀⠄⠄⠻⣿⣷⡄⠄⠄⠻⠟⠄⠄⢠⣾⣿⠟⠄⠄⢀⡞⢹⣿⣿⣿
// ⣿⣿⣿⣇⠄⠻⣄⠄⠄⠄⠉⠛⠄⠄⠄⠄⠄⠠⠛⠉⠄⠄⠄⣠⠟⠄⣸⣿⣿⣿
// ⣿⣿⣿⣿⠄⠄⠹⣆⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⣰⠏⠄⠄⣿⣿⣿⣿
// ⣿⣿⣿⣿⡇⠄⠄⠘⣧⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⣼⠃⠄⠄⢸⣿⣿⣿⣿
// ⣿⣿⣿⣿⣇⠄⠄⠄⠈⢷⡀⠄⠄⠄⠄⠄⠄⠄⠄⢀⡾⠁⠄⠄⠄⣸⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⠄⠄⠄⠄⠄⢳⡄⠄⠄⠄⠄⠄⠄⢠⡞⠄⠄⠄⠄⠄⣿⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⣷⣦⣄⡀⠄⠄⠹⣆⠄⠄⠄⠄⣰⠏⠄⠄⢀⣠⣴⣾⣿⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣦⣄⡙⣦⠄⠄⣴⢋⣠⣴⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿
// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿

const { FUNCTION_CODES, EXCEPTION_CODES } = require('./constants/constants');

class Logger {
  constructor() {
    this.LEVELS = ['trace', 'debug', 'info', 'warn', 'error'];

    this.currentLevel = 'info';
    this.enabled = true;
    this.useColors = true;
    this.buffering = false;
    this.flushInterval = 300;
    this.MAX_BUFFER_SIZE = 1000;

    this.COLORS = {
      trace: '\x1b[1;35m',
      debug: '\x1b[1;36m',
      info: '\x1b[1;32m',
      warn: '\x1b[1;33m',
      error: '\x1b[1;31m',
      exception: '\x1b[1;41m',
      reset: '\x1b[0m'
    };

    this.groupLevel = 0;
    this.globalContext = {};
    this.buffer = [];
    this.flushTimeout = null;
    this.categoryLevels = {};
    this.logCounts = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 };
    this.logStats = { bySlaveId: {}, byFuncCode: {}, byExceptionCode: {} };
    this.logFormat = ['timestamp', 'level', 'logger', 'slaveId', 'funcCode', 'exceptionCode', 'address', 'quantity', 'responseTime'];
    this.customFormatters = {};
    this.filters = { slaveId: new Set(), funcCode: new Set(), exceptionCode: new Set() };
    this.highlightRules = [];
    this.watchCallback = null;
    this.logRateLimit = 100;
    this.lastLogTime = 0;
  }

  getIndent() {
    return '  '.repeat(this.groupLevel);
  }

  getTimestamp() {
    return new Date().toISOString().slice(11, 19);
  }

  /**
   * Formats a log message according to the specified level and context.
   * @param {string} level - Log level (trace, debug, info, warn, error)
   * @param {Array<any>} args - Arguments to be logged
   * @param {Object} [context={}] - Context object with additional information
   * @returns {Array<string>} Formatted log message
   */
  format(level, args, context = {}) {
    const color = this.useColors ? this.COLORS[level] : '';
    const reset = this.useColors ? this.COLORS.reset : '';
    const indent = this.getIndent();
    const isHighlighted = this.highlightRules.some(rule =>
      (!rule.slaveId || rule.slaveId === context.slaveId) &&
      (!rule.funcCode || rule.funcCode === context.funcCode) &&
      (!rule.exceptionCode || rule.exceptionCode === context.exceptionCode)
    );

    const headerParts = [];
    if (this.logFormat.includes('timestamp')) headerParts.push(`[${this.getTimestamp()}]`);
    if (this.logFormat.includes('level')) headerParts.push(`[${level.toUpperCase()}]`);
    
    // Добавляем имя логгера как отдельное поле без префикса
    if (this.logFormat.includes('logger') && context.logger) {
      const formatter = this.customFormatters.logger || (v => `[${v}]`);
      headerParts.push(formatter(context.logger));
    }
    
    if (this.logFormat.includes('slaveId')) {
      const slaveId = context.slaveId ?? this.globalContext.slaveId ?? 'N/A';
      const formatter = this.customFormatters.slaveId || (v => `[S:${v}]`);
      headerParts.push(formatter(slaveId));
    }
    if (this.logFormat.includes('funcCode')) {
      const funcCode = context.funcCode != null ? `0x${context.funcCode.toString(16).padStart(2, '0')}` : 'N/A';
      const funcName = context.funcCode != null ? Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === context.funcCode) || 'Unknown' : 'N/A';
      const formatter = this.customFormatters.funcCode || (v => `[F:${v}/${funcName}]`);
      headerParts.push(formatter(`${funcCode}`));
    }
    if (this.logFormat.includes('exceptionCode') && context.exceptionCode != null) {
      const exceptionName = EXCEPTION_CODES[context.exceptionCode] || 'Unknown';
      const formatter = this.customFormatters.exceptionCode || (v => `[E:${v}/${exceptionName}]`);
      headerParts.push(`${this.useColors && isHighlighted ? this.COLORS.exception : ''}${formatter(context.exceptionCode)}${reset}`);
    }
    if (this.logFormat.includes('address') && context.address != null) {
      const formatter = this.customFormatters.address || (v => `[A:${v}]`);
      headerParts.push(formatter(context.address));
    }
    if (this.logFormat.includes('quantity') && context.quantity != null) {
      const formatter = this.customFormatters.quantity || (v => `[Q:${v}]`);
      headerParts.push(formatter(context.quantity));
    }
    if (this.logFormat.includes('responseTime') && context.responseTime != null) {
      const formatter = this.customFormatters.responseTime || (v => `[RT:${v}ms]`);
      headerParts.push(formatter(context.responseTime));
    }

    const formattedArgs = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`.trim();
      }
      return arg;
    });

    // Добавим context к аргументам, если он не пустой и не включает служебные поля
    const contextToPrint = { ...context };
    delete contextToPrint.logger; // Удаляем logger из JSON, чтобы не дублировать
    if (Object.keys(contextToPrint).length > 0) {
      formattedArgs.push(JSON.stringify(contextToPrint));
    }

    return [`${color}${headerParts.join('')}${isHighlighted ? this.COLORS.exception : ''}`, indent, ...formattedArgs, reset];
  }

  /**
   * Determines whether a log message should be logged based on level, context, and filters.
   * @param {string} level - Log level (trace, debug, info, warn, error)
   * @param {Object} [context={}] - Context object with additional information
   * @returns {boolean} Whether the log message should be logged
   */
  shouldLog(level, context = {}) {
    if (!this.enabled) return false;
    if (this.filters.slaveId.size > 0 && context.slaveId != null && this.filters.slaveId.has(context.slaveId)) return false;
    if (this.filters.funcCode.size > 0 && context.funcCode != null && this.filters.funcCode.has(context.funcCode)) return false;
    if (this.filters.exceptionCode.size > 0 && context.exceptionCode != null && this.filters.exceptionCode.has(context.exceptionCode)) return false;
    if (context.logger && this.categoryLevels[context.logger] === 'none') return false;
    if (context.logger && this.categoryLevels[context.logger]) {
      return this.LEVELS.indexOf(level) >= this.LEVELS.indexOf(this.categoryLevels[context.logger]);
    }
    return this.LEVELS.indexOf(level) >= this.LEVELS.indexOf(this.currentLevel);
  }

  /**
   * Outputs a log message to the console immediately (asynchronous).
   * @param {string} level - Log level (trace, debug, info, warn, error)
   * @param {Array<any>} args - Arguments to be logged
   * @param {Object} [context={}] - Context object with additional information
   * @param {boolean} [immediate=false] - Whether to output immediately
   */
  async output(level, args, context, immediate = false) {
    if (!this.shouldLog(level, context)) return;

    this.logCounts[level] = (this.logCounts[level] || 0) + 1;
    if (context.slaveId != null) this.logStats.bySlaveId[context.slaveId] = (this.logStats.bySlaveId[context.slaveId] || 0) + 1;
    if (context.funcCode != null) this.logStats.byFuncCode[context.funcCode] = (this.logStats.byFuncCode[context.funcCode] || 0) + 1;
    if (context.exceptionCode != null) this.logStats.byExceptionCode[context.exceptionCode] = (this.logStats.byExceptionCode[context.exceptionCode] || 0) + 1;

    if (this.watchCallback) {
      this.watchCallback({ level, args, context });
    }

    const now = Date.now();
    if (!immediate && now - this.lastLogTime < this.logRateLimit && level !== 'error' && level !== 'warn') return;
    this.lastLogTime = now;

    // Выводим лог сразу, асинхронно
    const formatted = this.format(level, args, context);
    if (this.useColors) {
      const [head, indent, ...rest] = formatted;
      console[level](head + indent, ...rest);
    } else {
      console[level](...formatted);
    }
  }

  /**
   * Splits the arguments into the main arguments and the context object.
   * @param {Array<any>} args - Arguments to be logged
   * @returns {{ args: Array<any>, context: Object }}
   */
  splitArgsAndContext(args) {
    if (args.length > 1) {
      const lastArg = args[args.length - 1];
      // Проверяем, является ли последний аргумент объектом или массивом
      if (typeof lastArg === 'object' && lastArg !== null) {
        const context = args.pop();
        return { args, context };
      }
    }
    return { args, context: {} };
  }

  async trace(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('trace', newArgs, context);
  }

  async debug(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('debug', newArgs, context);
  }

  async info(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('info', newArgs, context);
  }

  async warn(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('warn', newArgs, context, true);
  }

  async error(...args) {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('error', newArgs, context, true);
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
    if (level !== 'none' && !this.LEVELS.includes(level)) throw new Error(`Unknown log level: ${level}`);
    this.categoryLevels[category] = level;
  }

  pauseCategory(category) {
    this.categoryLevels[category] = 'none';
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
    this.globalContext.transport = type;
  }

  setBuffering(value) {
    this.buffering = !!value;
  }

  setFlushInterval(ms) {
    if (typeof ms !== 'number' || ms < 0) throw new Error('Flush interval must be a non-negative number');
    this.flushInterval = ms;
  }

  setRateLimit(ms) {
    if (typeof ms !== 'number' || ms < 0) throw new Error('Rate limit must be a non-negative number');
    this.logRateLimit = ms;
  }

  setLogFormat(fields) {
    const validFields = ['timestamp', 'level', 'logger', 'slaveId', 'funcCode', 'exceptionCode', 'address', 'quantity', 'responseTime'];
    if (!Array.isArray(fields) || !fields.every(f => validFields.includes(f))) {
      throw new Error(`Invalid log format. Valid fields: ${validFields.join(', ')}`);
    }
    this.logFormat = fields;
  }

  setCustomFormatter(field, formatter) {
    if (!['logger', 'slaveId', 'funcCode', 'exceptionCode', 'address', 'quantity', 'responseTime'].includes(field)) {
      throw new Error(`Invalid formatter field: ${field}`);
    }
    if (typeof formatter !== 'function') {
      throw new Error('Formatter must be a function');
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
    if (typeof callback !== 'function') throw new Error('Watch callback must be a function');
    this.watchCallback = callback;
  }

  clearWatch() {
    this.watchCallback = null;
  }

  flush() {
    // Пустой метод, так как буферизация отключена
  }

  inspectBuffer() {
    console.log('\x1b[1;36m=== Log Buffer Contents ===\x1b[0m');
    if (this.buffer.length === 0) {
      console.log('Buffer is empty');
    } else {
      this.buffer.forEach((item, index) => {
        const formatted = this.format(item.level, item.args, item.context);
        console.log(`[${index}] ${formatted.join(' ')}`);
      });
    }
    console.log(`Buffer Size: ${this.buffer.length}/${this.MAX_BUFFER_SIZE}`);
    console.log('\x1b[1;36m==========================\x1b[0m');
  }

  summary() {
    console.log('\x1b[1;36m=== Logger Summary ===\x1b[0m');
    console.log(`Trace Messages: ${this.logCounts.trace || 0}`);
    console.log(`Debug Messages: ${this.logCounts.debug || 0}`);
    console.log(`Info Messages: ${this.logCounts.info || 0}`);
    console.log(`Warn Messages: ${this.logCounts.warn || 0}`);
    console.log(`Error Messages: ${this.logCounts.error || 0}`);
    console.log(`Total Messages: ${Object.values(this.logCounts).reduce((sum, count) => sum + count, 0)}`);
    console.log(`By Slave ID: ${JSON.stringify(this.logStats.bySlaveId, null, 2)}`);
    console.log(`By Function Code: ${JSON.stringify(
      Object.entries(this.logStats.byFuncCode).reduce((acc, [code, count]) => {
        const name = Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === parseInt(code)) || 'Unknown';
        acc[`${code}/${name}`] = count;
        return acc;
      }, {}),
      null,
      2
    )}`);
    console.log(`By Exception Code: ${JSON.stringify(
      Object.entries(this.logStats.byExceptionCode).reduce((acc, [code, count]) => {
        acc[`${code}/${EXCEPTION_CODES[code] || 'Unknown'}`] = count;
        return acc;
      }, {}),
      null,
      2
    )}`);
    console.log(`Buffering: ${this.buffering ? 'Enabled' : 'Disabled'} (Interval: ${this.flushInterval}ms)`);
    console.log(`Rate Limit: ${this.logRateLimit}ms`);
    console.log(`Buffer Size: ${this.buffer.length}/${this.MAX_BUFFER_SIZE}`);
    console.log(`Current Level: ${this.currentLevel}`);
    console.log(`Categories: ${Object.keys(this.categoryLevels).length ? JSON.stringify(this.categoryLevels, null, 2) : 'None'}`);
    console.log(`Filters: slaveId=${JSON.stringify([...this.filters.slaveId])}, funcCode=${JSON.stringify([...this.filters.funcCode])}, exceptionCode=${JSON.stringify([...this.filters.exceptionCode])}`);
    console.log(`Highlights: ${this.highlightRules.length ? JSON.stringify(this.highlightRules, null, 2) : 'None'}`);
    console.log('\x1b[1;36m=====================\x1b[0m');
  }

  createLogger(name) {
    if (!name) throw new Error('Logger name required');
    return {
      trace: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('trace', newArgs, { ...context, logger: name });
      },
      debug: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('debug', newArgs, { ...context, logger: name });
      },
      info: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('info', newArgs, { ...context, logger: name });
      },
      warn: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('warn', newArgs, { ...context, logger: name }, true);
      },
      error: async (...args) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('error', newArgs, { ...context, logger: name }, true);
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