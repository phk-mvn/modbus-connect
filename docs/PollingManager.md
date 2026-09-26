[← Back to README](../README.md)

# PollingManager

> `PollingManager` is a scheduler that automates polling of Modbus devices. It manages queues based on
> priorities, handles communication errors through a delay system, and ensures that background tasks do
> not conflict with manual commands.

---

## 📚 Table of Contents

- [Configuration (IPollingManagerConfig)](#configuration-ipollingmanagerconfig)
- [Task registration (addTask)](#task-registration-addtask)
- [Method Reference](#method-reference)
- [Bulk Management (Bulk Methods)](#bulk-management-bulk-methods)
- [Important technical details](#important-technical-details)

---

## Configuration (`IPollingManagerConfig`)

These parameters are set when creating the manager and are applied to all tasks by default.

| Parameter             | Type                      | Description                                                                                                                                                                                                                                          |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultMaxRetries`   | `number`                  | Number of attempts in case of failure (default: 3).                                                                                                                                                                                                  |
| `defaultBackoffDelay` | `number`                  | Base delay between attempts in ms (default: 1000).                                                                                                                                                                                                   |
| `defaultTaskTimeout`  | `number`                  | The timeout of one operation in ms (default: 5000).                                                                                                                                                                                                  |
| `interTaskDelay`      | `number`                  | Pause between different tasks in the queue in ms (default: 0).                                                                                                                                                                                       |
| `logLevel`            | `TManagerLogLevel`        | Logging level for the manager and all its tasks: `'silent' \| 'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` (default: `info`).                                                                                                       |
| `logger`              | `Logger<ILogObj>`         | Optional custom tslog logger used as the parent for manager and task logs.                                                                                                                                                                           |
| `concurrency`         | `'strict' \| 'per-slave'` | Task concurrency model (default: `strict`). `strict` — the scheduler runs one task at a time and holds no mutex, exchanges are serialized by the port queue. `per-slave` — legacy per-slave mutexes, allowing concurrent tasks for different slaves. |

> The manager is bound to its port queue by `PortSession` (`setEnqueueFn`), so `executeImmediate()` and
> `executeImmediateForSlave()` are submitted to that queue instead of taking a private mutex.
> `getQueueInfo()` and `getSystemStats()` additionally report `portQueueLength` and `clientsCount`.

---

## Task registration (`addTask`)

The `addTask` method accepts an `IPollingTaskOptions` object. All possible parameters are shown here.

```js
manager.addTask({
  // Basic settings
  id: 'main-sensor-poll',
  name: 'Temperature sensor query',
  clientId: 'flow-meter', // Task owner: removeClient() stops and removes it automatically
  priority: 10, // High priority (0 - low)
  interval: 2000, // Every 2 seconds
  fn: [
    // Array of functions (executed in turn)
    async () => await client.readHoldingRegisters(0, 2),
    async () => await client.readHoldingRegisters(10, 1),
  ],
  immediate: true, // Start immediately when adding
  shouldRun: () => true, // Check before each cycle (should I run?)

  // Redefining the retry settings for this specific task
  maxRetries: 2,
  backoffDelay: 500,
  taskTimeout: 3000,

  // Life Cycle Callbacks
  onStart: () => console.log('>>> Task started'),
  onStop: () => console.log('>>> Task stopped'),
  onBeforeEach: () => console.log('>>> Preparing for request...'),
  onData: data => console.log('>>> Raw data received:', data),
  onSuccess: results => console.log('>>> Cycle completed successfully:', results),
  onFailure: err => console.error('>>> Critical issue failure:', err.message),
  onRetry: (err, idx, count) => console.warn(`>>> Retry function ${idx}, attempt ${count}`),
  onError: (err, idx, count) => console.error(`>>> Function ${idx} failed after ${count} attempts`),
  onFinish: (success, results) => console.log('>>> Iteration completed. Success:', success),
});
```

> `clientId` (optional) marks the task as owned by a client. Owned tasks are stopped and removed
> together with that client (`removeClient()`), so a removed device leaves no orphan polling behind;
> tasks without `clientId` are never touched.

> `immediate` (optional) controls auto-start. Default behaviour: a task **starts automatically**
> on `addTask`; pass `immediate: false` to register it in a stopped state and start it later
> via `startTask()`/`restartTask()`.

**Expected result**:

```bash
2026-09-25 10:00:00.417 DEBUG manager:Task {
  id: 'main-sensor-poll',
  priority: 10,
  interval: 1000,
  maxRetries: 3,
  backoffDelay: 1000,
  taskTimeout: 5000
} TaskController created
2026-09-25 10:00:00.418 INFO manager Task added -> main-sensor-poll
2026-09-25 10:00:00.418 DEBUG manager:Task Task started
>>> Task started
>>> Preparing for request...
2026-09-25 10:00:01.221 INFO ModbusClient [ID:1][FC:3] Response received +50ms
2026-09-25 10:00:01.246 INFO ModbusClient [ID:1][FC:3] Response received +25ms
>>> Raw data received: [[123, 456], [1]]
>>> Cycle completed successfully: [[123, 456], [1]]
>>> Iteration completed. Success: true
```

> `fn` is an array of two reads, so two `Response received` lines appear per cycle. Both `onData` and
> `onSuccess` receive the full `results` array — one entry per `fn` (that is why both print the same).

---

## Method Reference

### `updateTask(id, newOptions)`

Updates any task option and restarts it. Now **async** — waits for any in-progress execution to complete before replacing the task.

```js
await manager.updateTask('main-sensor-poll', {
  interval: 5000,
  priority: 100,
  maxRetries: 5,
});
```

**Expected result**:

```bash
2026-09-25 10:05:00.612 INFO manager:Task Task stopped
2026-09-25 10:05:00.613 INFO manager {
  id: 'main-sensor-poll'
} Task removed
2026-09-25 10:05:00.614 INFO manager Task added -> main-sensor-poll
2026-09-25 10:05:00.615 DEBUG manager:Task Task started
```

> Because the task was running, `updateTask` restarts it after the update (`Task stopped` →
> `Task removed` → `Task added` → `Task started`).

---

### `removeTask(id)`

Complete removal of the task from the system.

```js
manager.removeTask('main-sensor-poll');
```

**Expected result**:

```bash
2026-09-25 10:10:00.710 INFO manager:Task Task stopped
2026-09-25 10:10:00.711 INFO manager {
  id: 'main-sensor-poll'
} Task removed
```

---

### `pauseTask(id) / resumeTask(id)`

Temporary stop of execution. The task remains in memory.

```js
manager.pauseTask('main-sensor-poll');
manager.resumeTask('main-sensor-poll');
```

**Expected result**:

```bash
2026-09-25 10:15:00.308 INFO manager:Task Task paused
2026-09-25 10:15:05.121 INFO manager:Task Task resumed
```

---

### `restartTask(id)`

Instant restart of task timers.

```js
manager.restartTask('main-sensor-poll');
```

**Expected result**:

```bash
2026-09-25 10:20:00.422 INFO manager:Task Task stopped
2026-09-25 10:20:00.424 DEBUG manager:Task Task started
```

---

### `setTaskInterval(id, interval)`

Changing the polling frequency without restarting the entire task.

```js
manager.setTaskInterval('main-sensor-poll', 1000);
```

**Expected result**:

```bash
2026-09-25 10:25:00.517 INFO manager:Task Interval updated
```

---

### `executeImmediate(fn)`

Executes asynchronous code (for example, writing) as an immediate job in the port queue: it jumps ahead of pending polling jobs while always waiting for the currently running exchange to finish.

```js
const result = await manager.executeImmediate(async () => {
  return await client.writeSingleRegister(100, 255);
});
```

**Expected result**:

```bash
2026-09-25 10:30:00.611 INFO ModbusClient [ID:1][FC:6] Response received +40ms
```

---

### `getQueueInfo()`

Returns information about the current queue for execution.

```js
const info = manager.getQueueInfo();
console.log(info);
```

**Expected result**:

```bash
{
    queueLength: 1,
    tasks: [
        {
            id: 'main-sensor-poll',
            state: {
                stopped: false,
                paused: false,
                running: true,
                inProgress: false
            }
        }
    ],
    portQueueLength: 0,
    clientsCount: 1
}
```

---

### `getSystemStats()`

```js
console.log(manager.getSystemStats());
```

**Expected result**:

```bash
{ totalTasks: 1, totalQueues: 1, queuedTasks: 0, portQueueLength: 0, clientsCount: 1 }
```

---

### `clearAll()`

Full stop and clean up.

```js
manager.clearAll();
```

**Expected result**:

```bash
2026-09-25 10:40:00.702 INFO manager Clearing all tasks
2026-09-25 10:40:00.703 INFO manager:Task Task stopped
2026-09-25 10:40:00.704 INFO manager All tasks cleared
```

---

### `disableAllLoggers()`

```js
manager.disableAllLoggers(); // Sets the level to 'error' (suppresses INFO/DEBUG output)
```

---

## Bulk Management (Bulk Methods)

| Method              | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `startAllTasks()`   | Starts all tasks that were in the stopped state.                              |
| `stopAllTasks()`    | Stops all tasks and clears the queue.                                         |
| `pauseAllTasks()`   | Puts all tasks in paused mode (timers are running, but no requests are made). |
| `resumeAllTasks()`  | Unpauses all tasks and starts the queue processing loop.                      |
| `restartAllTasks()` | Calls stop and start for each task sequentially.                              |

---

## Important technical details

- **Scheduler over the port queue**: `_processQueue` picks the next task and starts it without holding any mutex — the exchanges themselves are serialized by the port queue. That is why a task stuck in retries/backoff no longer blocks other tasks or manual commands.
- **FIFO + Priority**: The queue is sorted by priority. If tasks have the same priority, they are executed in the order they arrive (First-In-First-Out).
- **Zombie Task Protection**: If you call `removeTask` while waiting for a response from the device (e.g., 2 seconds), the manager will intercept the response but will not call the `onData` callback, preventing the processing of stale data.
- **CPU Safety**: Between tasks in the queue, the manager takes a micro-pause via `setTimeout(0)` (or
  the configured `interTaskDelay`) so it yields to the Event Loop and the application can process other
  asynchronous events.
