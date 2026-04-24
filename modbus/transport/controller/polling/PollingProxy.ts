// modbus/transport/controller/polling/PollingProxy.ts

import type {
  IPollingTaskOptions,
  IPollingQueueInfo,
  TPollingAction,
  TPollingBulkAction,
} from '../../../types/public.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

/**
 * Proxy class that provides a unified interface for managing polling tasks across multiple transports.
 * It routes commands to the specific PollingManager associated with a Transport ID.
 *
 * BUG-5 fix: Methods now throw errors for missing transports instead of silently returning.
 * IMP-7: Accepts both enum values (EPollingAction.Start) and plain strings ('start').
 */
export class PollingProxy {
  constructor(private readonly _registry: TransportRegistry) {}

  public addTask(transportId: string, options: IPollingTaskOptions): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.addTask(options);
  }

  /**
   * BUG-5 fix: Throws error if transport not found instead of silently returning.
   */
  public removeTask(transportId: string, taskId: string): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found for task removal`);
    info.pollingManager.removeTask(taskId);
  }

  /**
   * BUG-5 fix: Throws error if transport not found.
   */
  public async updateTask(
    transportId: string,
    taskId: string,
    options: IPollingTaskOptions
  ): Promise<void> {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found for task update`);
    await info.pollingManager.updateTask(taskId, options);
  }

  /**
   * IMP-7: Accepts EPollingAction enum or plain string ('start'|'stop'|'pause'|'resume').
   * BUG-5 fix: Throws error if transport not found.
   */
  public controlTask(transportId: string, taskId: string, action: TPollingAction): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found for task control`);

    switch (action) {
      case 'start':
        info.pollingManager.startTask(taskId);
        break;
      case 'stop':
        info.pollingManager.stopTask(taskId);
        break;
      case 'pause':
        info.pollingManager.pauseTask(taskId);
        break;
      case 'resume':
        info.pollingManager.resumeTask(taskId);
        break;
    }
  }

  /**
   * IMP-7: Accepts EPollingBulkAction enum or plain string ('startAll'|'stopAll'|'pauseAll'|'resumeAll').
   * BUG-5 fix: Throws error if transport not found.
   */
  public controlAll(transportId: string, action: TPollingBulkAction): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found for bulk control`);

    switch (action) {
      case 'startAll':
        info.pollingManager.startAllTasks();
        break;
      case 'stopAll':
        info.pollingManager.stopAllTasks();
        break;
      case 'pauseAll':
        info.pollingManager.pauseAllTasks();
        break;
      case 'resumeAll':
        info.pollingManager.resumeAllTasks();
        break;
    }
  }

  public getQueueInfo(transportId: string): IPollingQueueInfo {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info.pollingManager.getQueueInfo();
  }

  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info.pollingManager.executeImmediate(fn);
  }

  public pauseAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.pauseAllTasks();
  }

  public resumeAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.resumeAllTasks();
  }

  public clearAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.clearAll();
  }

  public stopAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.stopAllTasks();
  }
}
