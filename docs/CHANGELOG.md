# CHANGELOG

### 5.0.2 (2026-09-26)

**Logging rework — consistent metadata prefixes, no object payloads, no response data**

- **`formatMetaTags()` (new)** — `modbus/utils/logger.ts` builds a compact bracketed prefix for a log message.
  `[transportId]` and `[framing]` render as bare tags, then `[ID:<slaveId>]`, `[FC:<funcCode>]` and
  `[ATT:<attempt>]`. Only the tags actually known at the call site are emitted, in that fixed order, so the same
  helper serves the controller (`[TEST_RTU][rtu][ID:5]`), the client (`[ID:5][FC:3][ATT:1]`) and the port level
  (`[TEST_RTU]`).
- **TransportController — every log line is now a tagged string** — e.g.
  `[TEST_RTU][rtu][ID:5] Client 'client-1' created`. The 10 object payloads were folded into the message
  (`clientId` in single quotes, `err` inline, task ids joined); `disconnectTransport()` now binds its `catch`,
  which previously discarded the error text. `assignSlaveIdToTransport()` and
  `removeSlaveIdFromTransport()` gained the same `[transportId][framing][ID:<slaveId>]` prefix the other
  client-facing methods already had.
- **ModbusClient** — `Attempt failed` and `Identification read failed, retrying` are prefixed
  `[ID:5][FC:3][ATT:1]`, with the error message inlined where the `err` object used to be.
- **No object payloads in any WARN log** — all 26 `logger.warn()` calls pass a single string. The port queue
  (`[PortQueue] overflow: 1/1 jobs queued`), the scanner, the polling manager and the two duplicate-slave
  warnings inline their fields instead of dumping an object.
- **No response data in the response log** — the line is now `[ID:92][FC:3] Response received +12ms`; the
  serialized response payload is no longer interpolated into it.
- **Fixed: WebSerial transport logged at `debug` by default** — `modbus/transport/web/serial.ts` hard-coded
  `level: 'debug'`, so a browser transport printed debug lines that the Node transports never printed, including
  the `file:line` noise the formatter only emits at DEBUG and below. It now takes the same default as every other
  component (`info`).
- **Documentation** — the log samples in `README.md`, `docs/Emulators.md`, `docs/ModbusClient.md`,
  `docs/PollingManager.md` and `docs/TransportController.md` were corrected against actual output: the real
  logger names (`manager` and `manager:Task`, not `[Polling Manager]` / `[Task][taskId:...]`), the real line
  prefix (an ISO timestamp, then `LEVEL name`, with no colon after the level), the response format above and
  the controller's new tags. Also removed from the samples: a `[Node RTU] Serial port ... opened` line shown
  at `INFO` (it is `debug`, so it is not visible at the default level), and a documented
  `[DeviceConnectionTracker] Device 1: OFFLINE (Timeout)` warning — the tracker emits no such line; a device
  going offline surfaces as the client's `Attempt failed` warning.

### 5.0.1 (2026-09-25)

**Dynamic response length resolution & framing optimizations**

- **Dynamic response length resolution for custom plugins** — custom function handlers (`ICustomFunctionHandler`) can now implement an optional `getExpectedResponseLength(partialResponsePdu, requestPdu): number | null` resolver. For custom functions with dynamic or variable response lengths (such as file reads, archive chunk streaming, or vendor-specific telemetry), the protocol framer calculates the exact expected frame size from the incoming header and reads the full packet in one shot, eliminating 4+ second timeouts and byte-by-byte serial reads.
- **Built-in dynamic length heuristics** — `ModbusProtocol.exchange()` now dynamically computes expected response lengths on the fly for standard variable-length responses (FC 0x01–0x04 and FC 0x11 Report Slave ID via byte count) as well as 16-bit big-endian payload frames (e.g. FC 0x5A).
- **Optimized RTU frame noise recovery** — `_tryRecoverRtuFrame` now scans only candidate frame boundaries matching the target `unitId`, preventing $O(N^3)$ CPU starvation and false-positive CRC matches on noisy serial lines.
- **Enhanced `client.rawExchange()`** — accepts an optional `expectedLengthResolver?: (partialResponsePdu: Uint8Array, requestPdu: Uint8Array) => number | null` parameter.
- **Colorized response timing logs** — client execution logs now display colorized `+<N>ms` elapsed durations for responses and exceptions.

