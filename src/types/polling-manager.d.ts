// src/polling-manager.d.ts

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
  constructor(config?: PollingManagerConfig);

  addTask(options: PollingTaskOptions): void;
  updateTask(id: string, newOptions: Partial<PollingTaskOptions>): void;
  removeTask(id: string): void;
  restartTask(id: string): void;
  startTask(id: string): void;
  stopTask(id: string): void;
  pauseTask(id: string): void;
  resumeTask(id: string): void;
  setTaskInterval(id: string, interval: number): void;
  isTaskRunning(id: string): boolean;
  isTaskPaused(id: string): boolean;
  getTaskState(id: string): PollingTaskState | null;
  getTaskStats(id: string): PollingTaskStats | null;
  hasTask(id: string): boolean;
  getTaskIds(): string[];
  clearAll(): void;
  restartAllTasks(): void;
  pauseAllTasks(): void;
  resumeAllTasks(): void;
  startAllTasks(): void;
  stopAllTasks(): void;
  getAllTaskStats(): Record<string, PollingTaskStats>;
  getQueueInfo(resourceId: string): PollingQueueInfo | null;
  getSystemStats(): PollingSystemStats;

  // Logger management methods
  enablePollingManagerLogger(level?: LogLevel): void;
  disablePollingManagerLogger(): void;
  enableTaskQueueLoggers(level?: LogLevel): void;
  disableTaskQueueLoggers(): void;
  enableTaskControllerLoggers(level?: LogLevel): void;
  disableTaskControllerLoggers(): void;
  enableTaskQueueLogger(resourceId: string, level?: LogLevel): void;
  disableTaskQueueLogger(resourceId: string): void;
  enableTaskControllerLogger(taskId: string, level?: LogLevel): void;
  disableTaskControllerLogger(taskId: string): void;
  enableAllLoggers(level?: LogLevel): void;
  disableAllLoggers(): void;
  setLogLevelForAll(level: LogLevel): void;
}

export = PollingManager;
