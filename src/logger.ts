// src/logger.ts

// ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
// ⣿⠘⢿⣿⣿⣿⣿⣿⣿⣏⢿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣹⣿⣿⣿⣿⣿⣿⡿⠃⣿
// ⣿⡆⠄⠻⣿⣿⣿⣿⣿⣿⠄⠹⣿⣿⣿⣿⣿⣿⠏⠄⣿⣿⣿⣿⣿⣿⠟⠄⢰⣿
// ⣿⡇⠄⠄⠈⠻⠿⢿⣿⣿⡆⠄⠈⠿⠿⠿⠿⠁⠄⢰⣿⣿⡿⠿⠟⠁⠄⠄⢸⣿
// ⣿⣿⠄⠄⠄⠄⠄⠄⠄⠉⣧⠄⠄⠄⠄⠄⠄⠄⠄⣼⠉⠄⠄⠄⠄⠄⠄⠄⣿⣿
// ⣿⣿⡀⠄⠄⠹⠶⢶⣤⣄⣹⡄⠄⠄⢻⡟⠄⠄⢠⣏⣠⣤⡶⠶⠏⠄⠄⢀⣿⣿
// ⣿⣿⡇⠄⠄⠄⣀⠄⠄⠉⠹⡇⠄⠄⠘⠃⠄⠄⢸⠏⠉⠄⠄⣀⠄⠄⠄⢸⣿⣿
// ⣿⣿⣿⠄⠄⠄⠉⠛⠛⠶⣦⣿⡄⠄⠄⠄⠄⠄⢠⣿⣴⠶⠛⠛⠉⠄⠄⠄⣿⣿
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

import {
  ModbusFunctionCode,
  ModbusExceptionCode,
  MODBUS_EXCEPTION_MESSAGES,
} from './constants/constants.js';
import { LogContext, LoggerInstance, LogLevel } from './types/modbus-types.js';

class Logger {
  private LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

  private currentLevel: LogLevel = 'info';
  private enabled: boolean = true;
  private useColors: boolean = true;
  private buffering: boolean = false;
  private flushInterval: number = 300;
  private MAX_BUFFER_SIZE: number = 1000;

  private COLORS: Record<LogLevel | 'exception' | 'reset', string> = {
    trace: '\x1b[1;35m',
    debug: '\x1b[1;36m',
    info: '\x1b[1;32m',
    warn: '\x1b[1;33m',
    error: '\x1b[1;31m',
    exception: '\x1b[1;41m',
    reset: '\x1b[0m',
  };

  private groupLevel: number = 0;
  private globalContext: LogContext = {};
  private buffer: unknown[] = [];
  // private flushTimeout: NodeJS.Timeout | null = null;
  private categoryLevels: Record<string, LogLevel | 'none'> = {};
  private logCounts: Record<LogLevel, number> = { trace: 0, debug: 0, info: 0, warn: 0, error: 0 };
  private logStats: {
    bySlaveId: Record<number, number>;
    byFuncCode: Record<number, number>;
    byExceptionCode: Record<number, number>;
  } = { bySlaveId: {}, byFuncCode: {}, byExceptionCode: {} };
  private logFormat: (keyof LogContext | 'timestamp' | 'level' | 'logger')[] = [
    'timestamp',
    'level',
    'logger',
    'slaveId',
    'funcCode',
    'exceptionCode',
    'address',
    'quantity',
    'responseTime',
  ];
  private customFormatters: Record<keyof LogContext, (value: unknown) => string> = {};
  private filters: {
    slaveId: Set<number>;
    funcCode: Set<number>;
    exceptionCode: Set<number>;
  } = { slaveId: new Set(), funcCode: new Set(), exceptionCode: new Set() };
  private highlightRules: Array<Partial<LogContext>> = [];
  private watchCallback:
    | ((data: { level: LogLevel; args: unknown[]; context: LogContext }) => void)
    | null = null;
  private logRateLimit: number = 100;
  private lastLogTime: number = 0;