### 5.0.0 (2026-09-25)

**Port queue / port session refactoring** — a port is now a single serialization point for every wire-level operation.

- **`PortQueue` + `PortSession` (new)** — each port owns one queue (mutex + FIFO/priority ordering,
  `maxLength` backpressure, pause/resume, scan pause, optional per-job timeout, reentrancy guard) and one
  `PollingManager`. Sessions are exposed through `controller.getSession(id)`.
- **Clients are managed by the controller** — `createClient()` / `getClient()` / `listClients()` /
  `removeClient()`; framing is derived from the port RS mode (`rsModeToFraming`), and the port slave inventory
  is filled/cleared automatically. The `slaveIds` transport option was removed.
- **Exactly one exchange at a time** — client requests, polling tasks and `writeToPort()` all go through the
  port queue (`immediate` + high priority for manual requests); the client no longer owns a mutex.
- **Polling manager is a scheduler** — `concurrency: 'strict' | 'per-slave'` in `IPollingManagerConfig`
  (`strict` by default): the scheduler no longer holds a task's retry budget, so one silent device cannot
  starve the rest of the bus. `executeImmediate*` are submitted to the port queue.
- **Scanning hands the port over cleanly** — `pauseForScan()` stops polling, drains in-flight work and freezes
  the queue; new exchanges fail fast with `ModbusScanActiveError` (drain failure -> `ModbusBusyError`).
- **Per-client device tracker** — `client.setDeviceStateHandler()`; the port tracker now lives in the session.
- **Fixed: short exception responses** — a slave answering with an exception (5-byte RTU frame) used to be
  awaited as a full success frame, which produced a bogus "no data received" timeout instead of the real error.
  The expected frame length is now shortened as soon as the error bit appears in the function code.
- **Fixed: transport option whitelist** — `TransportFactory` silently dropped options missing from its
  whitelist; new options (`interFrameDelayMs`, `exclusiveLock`) are passed through.
- **Exclusive port lock + honest open errors** — the library refuses to share a serial port with another
  process (pid lock file); busy/permission/missing failures are reported to the caller instead of an endless
  silent reconnect reporting `connected`.
- **Lifecycle** — `reloadTransport()` pauses the port while swapping the transport (clients survive);
  `removeTransport()` / `destroy()` remove the affected clients; a removed client never points at a dead port.
- **Types / exports** — `IPortSession`, `IPortQueue`, `IPortQueueOptions`, `IClientInfo`, `ICreateClientOptions`,
  `IClientContext`, `TPollingEnqueueFn`; a `modbus-connect/session` export subpath; new errors
  (`ModbusQueueOverflowError`, `ModbusReentrancyError`, `ModbusScanActiveError`, `ModbusBusyError`,
  `ClientAlreadyExistsError`, `ClientNotFoundError`).
- **Retry semantics now match this documentation** — a device exception response is no longer retried,
  even with `retryCount > 0`: it is a logical device error, not a line failure. The client used to retry
  such requests; the code now matches the **Retry Logic** section below exactly.
- **Retry logic lives in a single module** — `modbus/utils/retry.ts` (`runWithRetries`,
  `interruptibleSleep`, `defaultRetryDelay`). The retry loop used to exist twice (`ModbusClient._sendRequest`
  and `TaskController` with backoff jitter); both now share one policy, including interruptible sleep and
  clean `stop()` / `pause()` behaviour during a backoff delay.
- **Answer identity check** — a response is accepted only when its slave address matches the device the
  client talks to; a late or foreign frame is dropped (debug `Foreign frame ignored`) instead of being
  returned as this client's data.
