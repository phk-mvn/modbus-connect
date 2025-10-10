// src/types/diagnostics.d.ts

import {
  DiagnosticsInterface,
  DiagnosticsOptions,
  DiagnosticsStats,
  AnalysisResult,
} from './modbus-types';

export { DiagnosticsOptions, DiagnosticsStats, AnalysisResult, DiagnosticsInterface };

/**
 * Diagnostics class
 */
export class Diagnostics implements DiagnosticsInterface {
  constructor(options?: DiagnosticsOptions);

  recordRequest(slaveId?: number, funcCode?: number): void;
  recordFunctionCall(funcCode: number, slaveId?: number): void;
  recordDataSent(byteLength: number, slaveId?: number, funcCode?: number): void;
  recordDataReceived(byteLength: number, slaveId?: number, funcCode?: number): void;
  recordSuccess(responseTimeMs: number, slaveId?: number, funcCode?: number): void;
  recordError(
    error: Error,
    options?: {
      code?: string | null;
      responseTimeMs?: number;
      exceptionCode?: number | null;
      slaveId?: number;
      funcCode?: number;
    }
  ): void;
  recordRetry(attempts: number, slaveId?: number, funcCode?: number): void;
  recordRetrySuccess(slaveId?: number, funcCode?: number): void;
  getStats(): DiagnosticsStats;
  reset(): void;
  resetStats(metrics?: string[]): void;
  destroy(): void;
  analyze(): AnalysisResult;
  printStats(): void;
  serialize(): string;
  toTable(): { metric: string; value: unknown }[];
  mergeWith(other: Diagnostics): void;

  readonly averageResponseTime: number | null;
  readonly averageResponseTimeAll: number | null;
  readonly errorRate: number | null;
  readonly requestsPerSecond: number | null;
  readonly uptimeSeconds: number;
}