  // Кэшированные значения для производительности
  private static readonly FUNCTION_CODE_NAMES = new Map<ModbusFunctionCode, string>([
    [ModbusFunctionCode.READ_COILS, 'READ_COILS'],
    [ModbusFunctionCode.READ_DISCRETE_INPUTS, 'READ_DISCRETE_INPUTS'],
    [ModbusFunctionCode.READ_HOLDING_REGISTERS, 'READ_HOLDING_REGISTERS'],
    [ModbusFunctionCode.READ_INPUT_REGISTERS, 'READ_INPUT_REGISTERS'],
    [ModbusFunctionCode.WRITE_SINGLE_COIL, 'WRITE_SINGLE_COIL'],
    [ModbusFunctionCode.WRITE_SINGLE_REGISTER, 'WRITE_SINGLE_REGISTER'],
    [ModbusFunctionCode.WRITE_MULTIPLE_COILS, 'WRITE_MULTIPLE_COILS'],
    [ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS, 'WRITE_MULTIPLE_REGISTERS'],
    [ModbusFunctionCode.REPORT_SLAVE_ID, 'REPORT_SLAVE_ID'],
    [ModbusFunctionCode.READ_DEVICE_COMMENT, 'READ_DEVICE_COMMENT'],
    [ModbusFunctionCode.WRITE_DEVICE_COMMENT, 'WRITE_DEVICE_COMMENT'],
    [ModbusFunctionCode.READ_DEVICE_IDENTIFICATION, 'READ_DEVICE_IDENTIFICATION'],
    [ModbusFunctionCode.READ_FILE_LENGTH, 'READ_FILE_LENGTH'],
    [ModbusFunctionCode.READ_FILE_CHUNK, 'READ_FILE_CHUNK'],
    [ModbusFunctionCode.OPEN_FILE, 'OPEN_FILE'],
    [ModbusFunctionCode.CLOSE_FILE, 'CLOSE_FILE'],
    [ModbusFunctionCode.RESTART_CONTROLLER, 'RESTART_CONTROLLER'],
    [ModbusFunctionCode.GET_CONTROLLER_TIME, 'GET_CONTROLLER_TIME'],
    [ModbusFunctionCode.SET_CONTROLLER_TIME, 'SET_CONTROLLER_TIME'],
  ]);

  private getIndent(): string {
    return '  '.repeat(this.groupLevel);
  }

  private getTimestamp(): string {
    return new Date().toISOString().slice(11, 19);
  }