- **`client.rawExchange(pdu, timeout?)`** — sends an arbitrary PDU (vendor function codes, diagnostics)
  through the same queue / tracker / retry path and returns the raw response PDU.
- **Client-owned polling tasks** — `IPollingTaskOptions.clientId`; `removeClient()` stops and removes the
  tasks of that client, so a removed device leaves no orphan polling tasks.
- **`controller.reassignClient()`** — `client.setSlaveId()` on a managed client now re-binds the port
  slave inventory and the roster instead of only changing the address inside the client.
- **Tighter local validation** — coil write values must be `boolean` or `0`/`1`, and spec limits
  (125 registers, 2000 bits, 123 registers / 1968 bits per write, non-zero quantity) are checked before
  anything reaches the wire.
- **One device — one client** — `createClient()` and `reassignClient()` reject a second client for the
  same port + slave id with `DuplicateSlaveIdError` (two masters for one device double the traffic and
  make its connection state ambiguous); `allowDuplicateSlaveId: true` allows it with a warning.
- **Immediate teardown** — `disconnectTransport()` / `destroy()` / `removeClient()` no longer wait for
  polling tasks or the queue: `PortQueue.abort()` (permanent) and `dropPending()` (one-shot) reject queued
  and in-flight callers at once, and a disconnect _pauses_ the tasks so the next `connectTransport()`
  resumes them (they used to stay dead). Rejections from the queue are guarded against becoming unhandled
  (fatal in modern Node).
- **Fixed: unhandled rejection on disconnect** — the serial transports left the connector's internal
  promise unhandled when `disconnect()` / max-reconnect rejected it, which could crash a process (`Node`
  treats unhandled rejections as fatal). It is now guarded and the callback is cleared after use.
- **Queue backpressure instead of instant rejection** — when the pending list is full the caller now waits
  for a free slot (`IPortQueueOptions.overflowPolicy: 'wait'`, the new default) bounded by
  `overflowWaitMs`; `'reject'` keeps the fail-fast behaviour. `cancelWaiters()` releases everyone who is
  waiting when a scan takes the port over or the session is destroyed, and the client no longer retries
  `ModbusQueueOverflowError` (a full queue is not a line failure) nor flips the device state on it.
- **`totalTimeout` — budget of a whole call** — `timeout` stays the per-attempt budget (measured from the
  moment the frame goes on the wire); the new `totalTimeout` bounds the call together with retries and
  retry delays and rejects with `ModbusOperationTimeoutError` once it runs out. Attempts and delays are
  clipped to the remaining budget. `0` (default) keeps the previous behaviour.
- **Typed parsing errors** — the response parsers in `modbus/protocol/functions.ts` no longer throw a bare
  `Error`: a too-short PDU raises `ModbusInsufficientDataError`, a foreign function code raises
  `ModbusUnexpectedFunctionCodeError`, so callers can branch on the class instead of on message text.
- **One source of truth for expected response lengths** — a shared `expectedResponsePduLength()` replaces
  the duplicated `switch` in `RtuFramer` / `TcpFramer`, so a fix (for example, handling short exception
  responses) can no longer be applied to only one framer.

### 4.7.0 (2026-09-18)

- **Modbus Emulators (RTU & TCP) — Read Device Identification (`FC 0x2B` / MEI `0x0E`)**:
  - Added support for the standard `0x2B`/`0x0E` function to `ModbusSlaveCore`, so `rtu-emulator` and `tcp-emulator` now answer identification requests like a real device.
  - Identification data is filled manually via the new `deviceIdentification?: Record<number, string>` option on `IRtuEmulatorTransportOptions` / `ITcpEmulatorTransportOptions`, passed through `addTransport(...)`. No additional code is required — you only set the transport type and `client.readDeviceIdentification()` works as usual.
  - The emulator responds to all read categories: Basic (`0x01`), Regular (`0x02`), Extended (`0x03`) and Individual (`0x04`), with conformity level `0x83` (Extended + stream access).
  - If `deviceIdentification` is not set, the slave responds with exception `0x03` (Illegal Data Value).

