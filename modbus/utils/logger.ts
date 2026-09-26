// modbus/utils/logger.ts

/**
 * Logger factory and utilities based on tslog.
 * Provides unified formatting, colored timestamps, level filtering,
 * and support for 'silent' mode across all library components.
 */

import { Logger, DefaultLogLevels, type ILogObj, type IMeta } from 'tslog';

/**
 * ANSI open-codes matching tslog's default per-level colors for log level names.
 */
const LEVEL_ANSI: Record<string, string> = {
  SILLY: '\u001b[1m\u001b[37m',
  TRACE: '\u001b[1m\u001b[97m',
  DEBUG: '\u001b[1m\u001b[32m',
  INFO: '\u001b[1m\u001b[34m',
  WARN: '\u001b[1m\u001b[33m',
  ERROR: '\u001b[1m\u001b[31m',
  FATAL: '\u001b[1m\u001b[91m',
};

/**
 * ANSI reset sequence to restore default terminal text styling.
 */
const ANSI_RESET = '\u001b[0m';
const DURATION_ANSI = '\u001b[36m';

export function formatDuration(durationMs: number, colorize: boolean): string {
  const duration = `+${durationMs}ms`;
  return colorize ? `${DURATION_ANSI}${duration}${ANSI_RESET}` : duration;
}

/**
 * Context metadata rendered as a compact bracketed prefix in front of a log message.
 * Every field is optional: only the tags actually known at the call site are emitted, so a
 * controller line produces `[TEST_RTU][rtu][ID:5]`, a retry warning `[ID:5][FC:3][ATT:1]`
 * and a port-level line `[TEST_RTU]`. Tags always render in the order declared here.
 */
export interface TLogMetaTags {
  /** Owning port id, rendered as a bare tag: `[TEST_RTU]`. */
  transportId?: string;
  /** Framing derived from the port RS mode, rendered as a bare tag: `[rtu]`. */
  framing?: string;
  /** Modbus slave unit address the exchange was addressed to. */
  slaveId?: number;
  /** Modbus function code of the request PDU. */
  funcCode?: number;
  /** 1-based attempt number, present only on retry-related messages. */
  attempt?: number;
}

/**
 * Builds the bracketed metadata prefix for a log message.
 *
 * @param meta - Known context metadata; absent fields are skipped.
 * @returns The prefix followed by a single space, or an empty string when nothing is known.
 */
export function formatMetaTags(meta: TLogMetaTags): string {
  const tags: string[] = [];
  if (meta.transportId) tags.push(`[${meta.transportId}]`);
  if (meta.framing) tags.push(`[${meta.framing}]`);
  if (meta.slaveId !== undefined) tags.push(`[ID:${meta.slaveId}]`);
  if (meta.funcCode !== undefined) tags.push(`[FC:${meta.funcCode}]`);
  if (meta.attempt !== undefined) tags.push(`[ATT:${meta.attempt}]`);
  return tags.length > 0 ? `${tags.join('')} ` : '';
}

/**
 * Wraps a text string in ANSI color codes corresponding to the specified log level name.
 *
 * @param logLevelName - Name of the log level (e.g., 'INFO', 'DEBUG').
 * @param text - Plain text string to colorize.
 * @returns Colorized text string terminated by ANSI reset code.
 */
function colorizeByLevel(logLevelName: string, text: string): string {
  const color = LEVEL_ANSI[logLevelName];
  return color != null ? `${color}${text}${ANSI_RESET}` : text;
}

/**
 * Applies level-matching ANSI color styling to the ISO timestamp in tslog template placeholders.
 *
 * @param meta - Metadata object provided by tslog for the current log event.
 * @param placeholderValues - Template placeholder values dictionary to be modified.
 * @returns void
 */
function colorizeTimestamp(meta: IMeta, placeholderValues: Record<string, string | number>): void {
  const raw = placeholderValues.dateIsoStr;
  if (typeof raw !== 'string' || raw.length === 0) {
    return;
  }
  placeholderValues.dateIsoStr = colorizeByLevel(meta.logLevelName, raw);
}

/**
 * Log levels accepted by tslog-based loggers.
 * Includes 'silent' to completely disable output.
 */
export type TTsLogLevel = 'silent' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Mapping between library log level names and tslog's internal DefaultLogLevels enum.
 */
export const TSLOG_MIN_LEVEL: Record<Exclude<TTsLogLevel, 'silent'>, DefaultLogLevels> = {
  trace: DefaultLogLevels.TRACE,
  debug: DefaultLogLevels.DEBUG,
  info: DefaultLogLevels.INFO,
  warn: DefaultLogLevels.WARN,
  error: DefaultLogLevels.ERROR,
  fatal: DefaultLogLevels.FATAL,
};

/**
 * Output format supported by tslog-based loggers:
 * - 'pretty': Colored, human-readable terminal lines.
 * - 'json': Machine-readable JSON records.
 */
export type TTsLogType = 'pretty' | 'json';

/**
 * Configuration options for creating a tslog Logger instance via `createTsLogger`.
 */
export interface TsLoggerOptions {
  /**
   * Component or subsystem identifier printed in log headers.
   */
  name: string;

  /**
   * Minimum log level threshold to display (default: 'info').
   */
  level?: TTsLogLevel;

  /**
   * Key-value bindings automatically attached to every emitted log object.
   */
  bindings?: Record<string, unknown>;

  /**
   * Output format ('pretty' or 'json'). Defaults to module default ('pretty').
   */
  type?: TTsLogType;
}

/**
 * Module-level default output format so every internal component logs in the same format.
 */
let defaultType: TTsLogType = 'pretty';

/**
 * Overrides the default output format for all loggers created subsequently.
 *
 * @param type - Default format to apply ('pretty' for human-readable lines, 'json' for JSON records).
 * @returns void
 */
export function setLoggerDefaultType(type: TTsLogType): void {
  defaultType = type;
}

/**
 * Factory function that instantiates and configures a tslog Logger.
 * Configures templates, timestamp colorization, and production position hiding.
 *
 * @param options - Logger configuration settings.
 * @returns A fully configured tslog Logger instance.
 */
export function createTsLogger(options: TsLoggerOptions): Logger<ILogObj> {
  const { name, level = 'info', bindings, type = defaultType } = options;

  return new Logger<ILogObj>(
    {
      name,
      minLevel: level === 'silent' ? undefined : TSLOG_MIN_LEVEL[level],
      type: level === 'silent' ? 'hidden' : type,
      hideLogPositionForProduction: process.env.NODE_ENV === 'production',
      prettyLogTemplate:
        '{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}.{{ms}} {{logLevelName}}{{filePathWithLine}}{{nameWithDelimiterPrefix}} ',
      prettyErrorLoggerNameDelimiter: ' ',
      overwrite: {
        addPlaceholders(logObjMeta, placeholderValues) {
          if (logObjMeta.logLevelId > DefaultLogLevels.DEBUG) {
            placeholderValues.fileNameWithLine = '';
            placeholderValues.filePathWithLine = '';
            placeholderValues.fullFilePath = '';
          } else if (placeholderValues.filePathWithLine !== '') {
            placeholderValues.filePathWithLine = ` ${placeholderValues.filePathWithLine}`;
          }
          colorizeTimestamp(logObjMeta, placeholderValues);
        },
      },
    },
    bindings
  );
}
