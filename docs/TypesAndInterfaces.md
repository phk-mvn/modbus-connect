[← Back to README](../README.md)

# Types and Interfaces

> All interactions in the library are **strongly typed**. The interfaces are divided into logical blocks: **Client**, **Transport**, **Polling Manager**, **Port Session / Queue** and **Emulation**.

---

## 📚 Table of Contents

- [Modbus Client API](#modbus-client-api)
  - [`IModbusClient`](#imodbusclient)
  - [`IModbusClientOptions`](#imodbusclientoptions)
- [Transport Layer](#transport-layer)
  - [`ITransportController`](#itransportcontroller)
  - [`ITransport`](#itransport-common-port-interface)
  - [`EConnectionErrorType`](#econnectionerrortype-error-enumeration)
  - [Common type aliases](#common-type-aliases)
  - [`ITransportInfo` and `ITransportStatus`](#itransportinfo-and-itransportstatus)
- [Port Session, Port Queue and Clients](#port-session-port-queue-and-clients)
- [Polling Manager](#polling-manager-polling-automation)
- [Connection Trackers](#connection-trackers-state-tracking)
- [Emulator API](#emulator-api)
- [Type Usage Examples](#type-usage-examples-typescript)

---

## Modbus Client API

### `IModbusClient`

The primary interface for high-level operations.

| Method                                         | Description                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `use(plugin)`                                  | Registers a plugin that extends the client with custom function codes.     |
| `readHoldingRegisters(start, qty)`             | Reads holding registers (FC 0x03). Returns `Promise<RegisterData>`.        |
| `readInputRegisters(start, qty)`               | Reads input registers (FC 0x04). Returns `Promise<RegisterData>`.          |
| `writeSingleRegister(addr, val, timeout?)`     | Write a single register (FC 0x06).                                         |
| `writeMultipleRegisters(addr, vals, timeout?)` | Write a group of registers (FC 0x10).                                      |
| `readCoils(start, qty, timeout?)`              | Reads coils (FC 0x01). Returns `boolean[]`.                                |
| `readDiscreteInputs(start, qty, timeout?)`     | Reads discrete inputs (FC 0x02).                                           |
| `writeSingleCoil(addr, val, timeout?)`         | Writes a single bit (FC 0x05).                                             |
| `writeMultipleCoils(addr, vals, timeout?)`     | Writes a group of bits (FC 0x0F).                                          |
| `reportSlaveId(timeout?)`                      | Reports the device ID (FC 0x11).                                           |
| `readDeviceIdentification(decoder, timeout?)`  | Reads the device ID (FC 0x2B). `decoder`: `'windows-1251'` \| `'utf-8'`.   |
| `executeCustomFunction(name, ...args)`         | Calls a plugin function.                                                   |
| `setSlaveId(newId)`                            | Changes the device address; managed clients go through `reassignClient()`. |
| `rawExchange(pdu, timeout?)`                   | Sends an arbitrary PDU, returns the raw response PDU.                      |
| `connect() / disconnect()`                     | Logical state management. `disconnect()` also unregisters the client.      |
| `currentSlaveId`                               | Current slave address (getter).                                            |
| `clientId`                                     | Roster id assigned by the controller (`undefined` for unmanaged clients).  |
| `setDeviceStateHandler(handler)`               | Registers this client's own device connection tracker callback.            |
| `clearDeviceState()`                           | Clears the client's device state (used by the controller on removal).      |
| `enableLogger() / disableLogger()`             | Logging control.                                                           |

---

### `IModbusClientOptions`

```ts
interface IModbusClientOptions {
  framing?: 'rtu' | 'tcp'; // Packet type
  RSMode?: 'RS485' | 'RS232' | 'TCP/IP'; // Physical mode
  timeout?: number; // Budget of one exchange attempt (ms), measured from the moment it goes on the wire
  totalTimeout?: number; // Total budget of one call (ms), retries and delays included; 0 = off (default)
  retryCount?: number; // Number of retries if communication error occurs
  retryDelay?: number; // Delay between retries (ms)
  echo?: boolean; // Clear echo bytes after write (for RS485 half-duplex)
  logLevel?: 'silent' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'; // Client logger level
  plugins?: TPluginConstructor[]; // List of plugin classes
}
```

---

## Transport Layer

### `ITransportController`

Central manager of all connections.

- `addTransport(id, type, options, reconnect?, polling?, queue?)` — Register a new channel (creates its `PortSession`).
- `createClient(options)` — Create a client bound to a port, register it and auto-assign its slave. **Async**.
- `getClient(clientId)` / `listClients(transportId?)` / `removeClient(clientId)` — Client roster.
- `reassignClient(clientId, newSlaveId, options?)` — Re-route a managed client to another address (keeps roster and port inventory in sync).
- `getSession(id)` — Port session (`transport`, `queue`, `pollingManager`, `portTracker`, `clients`).
- `getTransport(id)` — **Deprecated** — use `getSession(id).transport`.
- `listTransports()` — List of all registered ports as `ITransportInfo[]`.
- `reloadTransport(id, options)` — Hot-swapping port settings. Old trackers are properly cleaned up before recreation.
- `removeTransport(id)` — Complete removal.
- `getTransportForSlave(slaveId, requiredRSMode)` / `getSessionForSlave(slaveId, requiredRSMode)` — Search for a transport (or its session) by route.
- `assignSlaveIdToTransport(transportId, slaveId)` — Bind a device to a port. **Async** — always `await`.
- `removeSlaveIdFromTransport(transportId, slaveId)` — Unlink a device. **Async** — always `await`. Targets the specific transport tracker only. An empty port is auto-removed.
- `connectAll() / disconnectAll()` and `connectTransport(id) / disconnectTransport(id)` — Connection lifecycle.
- `getStatus(id?)` — Status for one port or all ports (`ITransportStatus` / a map of them).
- `getActiveTransportCount()` — Number of ports currently `'connected'`.
- `setDeviceStateHandler(handler)` / `setPortStateHandler(handler)` — Global state handlers (plus `...ForTransport(id, handler)` variants).
- `destroy()` — Shut down the controller and drop all sessions.

---

### `ITransport` (Common Port Interface)

Any transport (Serial, TCP, WebSerial) must implement these:

- `readonly isOpen: boolean` — Physical port open state.
- `connect()` / `disconnect()` — Open / close the physical port. **Async**.
- `write(buffer)` — Send bytes.
- `read(length, timeout)` — Read bytes.
- `flush()` — Clear the buffer.
- `getRSMode()` — Returns the current operating mode.
- `setDeviceStateHandler(handler)` / `setPortStateHandler(handler)` — Wire state trackers into the transport.
- `enableDeviceTracking(handler?)` / `disableDeviceTracking()` — Per-slave connection tracking for transports that have it.
- `notifyDeviceConnected?(slaveId)` / `notifyDeviceDisconnected?(slaveId, errorType, errorMessage?)` — Optional internal device notifications.
- `setSniffer(sniffer)` — Attach a traffic sniffer.

> **Note:** `EConnectionErrorType` and the handler signatures (`TDeviceStateHandler`, `TPortStateHandler`) are shared by all state-tracker APIs — see [Connection Trackers](#connection-trackers-state-tracking).

---

### `EConnectionErrorType` (Error Enumeration)

Used in trackers to classify problems:

| Member             | Value                 | Description                                   |
| ------------------ | --------------------- | --------------------------------------------- |
| `UnknownError`     | `'Unknown Error'`     | Unspecified error.                            |
| `PortClosed`       | `'Port closed'`       | The physical port is closed.                  |
| `Timeout`          | `'Timeout'`           | The device did not respond.                   |
| `CRCError`         | `'CRC Error'`         | Checksum error.                               |
| `ConnectionLost`   | `'Connection Lost'`   | Connection lost.                              |
| `DeviceOffline`    | `'Device Offline'`    | The device went offline.                      |
| `MaxReconnect`     | `'Max reconnect'`     | The recovery attempt limit has been exceeded. |
| `ManualDisconnect` | `'Manual disconnect'` | Disconnected by user request.                 |
| `Destroyed`        | `'Destroyed'`         | Transport was destroyed.                      |

### Common type aliases

```ts
type TTransportType = 'node-rtu' | 'node-tcp' | 'web-rtu' | 'rtu-emulator' | 'tcp-emulator';
type TRSMode = 'RS485' | 'RS232' | 'TCP/IP';
type TParityType = 'none' | 'even' | 'mark' | 'odd' | 'space';
type TModbusProtocolType = 'rtu' | 'tcp';
type TPluginConstructor = new (...args: any[]) => IModbusPlugin;
```

### `ITransportInfo` and `ITransportStatus`

```ts
interface ITransportInfo {
  id: string;
  type: TTransportType;
  transport: ITransport;
  pollingManager: PollingManager;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  slaveIds: number[];
  rsMode: TRSMode;
  fallbacks: string[];
  createdAt: Date;
  lastError?: Error;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectInterval: number;
}
```

> `listTransports()` returns `ITransportInfo[]`.

```ts
interface ITransportStatus {
  id: string;
  connected: boolean;
  lastError?: Error;
  connectedSlaveIds: number[];
  uptime: number;
  reconnectAttempts: number;
  pollingStats?: {
    queueLength: number;
    tasksRunning: number;
    clientsCount?: number; // clients registered on the owning port session
  };
}
```

> `getStatus(id)` returns a single `ITransportStatus`; `getStatus()` returns a `Record<id, ITransportStatus>` for all ports.

---

## Port Session, Port Queue and Clients

```ts
interface IPortSession {
  readonly id: string;
  readonly transport: ITransport;
  readonly queue: IPortQueue;
  readonly pollingManager: PollingManager;
  readonly portTracker: PortConnectionTracker;
  readonly clients: ReadonlyMap<string, ModbusClient>;
  readonly info: IPortSessionInfo;
  execute<T>(fn, opts?): Promise<T>;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  isIdle(): boolean;
  pauseForScan(timeoutMs?): Promise<void>; // stops polling, drains in-flight work and freezes the queue
  resumeAfterScan(): Promise<void>; // releases the port after a scan
  reload(newTransport): Promise<void>; // swaps the transport, keeps queue / polling / clients
  destroy(): Promise<void>; // stops polling, drains the queue and closes the port
}

interface IPortQueue {
  readonly maxLength: number;
  enqueue<T>(fn, opts?: IPortQueueEnqueueOptions): Promise<T>; // { priority?, immediate?, timeoutMs? }
  enablePause(): void;
  disablePause(): void;
  enableScanPause(): void; // new exchanges fail fast with ModbusScanActiveError
  disableScanPause(): void;
  isPaused(): boolean;
  isScanPaused(): boolean;
  isIdle(): boolean;
  waitIdle(timeoutMs?): Promise<void>; // ModbusBusyError when the port stays busy
  cancelWaiters(error): void; // release everyone waiting for a free slot (scan, teardown)
  abort(error): void; // permanent stop: rejects queued and in-flight callers, refuses new jobs
  dropPending(error): number; // drops queued (not running) jobs, the queue stays usable
  getStats(): IPortQueueStats; // { queueLength, processing }
}

interface IPortQueueOptions {
  maxLength?: number; // backpressure limit, default 500
  overflowPolicy?: 'wait' | 'reject'; // full queue: wait for a slot (default) or fail fast
  overflowWaitMs?: number; // upper bound for that wait, 0 = no extra bound (default)
  jobTimeoutMs?: number; // per-job safety timeout, off by default
  logLevel?: TPortQueueLogLevel; // 'silent' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
}

interface ICreateClientOptions extends Omit<IModbusClientOptions, 'framing'> {
  clientId?: string;
  slaveId: number;
  transportId?: string; // omitted -> resolved through the router
  allowDuplicateSlaveId?: boolean; // allow two clients for one device (default false)
}

interface IClientInfo {
  clientId: string;
  slaveId: number;
  transportId: string;
  rsMode: TRSMode;
  framing: TModbusProtocolType;
  createdAt: Date;
}

interface IClientContext {
  // injected by createClient() into a managed client
  clientId: string;
  session: IPortSession;
  framing: TModbusProtocolType;
  rsMode: TRSMode;
}
```

**`node-rtu` transport options** added by the refactoring:

| Option              | Type      | Description                                                                                                                                    |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `interFrameDelayMs` | `number`  | Minimum bus silence (ms) after the last received byte before the next request. Default `0` (off): the queue already leaves 3.6–7 ms naturally. |
| `exclusiveLock`     | `boolean` | Exclusive port access via a pid lock file (default `true`). A second process gets a clear error instead of corrupting frames.                  |

---

## Polling Manager (Polling automation)

### `IPollingManagerConfig` (Global settings)

```ts
interface IPollingManagerConfig {
  defaultMaxRetries?: number; // Default retries
  defaultBackoffDelay?: number; // Backoff delay
  defaultTaskTimeout?: number; // Task execution timeout
  interTaskDelay?: number; // Pause between tasks in the queue
  logLevel?: TManagerLogLevel; // 'silent' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  logger?: Logger<ILogObj>; // External tslog logger instance
  concurrency?: 'strict' | 'per-slave'; // 'strict' (default): one task at a time; 'per-slave': one mutex per declared slave
}
```

### `IPollingTaskOptions` (Specific task settings)

```ts
interface IPollingTaskOptions {
  id: string; // Unique task ID
  clientId?: string; // Owner (from createClient()); tasks are auto-stopped and removed with their client
  name?: string; // Human-readable task name
  priority?: number; // Priority (the higher the priority, the earlier in the queue)
  interval: number; // Execution frequency (ms)
  fn:
    | ((signal?: AbortSignal) => unknown | Promise<unknown>)
    | Array<(signal?: AbortSignal) => unknown | Promise<unknown>>; // Modbus requests
  immediate?: boolean; // Whether to run immediately
  maxRetries?: number; // Override global retries for this task
  backoffDelay?: number; // Override global backoff delay
  taskTimeout?: number; // Override global task timeout

  // Life cycle callbacks
  onData?: (data: unknown[]) => void; // Success data callback
  onError?: (error: Error, fnIndex: number, retryCount: number) => void; // Error of a specific function
  onStart?: () => void; // Task started
  onStop?: () => void; // Task stopped
  onFinish?: (success: boolean, results: unknown[]) => void; // Iteration completed
  onBeforeEach?: () => void; // Before each function call
  onRetry?: (error: Error, fnIndex: number, retryCount: number) => void; // Retry attempt
  onSuccess?: (result: unknown) => void; // Single function succeeded
  onFailure?: (error: Error) => void; // Final task failure
  shouldRun?: () => boolean; // Start condition
}
```

---

## Connection Trackers (State Tracking)

### `IDeviceConnectionTracker` (Slave Device Status)

```ts
interface IDeviceConnectionTracker {
  setHandler(handler: TDeviceStateHandler): Promise<void>;
  removeHandler(): Promise<void>;
  notifyConnected(slaveId: number): Promise<void>;
  notifyDisconnected(slaveId: number, errorType: EConnectionErrorType, errorMessage?: string): void;
  removeState(slaveId: number): void;
  getState(slaveId: number): Promise<IDeviceConnectionStateObject | undefined>;
  getAllStates(): Promise<IDeviceConnectionStateObject[]>;
  clear(): Promise<void>;
  hasState(slaveId: number): Promise<boolean>;
  getConnectedSlaveIds(): Promise<number[]>;
}
```

```ts
interface IDeviceConnectionStateObject {
  slaveId: number;
  hasConnectionDevice: boolean;
  errorType?: EConnectionErrorType;
  errorMessage?: string;
}
```

> `notifyDisconnected` uses a trailing debounce (**default 500 ms**, `debounceMs` in options). Errors in the handler are caught and logged — no unhandled rejections.

### `IPortConnectionTracker` (Physical port status)

```ts
interface IPortConnectionTracker {
  setHandler(handler: TPortStateHandler): Promise<void>;
  notifyConnected(slaveIds: number[]): Promise<void>; // The port is open. SlaveIds are forwarded from the controller
  notifyDisconnected(
    errorType: EConnectionErrorType,
    errorMessage: string,
    slaveIds: number[]
  ): void;
  getState(): Promise<IPortConnectionState>;
  clear(): Promise<void>;
  isConnected(): Promise<boolean>;
}
```

```ts
interface IPortConnectionState {
  isConnected: boolean;
  errorType?: EConnectionErrorType;
  errorMessage?: string;
  slaveIds: number[];
  timestamp: number;
}
```

> `notifyDisconnected` debounce default **300 ms**; handler errors are caught and logged.

### Handler signatures

```ts
type TDeviceStateHandler = (
  slaveId: number,
  connected: boolean,
  error?: { type: EConnectionErrorType; message: string }
) => void;

type TPortStateHandler = (
  connected: boolean,
  slaveIds: number[],
  error?: { type: EConnectionErrorType; message: string }
) => void;
```

---

## Emulator API

### `IModbusSlaveCoreEmulator` (Emulator core)

If you're writing your own emulator, it must support:

| Method                             | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| `processRequest(unitId, pdu)`      | Processing incoming packets. Returns the response PDU. |
| `readCoils(start, qty)`            | Read coil memory.                                      |
| `readDiscreteInputs(start, qty)`   | Read discrete-input memory.                            |
| `readHoldingRegisters(start, qty)` | Read holding-register memory.                          |
| `readInputRegisters(start, qty)`   | Read input-register memory.                            |
| `writeSingleCoil(addr, value)`     | Write one coil.                                        |
| `writeSingleRegister(addr, value)` | Write one register.                                    |
| `addRegisters(definitions)`        | Filling memory with data (`IRegisterDefinitions`).     |
| `infinityChange(params)`           | Starting a cyclic change of values.                    |
| `stopInfinityChange(params)`       | Stopping a cyclic change of values.                    |
| `setException(fc, addr, code)`     | Setting up hardware error simulation.                  |
| `clearAll()`                       | Resetting the whole emulator memory.                   |

---

## Type Usage Examples (TypeScript)

**Creating a plugin based on interfaces:**

```ts
import { IModbusPlugin, ICustomFunctionHandler } from 'modbus-connect/types';

class MyPlugin implements IModbusPlugin {
  public name = 'VoltagePlugin';
  public customFunctionCodes: Record<string, ICustomFunctionHandler> = {
    getVoltage: {
      buildRequest: (addr: number) => new Uint8Array([0x65, addr >> 8, addr & 0xff]),
      parseResponse: (pdu: Uint8Array) => pdu[1],
    },
  };
}
```

**Processing status via the status interface:**

```ts
import { ITransportStatus } from 'modbus-connect/types';

const status: ITransportStatus = controller.getStatus('COM1') as ITransportStatus;
if (status.connected) {
  console.log(`Transport ${status.id} online. Uptime: ${status.uptime}ms`);
}
```