### 4.6.0 (2026-08-17)

- **ModbusClient — RS-485 Echo Support**:
  - Added `echo` option to `IModbusClientOptions`. When set to `true`, the protocol layer reads and discards the echo bytes returned by the RS-485 bus after each write, before waiting for the actual device response. Default: `false` (no echo handling).
  - Echo handling is implemented in `ModbusProtocol.exchange()` at the protocol layer.
  - Zero overhead when disabled — a single boolean check per exchange.
  - Renamed from the `echoEnabled` to `echo`.

### 4.5.0 (2026-07-21)

- **Scanner — `onRegisterRead` callback**:
  - Added new `onRegisterRead(slaveId, registerAddress, value)` callback to `IScanOptions`. Fires on every successful register read during RTU and TCP scanning, returning the raw 16-bit value from the device response. Timeouts, CRC errors, and exception responses do not trigger this callback.
  - Internally captures the return value of `protocol.exchange()` and parses it with `parseReadHoldingRegistersResponse` to extract the register value before passing it to the callback.

### 4.4.2 (2026-07-07)

- **Scanner — Multi-Parity Deduplication Fix**:
  - Fixed `_addRtu` using a `Set<number>` keyed only by `slaveId`, causing devices found with different parity settings (e.g. `none` then `even`) to be silently dropped. The Set now uses a composite key `"<slaveId>:<parity>:<stopBits>"` (or `"<slaveId>:<baud>:<parity>:<stopBits>"` when `multiBaud: true`), so devices are correctly reported for every unique combination of parameters that yields a response.

### 4.4.0 (2026-04-24)

- **PollingManager — Critical Bug Fixes**:
  - **`restartTask` / `restartAllTasks` synchronous restart** — Removed unnecessary `setTimeout(() => task.start(), 0)` wrapper. Tasks now restart synchronously via `stop()` then `start()`, eliminating a race window where the task could be removed between stop and deferred start
  - **`_withTimeout` now uses `AbortController`** — The original implementation only rejected the outer promise on timeout but left the underlying operation running (e.g., a Modbus write). Now uses `AbortController` to signal cancellation, giving the operation a chance to abort cleanly. Critical for Modbus where an uncancelled write can corrupt the next frame
  - **`overallSuccess` logic fixed** — Changed `overallSuccess = overallSuccess || fnSuccess` to `&&`. Previously `onSuccess` was called even when some functions in the `fn` array failed. Now `onSuccess` only fires when **all** functions succeed
  - **`onError`/`onFailure` callback order** — `onError` is now called **before** `onFailure` when max retries are exceeded, matching the expected lifecycle: error notification first, then final failure signal
  - **`PollingProxy` throws on missing transport** — Methods `removeTask`, `updateTask`, `controlTask`, `controlAll` previously returned silently when the transport ID was not found. Now they throw an `Error`, consistent with `addTask` and `getQueueInfo`

- **PollingManager — Risk Mitigations**:
  - **Per-slave mutex for concurrent execution** — Replaced the single global `Mutex` with a `Map<slaveId, Mutex>`. Tasks targeting different slave IDs on the same transport now execute concurrently instead of being serialized. Added `executeImmediateForSlave(slaveId, fn)` for per-slave immediate commands
  - **`isEnqueued` reset on pause/stop** — When a task is paused or stopped, `isEnqueued` is now reset to `false` and the task is removed from the execution queue. Previously, `resume()` would skip rescheduling because `isEnqueued` was still `true`, leaving the task permanently idle
  - **Removed unsafe `as Required<>` cast** — Replaced the `as Required<IPollingManagerConfig>` type assertion with an explicit `ResolvedPollingManagerConfig` interface. Also removed the `[key: string]: unknown` index signature from `IPollingManagerConfig` which allowed arbitrary keys to pass through without validation
  - **`clearAll()` no longer sets `paused=true`** — After calling `clearAll()`, the manager stayed in `paused` state permanently, causing any subsequently added tasks to never execute. Now `clearAll()` only stops tasks and clears the queue — the manager is immediately ready for new tasks
  - **`_processQueue` race condition fixed** — Replaced `setTimeout(() => this._processQueue(), 0)` in the `finally` block with a direct recursive call. The `isProcessing` guard prevents duplicate processing loops, and the direct call eliminates the window where concurrent `enqueueTask` calls could start a second loop
  - **`updateTask` awaits current execution** — `updateTask` now pauses the old task, waits for any in-progress execution to complete via `waitForCompletion()`, then removes and recreates it. Previously it destroyed the task mid-execution, potentially leaving the Modbus bus in an inconsistent state
  - **Interruptible sleep in retry loop** — Replaced `_sleep(ms)` (which blocked for the full duration even when stopped) with `_interruptibleSleep(ms, signal)` that checks `stopped`/`paused` flags every 100ms and listens to `AbortSignal`. Now `stop()` and `pause()` take effect within 100ms even during long backoff delays

