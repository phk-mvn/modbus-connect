// modbus/transport/controller/polling/PollingProxy.ts

import type { IPollingTaskOptions, IPollingQueueInfo } from '../../../types/public.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

export class PollingProxy {
  constructor(private readonly _registry: TransportRegistry) {}

  public addTask(transportId: string, options: IPollingTaskOptions): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.addTask(options);
  }

  public removeTask(transportId: string, taskId: string): void {
    const info = this._registry.get(transportId);
    if (!info) return;
    info.pollingManager.removeTask(taskId);
  }

  public updateTask(transportId: string, taskId: string, options: IPollingTaskOptions): void {
    const info = this._registry.get(transportId);
    if (!info) return;
    info.pollingManager.updateTask(taskId, options);
  }

  public controlTask(
    transportId: string,
    taskId: string,
    action: 'start' | 'stop' | 'pause' | 'resume'
  ): void {
    const info = this._registry.get(transportId);
    if (!info) return;

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

  public controlAll(
    transportId: string,
    action: 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'
  ): void {
    const info = this._registry.get(transportId);
    if (!info) return;

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
    if (info) info.pollingManager.pauseAllTasks();
  }

  public resumeAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (info) info.pollingManager.resumeAllTasks();
  }

  public clearAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (info) info.pollingManager.clearAll();
  }
}
