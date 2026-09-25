// modbus/transport/controller/polling/PollingProxy.ts

import type {
  IPollingTaskOptions,
  IPollingQueueInfo,
  TPollingAction,
  TPollingBulkAction,
} from '../../../types/public.js';
import type { TransportRegistry } from '../registry/TransportRegistry.js';

/**
 * PollingProxy acts as a facade to the polling managers of all registered transports.
 * It provides a unified interface for adding, removing, updating, and controlling polling tasks
 * across different transport sessions.
 */
export class PollingProxy {
  /**
   * Constructs a new PollingProxy instance.
   * @param {TransportRegistry} registry - The transport registry that manages all transport sessions.
   */
  constructor(private readonly _registry: TransportRegistry) {}

  /** Adds a new polling task to the specified transport's polling manager.
   * @param {string} transportId - The ID of the transport to which the task should be added.
   * @param {IPollingTaskOptions} options - The options for the polling task.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public addTask(transportId: string, options: IPollingTaskOptions): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    session.pollingManager.addTask(options);
  }

  /** Removes a polling task from the specified transport's polling manager.
   * @param {string} transportId - The ID of the transport from which the task should be removed.
   * @param {string} taskId - The ID of the polling task to remove.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public removeTask(transportId: string, taskId: string): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found for task removal`);
    session.pollingManager.removeTask(taskId);
  }

  /** Updates an existing polling task in the specified transport's polling manager.
   * @param {string} transportId - The ID of the transport containing the task to update.
   * @param {string} taskId - The ID of the polling task to update.
   * @param {IPollingTaskOptions} options - The new options for the polling task.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public async updateTask(
    transportId: string,
    taskId: string,
    options: IPollingTaskOptions
  ): Promise<void> {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found for task update`);
    await session.pollingManager.updateTask(taskId, options);
  }

  /** Controls a specific polling task (start, stop, pause, resume) in the specified transport's polling manager.
   * @param {string} transportId - The ID of the transport containing the task to control.
   * @param {string} taskId - The ID of the polling task to control.
   * @param {TPollingAction} action - The action to perform on the task (start, stop, pause, resume).
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public controlTask(transportId: string, taskId: string, action: TPollingAction): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found for task control`);

    switch (action) {
      case 'start':
        session.pollingManager.startTask(taskId);
        break;
      case 'stop':
        session.pollingManager.stopTask(taskId);
        break;
      case 'pause':
        session.pollingManager.pauseTask(taskId);
        break;
      case 'resume':
        session.pollingManager.resumeTask(taskId);
        break;
    }
  }

  /** Controls all polling tasks (startAll, stopAll, pauseAll, resumeAll) in the specified transport's polling manager.
   * @param {string} transportId - The ID of the transport whose tasks should be controlled.
   * @param {TPollingBulkAction} action - The bulk action to perform on all tasks (startAll, stopAll, pauseAll, resumeAll).
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public controlAll(transportId: string, action: TPollingBulkAction): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found for bulk control`);

    switch (action) {
      case 'startAll':
        session.pollingManager.startAllTasks();
        break;
      case 'stopAll':
        session.pollingManager.stopAllTasks();
        break;
      case 'pauseAll':
        session.pollingManager.pauseAllTasks();
        break;
      case 'resumeAll':
        session.pollingManager.resumeAllTasks();
        break;
    }
  }

  /** Retrieves information about the polling queue for the specified transport.
   * @param {string} transportId - The ID of the transport whose polling queue info should be retrieved.
   * @returns {IPollingQueueInfo} An object containing information about the polling queue.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public getQueueInfo(transportId: string): IPollingQueueInfo {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    return session.pollingManager.getQueueInfo();
  }

  /** Executes a function immediately in the context of the specified transport's polling manager.
   * @param {string} transportId - The ID of the transport in which to execute the function.
   * @param {() => Promise<T>} fn - The function to execute immediately.
   * @returns {Promise<T>} A promise that resolves with the result of the executed function.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public async executeImmediate<T>(transportId: string, fn: () => Promise<T>): Promise<T> {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    return session.pollingManager.executeImmediate(fn);
  }

  /** Pauses all polling tasks for the specified transport.
   * @param {string} transportId - The ID of the transport whose tasks should be paused.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public pauseAllForTransport(transportId: string): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    session.pollingManager.pauseAllTasks();
  }

  /** Resumes all polling tasks for the specified transport.
   * @param {string} transportId - The ID of the transport whose tasks should be resumed.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public resumeAllForTransport(transportId: string): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    session.pollingManager.resumeAllTasks();
  }

  /** Clears all polling tasks for the specified transport.
   * @param {string} transportId - The ID of the transport whose tasks should be cleared.
   * @throws {Error} If the specified transport is not found in the registry.
   */
  public clearAllForTransport(transportId: string): void {
    const session = this._registry.get(transportId);
    if (!session) throw new Error(`Transport "${transportId}" not found`);
    session.pollingManager.clearAll();
  }
}