- **PollingManager — Improvements**:
  - **`TaskController` extracted to separate module** — Moved from `modbus/polling/manager.ts` to `modbus/polling/task-controller.ts`. Reduces `manager.ts` from ~885 lines to ~280 lines. `TaskController` is now independently testable and uses callback injection (`enqueueFn`/`dequeueFn`) instead of a direct manager reference
  - **`EPollingAction` / `EPollingBulkAction` enums** — Replaced string union types (`'start' | 'stop' | 'pause' | 'resume'`) with typed enums in `controlTask` and `controlPolling`. Prevents typos and enables IDE autocomplete. Available as `EPollingAction` and `EPollingBulkAction` from the public types module

- **TransportController — Cleanup & Disconnect Bug Fixes**:
  - **`removeTransport()` threw exception during cleanup** — Method removed transport from registry first, then tried to clear polling via `PollingProxy` which couldn't find the transport. Now follows the same safe order as `_removeTransportInternal`: clears handlers, stops polling directly on `info.pollingManager`, disconnects, clears assignments, then removes from registry last
  - **Async gap in `_onPortStateChange` left tasks running** — `pauseAllForTransport` was called after `await StateManager.notifyPortDisconnected`, creating a window where polling tasks continued executing after port disconnect. Now pause is called synchronously before the async notification
  - **`destroy()` didn't clear registry** — After shutdown, transports remained in `TransportRegistry` as ghost entries. Added `TransportRegistry.clearAll()` method and call at the end of `destroy()`
  - **`disconnectTransport` only paused tasks (zombie tasks)** — Manual disconnect used `pauseAllForTransport`, leaving tasks alive indefinitely if device never reconnects. Added `PollingProxy.stopAllForTransport()` and switched `disconnectTransport` to use stop instead of pause

- **TaskController — Timer Leak Fixes**:
  - **`_interruptibleSleep` leaked `checkInterval`** — After main `setTimeout` fired naturally, the `setInterval` checker was never cleared due to `resolve` reassignment not affecting the captured reference. Rewritten with `settled` flag and `cleanup()` helper ensuring all timers are always released
  - **`waitForCompletion` leaked `setTimeout`** — When the `setInterval` check resolved first, the fallback `setTimeout` kept running. Added `settled` flag to guarantee exactly one resolution and cleanup of both timers

- **Transport — State & Error Handling Fixes**:
  - **`NodeSerialTransport._onClose` didn't clear `_connectedSlaveIds`** — After port close, stale slave IDs persisted, causing `notifyDeviceConnected` to skip re-notification on reconnect (unlike TCP which correctly cleared). Added `this._connectedSlaveIds.clear()`
  - **`AbortSignal` not passed to polling `fn()`** — TaskController called `fnToExecute()` without the abort signal, making Modbus operations non-interruptible on stop/pause. Now calls `fnToExecute(signal)` so the underlying operation can respond to cancellation
  - **Errors silently swallowed in disconnect notifications** — `_notifyPortDisconnected` and `_releaseAllResources` used `.catch(() => {})`. Now logs errors via `this.logger.error()` for visibility during debugging