  /**
   * Formats a log message according to the specified level and context.
   * @param level - Log level (trace, debug, info, warn, error)
   * @param args - Arguments to be logged
   * @param context - Context object with additional information
   * @returns Formatted log message
   */
  private format(level: LogLevel, args: unknown[], context: LogContext = {}): string[] {
    const color: string = this.useColors ? this.COLORS[level] : '';
    const reset: string = this.useColors ? this.COLORS.reset : '';
    const indent: string = this.getIndent();
    const isHighlighted: boolean = this.highlightRules.some(
      rule =>
        (!rule.slaveId || rule.slaveId === context.slaveId) &&
        (!rule.funcCode || rule.funcCode === context.funcCode) &&
        (!rule.exceptionCode || rule.exceptionCode === context.exceptionCode)
    );

    const headerParts: string[] = [];
    if (this.logFormat.includes('timestamp')) headerParts.push(`[${this.getTimestamp()}]`);
    if (this.logFormat.includes('level')) headerParts.push(`[${level.toUpperCase()}]`);

    // Добавляем имя логгера как отдельное поле без префикса
    if (this.logFormat.includes('logger') && context['logger']) {
      const formatter: (value: unknown) => string =
        this.customFormatters['logger'] || (v => `[${v}]`);
      headerParts.push(formatter(context['logger']));
    }

    if (this.logFormat.includes('slaveId')) {
      const slaveId = context['slaveId'] ?? this.globalContext['slaveId'] ?? 'N/A';
      const formatter: (value: unknown) => string =
        this.customFormatters['slaveId'] || (v => `[S:${v}]`);
      headerParts.push(formatter(String(slaveId)));
    }
    if (this.logFormat.includes('funcCode')) {
      const funcCode =
        context['funcCode'] != null
          ? `0x${context['funcCode'].toString(16).padStart(2, '0')}`
          : 'N/A';
      const funcName =
        context['funcCode'] != null
          ? Logger.FUNCTION_CODE_NAMES.get(context['funcCode'] as ModbusFunctionCode) || 'Unknown'
          : 'N/A';
      const formatter: (value: unknown) => string =
        this.customFormatters['funcCode'] || (v => `[F:${v}/${funcName}]`);
      headerParts.push(formatter(`${funcCode}`));
    }
    if (this.logFormat.includes('exceptionCode') && context['exceptionCode'] != null) {
      const exceptionName =
        MODBUS_EXCEPTION_MESSAGES[context['exceptionCode'] as ModbusExceptionCode] || 'Unknown';
      const formatter: (value: unknown) => string =
        this.customFormatters['exceptionCode'] || (v => `[E:${v}/${exceptionName}]`);
      headerParts.push(
        `${this.useColors && isHighlighted ? this.COLORS.exception : ''}${formatter(context['exceptionCode'])}${reset}`
      );
    }
    if (this.logFormat.includes('address') && context['address'] != null) {
      const formatter: (value: unknown) => string =
        this.customFormatters['address'] || (v => `[A:${v}]`);
      headerParts.push(formatter(String(context['address'])));
    }
    if (this.logFormat.includes('quantity') && context['quantity'] != null) {
      const formatter: (value: unknown) => string =
        this.customFormatters['quantity'] || (v => `[Q:${v}]`);
      headerParts.push(formatter(String(context['quantity'])));
    }
    if (this.logFormat.includes('responseTime') && context['responseTime'] != null) {
      const formatter: (value: unknown) => string =
        this.customFormatters['responseTime'] || (v => `[RT:${v}ms]`);
      headerParts.push(formatter(String(context['responseTime'])));
    }

    const formattedArgs: string[] = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`.trim();
      }
      return String(arg);
    });

    // Добавим context к аргументам, если он не пустой и не включает служебные поля
    const contextToPrint: LogContext = { ...context };
    delete contextToPrint['logger'];
    if (Object.keys(contextToPrint).length > 0) {
      formattedArgs.push(JSON.stringify(contextToPrint));
    }

    return [
      `${color}${headerParts.join('')}${isHighlighted ? this.COLORS.exception : ''}`,
      indent,
      ...formattedArgs,
      reset,
    ];
  }

  /**
   * Determines whether a log message should be logged based on level, context, and filters.
   * @param level - Log level (trace, debug, info, warn, error)
   * @param context - Context object with additional information
   * @returns Whether the log message should be logged
   */
  private shouldLog(level: LogLevel, context: LogContext = {}): boolean {
    if (!this.enabled) return false;
    if (
      this.filters.slaveId.size > 0 &&
      context['slaveId'] != null &&
      this.filters.slaveId.has(context['slaveId'])
    )
      return false;
    if (
      this.filters.funcCode.size > 0 &&
      context['funcCode'] != null &&
      this.filters.funcCode.has(context['funcCode'])
    )
      return false;
    if (
      this.filters.exceptionCode.size > 0 &&
      context['exceptionCode'] != null &&
      this.filters.exceptionCode.has(context['exceptionCode'])
    )
      return false;
    if (context['logger'] && this.categoryLevels[context['logger']] === 'none') return false;
    if (context['logger'] && this.categoryLevels[context['logger']] !== 'none') {
      const categoryLevel = this.categoryLevels[context['logger']] as LogLevel; // Cast to LogLevel, safe after check
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
  private async output(
    level: LogLevel,
    args: unknown[],
    context: LogContext,
    immediate: boolean = false
  ): Promise<void> {
    if (!this.shouldLog(level, context)) return;

    this.logCounts[level] = (this.logCounts[level] || 0) + 1;
    if (context['slaveId'] != null)
      this.logStats.bySlaveId[context['slaveId']] =
        (this.logStats.bySlaveId[context['slaveId']] || 0) + 1;
    if (context['funcCode'] != null)
      this.logStats.byFuncCode[context['funcCode']] =
        (this.logStats.byFuncCode[context['funcCode']] || 0) + 1;
    if (context['exceptionCode'] != null)
      this.logStats.byExceptionCode[context['exceptionCode']] =
        (this.logStats.byExceptionCode[context['exceptionCode']] || 0) + 1;

    if (this.watchCallback) {
      this.watchCallback({ level, args, context });
    }

    const now: number = Date.now();
    if (
      !immediate &&
      now - this.lastLogTime < this.logRateLimit &&
      level !== 'error' &&
      level !== 'warn'
    )
      return;
    this.lastLogTime = now;

    const formatted: string[] = this.format(level, args, context);
    if (this.useColors) {
      const head = formatted[0] || '';
      const indent = formatted[1] || '';
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
  private splitArgsAndContext(args: unknown[]): { args: unknown[]; context: LogContext } {
    if (args.length > 1) {
      const lastArg = args[args.length - 1];
      // Проверяем, является ли последний аргумент объектом или массивом
      if (typeof lastArg === 'object' && lastArg !== null) {
        const context = args.pop() as LogContext;
        return { args, context };
      }
    }
    return { args, context: {} };
  }

  async trace(...args: unknown[]): Promise<void> {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('trace', newArgs, context);
  }

  async debug(...args: unknown[]): Promise<void> {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('debug', newArgs, context);
  }

  async info(...args: unknown[]): Promise<void> {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('info', newArgs, context);
  }

  async warn(...args: unknown[]): Promise<void> {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('warn', newArgs, context, true);
  }

  async error(...args: unknown[]): Promise<void> {
    const { args: newArgs, context } = this.splitArgsAndContext([...args]);
    await this.output('error', newArgs, context, true);
  }

  group(): void {
    this.groupLevel++;
  }

  groupCollapsed(): void {
    this.groupLevel++;
  }

  groupEnd(): void {
    if (this.groupLevel > 0) this.groupLevel--;
  }

  setLevel(level: LogLevel): void {
    if (this.LEVELS.includes(level)) {
      this.currentLevel = level;
    } else {
      throw new Error(`Unknown log level: ${level}`);
    }
  }

  setLevelFor(category: string, level: LogLevel | 'none'): void {
    if (level !== 'none' && !this.LEVELS.includes(level))
      throw new Error(`Unknown log level: ${level}`);
    this.categoryLevels[category] = level;
  }

  pauseCategory(category: string): void {
    this.categoryLevels[category] = 'none';
  }

  resumeCategory(category: string): void {
    delete this.categoryLevels[category];
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  disableColors(): void {
    this.useColors = false;
  }

  setGlobalContext(ctx: LogContext): void {
    this.globalContext = { ...ctx };
  }

  addGlobalContext(ctx: LogContext): void {
    this.globalContext = { ...this.globalContext, ...ctx };
  }

  setTransportType(type: string): void {
    this.globalContext['transport'] = type;
  }

  setBuffering(value: boolean): void {
    this.buffering = !!value;
  }

  setFlushInterval(ms: number): void {
    if (typeof ms !== 'number' || ms < 0)
      throw new Error('Flush interval must be a non-negative number');
    this.flushInterval = ms;
  }

  setRateLimit(ms: number): void {
    if (typeof ms !== 'number' || ms < 0)
      throw new Error('Rate limit must be a non-negative number');
    this.logRateLimit = ms;
  }

  setLogFormat(fields: (keyof LogContext | 'timestamp' | 'level' | 'logger')[]): void {
    const validFields: (keyof LogContext | 'timestamp' | 'level' | 'logger')[] = [
      'timestamp',
      'level',
      'logger',
      'slaveId',
      'funcCode',
      'exceptionCode',
      'address',
      'quantity',
      'responseTime',
    ];
    if (!Array.isArray(fields) || !fields.every(f => validFields.includes(f))) {
      throw new Error(`Invalid log format. Valid fields: ${validFields.join(', ')}`);
    }
    this.logFormat = fields;
  }

  setCustomFormatter(field: keyof LogContext, formatter: (value: unknown) => string): void {
    const fieldStr: string = field as string;
    if (
      ![
        'logger',
        'slaveId',
        'funcCode',
        'exceptionCode',
        'address',
        'quantity',
        'responseTime',
      ].includes(fieldStr)
    ) {
      throw new Error(`Invalid formatter field: ${fieldStr}`);
    }
    if (typeof formatter !== 'function') {
      throw new Error('Formatter must be a function');
    }
    this.customFormatters[field] = formatter;
  }

  mute({ slaveId, funcCode, exceptionCode }: Partial<LogContext> = {}): void {
    if (slaveId != null) this.filters.slaveId.add(slaveId);
    if (funcCode != null) this.filters.funcCode.add(funcCode);
    if (exceptionCode != null) this.filters.exceptionCode.add(exceptionCode);
  }

  unmute({ slaveId, funcCode, exceptionCode }: Partial<LogContext> = {}): void {
    if (slaveId != null) this.filters.slaveId.delete(slaveId);
    if (funcCode != null) this.filters.funcCode.delete(funcCode);
    if (exceptionCode != null) this.filters.exceptionCode.delete(exceptionCode);
  }

  highlight({ slaveId, funcCode, exceptionCode }: Partial<LogContext> = {}): void {
    this.highlightRules.push({ slaveId, funcCode, exceptionCode });
  }

  clearHighlights(): void {
    this.highlightRules = [];
  }

  watch(callback: (data: { level: LogLevel; args: unknown[]; context: LogContext }) => void): void {
    if (typeof callback !== 'function') throw new Error('Watch callback must be a function');
    this.watchCallback = callback;
  }

  clearWatch(): void {
    this.watchCallback = null;
  }

  flush(): void {}

  inspectBuffer(): void {
    console.log('\x1b[1;36m=== Log Buffer Contents ===\x1b[0m');
    if (this.buffer.length === 0) {
      console.log('Buffer is empty');
    } else {
      this.buffer.forEach((item: unknown, index: number) => {
        if (
          typeof item === 'object' &&
          item !== null &&
          'level' in item &&
          'args' in item &&
          'context' in item
        ) {
          const typedItem = item as { level: unknown; args: unknown; context: unknown };

          if (
            typeof typedItem.level === 'string' &&
            Array.isArray(typedItem.args) &&
            typeof typedItem.context === 'object' &&
            typedItem.context !== null
          ) {
            const formatted: string[] = this.format(
              typedItem.level as LogLevel,
              typedItem.args as unknown[],
              typedItem.context as LogContext
            );
            console.log(`[${index}] ${formatted.join(' ')}`);
          } else {
            console.log(`[${index}] ${String(item)}`);
          }
        } else {
          console.log(`[${index}] ${String(item)}`);
        }
      });
    }
    console.log(`Buffer Size: ${this.buffer.length}/${this.MAX_BUFFER_SIZE}`);
    console.log('\x1b[1;36m==========================\x1b[0m');
  }

  summary(): void {
    console.log('\x1b[1;36m=== Logger Summary ===\x1b[0m');
    console.log(`Trace Messages: ${this.logCounts.trace || 0}`);
    console.log(`Debug Messages: ${this.logCounts.debug || 0}`);
    console.log(`Info Messages: ${this.logCounts.info || 0}`);
    console.log(`Warn Messages: ${this.logCounts.warn || 0}`);
    console.log(`Error Messages: ${this.logCounts.error || 0}`);
    console.log(
      `Total Messages: ${Object.values(this.logCounts).reduce((sum: number, count: number) => sum + count, 0)}`
    );
    console.log(`By Slave ID: ${JSON.stringify(this.logStats.bySlaveId, null, 2)}`);
    console.log(
      `By Function Code: ${JSON.stringify(
        Object.entries(this.logStats.byFuncCode).reduce(
          (acc: Record<string, number>, [code, count]) => {
            const name =
              Logger.FUNCTION_CODE_NAMES.get(parseInt(code) as ModbusFunctionCode) || 'Unknown';
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
          (acc: Record<string, number>, [code, count]) => {
            acc[
              `${code}/${MODBUS_EXCEPTION_MESSAGES[parseInt(code) as ModbusExceptionCode] || 'Unknown'}`
            ] = count;
            return acc;
          },
          {}
        ),
        null,
        2
      )}`
    );
    console.log(
      `Buffering: ${this.buffering ? 'Enabled' : 'Disabled'} (Interval: ${this.flushInterval}ms)`
    );
    console.log(`Rate Limit: ${this.logRateLimit}ms`);
    console.log(`Buffer Size: ${this.buffer.length}/${this.MAX_BUFFER_SIZE}`);
    console.log(`Current Level: ${this.currentLevel}`);
    console.log(
      `Categories: ${Object.keys(this.categoryLevels).length ? JSON.stringify(this.categoryLevels, null, 2) : 'None'}`
    );
    console.log(
      `Filters: slaveId=${JSON.stringify([...this.filters.slaveId])}, funcCode=${JSON.stringify([...this.filters.funcCode])}, exceptionCode=${JSON.stringify([...this.filters.exceptionCode])}`
    );
    console.log(
      `Highlights: ${this.highlightRules.length ? JSON.stringify(this.highlightRules, null, 2) : 'None'}`
    );
    console.log('\x1b[1;36m=====================\x1b[0m');
  }

  /**
   * Creates a logger instance with category.
   * @param name - Logger name
   * @returns Logger instance
   */
  createLogger(name: string): LoggerInstance {
    if (!name) throw new Error('Logger name required');
    return {
      trace: async (...args: unknown[]) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('trace', newArgs, { ...context, logger: name });
      },
      debug: async (...args: unknown[]) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('debug', newArgs, { ...context, logger: name });
      },
      info: async (...args: unknown[]) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('info', newArgs, { ...context, logger: name });
      },
      warn: async (...args: unknown[]) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('warn', newArgs, { ...context, logger: name }, true);
      },
      error: async (...args: unknown[]) => {
        const { args: newArgs, context } = this.splitArgsAndContext([...args]);
        await this.output('error', newArgs, { ...context, logger: name }, true);
      },
      group: () => this.group(),
      groupCollapsed: () => this.groupCollapsed(),
      groupEnd: () => this.groupEnd(),
      setLevel: (lvl: LogLevel) => this.setLevelFor(name, lvl),
      pause: () => this.pauseCategory(name),
      resume: () => this.resumeCategory(name),
    };
  }
}

export = Logger;
