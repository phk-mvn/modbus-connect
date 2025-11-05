// src/types/logger.d.ts

import { LogContext, LoggerInstance, LogLevel } from './modbus-types.js';

export { LoggerInstance };

/**
 * Logger class
 */
export class Logger {
  constructor();

  trace(...args: unknown[]): Promise<void>;
  debug(...args: unknown[]): Promise<void>;
  info(...args: unknown[]): Promise<void>;
  warn(...args: unknown[]): Promise<void>;
  error(...args: unknown[]): Promise<void>;
  group(): void;
  groupCollapsed(): void;
  groupEnd(): void;
  setLevel(level: LogLevel): void;
  setLevelFor(category: string, level: LogLevel | 'none'): void;
  pauseCategory(category: string): void;
  resumeCategory(category: string): void;
  enable(): void;
  disable(): void;
  getLevel(): LogLevel;
  isEnabled(): boolean;
  disableColors(): void;
  setGlobalContext(ctx: LogContext): void;
  addGlobalContext(ctx: LogContext): void;
  setTransportType(type: string): void;
  setBuffering(value: boolean): void;
  setFlushInterval(ms: number): void;
  setRateLimit(ms: number): void;
  setLogFormat(fields: (keyof LogContext | 'timestamp' | 'level' | 'logger')[]): void;
  setCustomFormatter(field: keyof LogContext, formatter: (value: unknown) => string): void;
  mute(options?: Partial<LogContext>): void;
  unmute(options?: Partial<LogContext>): void;
  highlight(options?: Partial<LogContext>): void;
  clearHighlights(): void;
  watch(callback: (data: { level: LogLevel; args: unknown[]; context: LogContext }) => void): void;
  clearWatch(): void;
  flush(): void;
  inspectBuffer(): void;
  summary(): void;
  createLogger(name: string): LoggerInstance;
}

export = Logger;
