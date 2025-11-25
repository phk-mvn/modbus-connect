// src/types/polling-manager.d.ts

import Logger from './logger.js';
import {
  LogLevel,
  PollingManagerConfig,
  PollingTaskOptions,
  PollingTaskState,
  PollingTaskStats,
  PollingQueueInfo,
  PollingSystemStats,
} from './types/modbus-types.js';

declare class PollingManager {
  constructor(config?: PollingManagerConfig, loggerInstance?: Logger);

  // Task Management
  addTask(options: PollingTaskOptions): void;
  updateTask(id: string, newOptions: Partial<PollingTaskOptions>): void;
  removeTask(id: string): void;
  restartTask(id: string): void;
  startTask(id: string): void;
  stopTask(id: string): void;
  pauseTask(id: string): void;
  resumeTask(id: string): void;
  setTaskInterval(id: string, interval: number): void;

  // State & Stats
  isTaskRunning(id: string): boolean;
  isTaskPaused(id: string): boolean;
  getTaskState(id: string): PollingTaskState | null;
  getTaskStats(id: string): PollingTaskStats | null;
  hasTask(id: string): boolean;
  getTaskIds(): string[];
  getAllTaskStats(): Record<string, PollingTaskStats>;

  // System & Queue Info
  getQueueInfo(): PollingQueueInfo;
  getSystemStats(): PollingSystemStats;

  // Bulk Operations
  clearAll(): void;
  restartAllTasks(): void;
  pauseAllTasks(): void;
  resumeAllTasks(): void;
  startAllTasks(): void;
  stopAllTasks(): void;

  // Execution Control
  /**
   * Executes a function immediately, bypassing the polling queue but respecting the transport mutex.
   * Use this for manual commands (write/read) to ensure thread safety.
   */
  executeImmediate<T>(fn: () => Promise<T>): Promise<T>;

  // Logger Management
  enablePollingManagerLogger(level?: LogLevel): void;
  disablePollingManagerLogger(): void;

  enableTaskControllerLoggers(level?: LogLevel): void;
  disableTaskControllerLoggers(): void;

  enableTaskControllerLogger(taskId: string, level?: LogLevel): void;
  disableTaskControllerLogger(taskId: string): void;

  enableAllLoggers(level?: LogLevel): void;
  disableAllLoggers(): void;
  setLogLevelForAll(level: LogLevel): void;
}

export = PollingManager;
