// modbus/transport/controller/polling/PollingProxy.ts

import type { IPollingTaskOptions, IPollingQueueInfo } from '../../../types/public.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

/**
 * Proxy class that provides a unified interface for managing polling tasks across multiple transports.
 * It routes commands to the specific PollingManager associated with a Transport ID.
 */
export class PollingProxy {
  /**
   * Creates an instance of PollingProxy.
   *
   * @param {TransportRegistry} _registry - The registry containing all active transports and their managers.
   */
  constructor(private readonly _registry: TransportRegistry) {}

  /**
   * Adds a new polling task to a specific transport.
   *
   * @param {string} transportId - The unique identifier of the transport.
   * @param {IPollingTaskOptions} options - Configuration for the polling task (interval, function, callbacks).
   * @throws {Error} If the specified transport ID is not found in the registry.
   */
  public addTask(transportId: string, options: IPollingTaskOptions): void {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    info.pollingManager.addTask(options);
  }

  /**
   * Removes a specific polling task from a transport's queue.
   *
   * @param {string} transportId - The unique identifier of the transport.
   * @param {string} taskId - The unique identifier of the task to remove.
   */
  public removeTask(transportId: string, taskId: string): void {
    const info = this._registry.get(transportId);
    if (!info) return;
    info.pollingManager.removeTask(taskId);
  }

  /**
   * Updates the configuration of an existing polling task.
   *
   * @param {string} transportId - The unique identifier of the transport.
   * @param {string} taskId - The ID of the task to update.
   * @param {IPollingTaskOptions} options - The new configuration options.
   */
  public updateTask(transportId: string, taskId: string, options: IPollingTaskOptions): void {
    const info = this._registry.get(transportId);
    if (!info) return;
    info.pollingManager.updateTask(taskId, options);
  }

  /**
   * Controls the execution state of a specific polling task.
   *
   * @param {string} transportId - The unique identifier of the transport.
   * @param {string} taskId - The ID of the task to control.
   * @param {'start' | 'stop' | 'pause' | 'resume'} action - The state transition to perform.
   */
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

  /**
   * Performs a bulk state control action on all tasks within a specific transport.
   *
   * @param {string} transportId - The unique identifier of the transport.
   * @param {'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'} action - The action to apply to all tasks.
   */
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

  /**
   * Retrieves information about the polling queue for a specific transport.
   *
   * @param {string} transportId - The unique identifier of the transport.
   * @returns {IPollingQueueInfo} Metadata about queue length and current task states.
   * @throws {Error} If the specified transport ID is not found.
   */
  public getQueueInfo(transportId: string): IPollingQueueInfo {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info.pollingManager.getQueueInfo();
  }

  /**
   * Executes an asynchronous function immediately, bypassing the standard polling interval
   * but still respecting the transport's internal queue lock/concurrency.
   *
   * @template T
   * @param {string} transportId - The unique identifier of the transport.
   * @param {() => Promise<T>} fn - The asynchronous function to execute (e.g., a manual Modbus request).
   * @returns {Promise<T>} The result of the executed function.
   * @throws {Error} If the transport is not found.
   */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    const info = this._registry.get(transportId);
    if (!info) throw new Error(`Transport "${transportId}" not found`);
    return info.pollingManager.executeImmediate(fn);
  }

  /**
   * Pauses all polling tasks for a specific transport.
   * Useful during temporary device maintenance or connection reconfigurations.
   *
   * @param {string} transportId - The unique identifier of the transport.
   */
  public pauseAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (info) info.pollingManager.pauseAllTasks();
  }

  /**
   * Resumes all previously paused polling tasks for a specific transport.
   *
   * @param {string} transportId - The unique identifier of the transport.
   */
  public resumeAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (info) info.pollingManager.resumeAllTasks();
  }

  /**
   * Clears the entire polling queue and removes all tasks for a specific transport.
   *
   * @param {string} transportId - The unique identifier of the transport.
   */
  public clearAllForTransport(transportId: string): void {
    const info = this._registry.get(transportId);
    if (info) info.pollingManager.clearAll();
  }
}
