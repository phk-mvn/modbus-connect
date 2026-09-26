[← Back to README](../README.md)

# TransportController

> The `TransportController` is the central link of the library that manages the lifecycle of all connections
> (Node.js Serial, WebSerial, TCP, Emulators). It is responsible for routing Modbus requests to the required
> ports, load balancing, device health monitoring, and background polling management.

---

## 📚 Table of Contents

- [Subtleties and features of the work](#subtleties-and-features-of-the-work)
- [Transport management methods](#transport-management-methods)
- [Client management methods](#client-management-methods)
- [Routing control methods (Slave ID's)](#routing-control-methods-slave-ids)
- [Background Polling Management (Proxy)](#background-polling-management-proxy)
- [Diagnostics and Status](#diagnostics-and-status)
- [Event tracking](#event-tracking)

---

## Subtleties and features of the work

- **Thread Safety (Mutex)**: All operations to change the transport registry (`add`, `remove`, `reload`) are protected by an internal mutex. This eliminates "data races" with simultaneous asynchronous calls.
- **Mode Restrictions (RSMode)**:
  - **RS485 / TCP/IP**: Allows you to connect an unlimited number of Slave IDs to a single transport.
  - **RS232**: Strictly limited to **one** device per port. When trying to bind a second Slave ID, the controller will throw an `RSModeConstraintError`.
- **Automatic deletion**: If you delete the last Slave ID from the transport using `removeSlaveIdFromTransport`, the controller will automatically stop and delete this transport from memory.
- **Secure Events**: When port or device events occur (connection/disconnection), the controller updates the status trackers under the mutex, but calls your callback functions outside of it. This ensures that there are no Deadlocks.
- **Async Routing**: `assignSlaveIdToTransport` and `removeSlaveIdFromTransport` are now properly async — always `await` them to avoid race conditions.
- **Single queue per port**: every wire-level operation goes through the port queue (`PortSession.queue`), which is created together with the session. Manual commands get `immediate` priority; the queue also provides `maxLength` backpressure (`ModbusQueueOverflowError`), pause/resume and a scan pause (`ModbusScanActiveError`).
- **Client roster**: `createClient()` / `removeClient()` keep the client list and the port slave inventory in sync; `removeTransport()` / `destroy()` clean up the clients of the affected port.

---

## Transport management methods

### `addTransport()`

Adds and initializes a new transport. Creates a personal `PollingManager` for it.

> **Note**:
>
> - For `node-rtu` you can use `path` as an alias for `port`.
> - There is no `slaveIds` transport option any more: the port inventory is maintained automatically by `createClient()` / `removeClient()`, while `assignSlaveIdToTransport()` / `removeSlaveIdFromTransport()` stay available for manual control.
> - `addTransport(id, type, options, reconnectOptions?, pollingConfig?, queueOptions?)` — the last two arguments configure the port `PollingManager` and the port `PortQueue` (`{ maxLength, overflowPolicy, overflowWaitMs, jobTimeoutMs, logLevel }`).

**Example**:

```js
await controller.addTransport(
  'RS485_BUS',
  'node-rtu',
  {
    path: '/dev/ttyUSB0',
    baudRate: 9600,
    RSMode: 'RS485',
  },
  undefined, // reconnect options
  undefined, // polling manager config
  { maxLength: 500 } // port queue options
);
```

**Expected result**:

```bash
2026-09-25 14:00:01.096 INFO Transport Controller Transport "RS485_BUS" added with PollingManager
```

---

### `connectTransport()`

Opens a physical connection for a specific transport and starts polling tasks.

**Example**:

```js
await controller.connectTransport('RS485_BUS');
```

**Expected result**:

```bash
2026-09-25 14:00:02.201 INFO Transport Controller Transport "RS485_BUS" connected
```

---

### `reloadTransport()`

"Hot" replacement of transport. It is useful for changing settings (for example, IP addresses) without losing the associated Slave ID and event handlers.

**Example**:

```js
await controller.reloadTransport('RS485_BUS', {
  path: '/dev/ttyUSB0',
  baudRate: 115200, // Changing the speed
});
```

**Expected result**:

```bash
2026-09-25 14:05:11.774 INFO Transport Controller Transport "RS485_BUS" reloaded
```

---

## Client management methods

Since the refactoring the controller owns a client roster: one client = one device on one port.
Framing is derived from the port RS mode (`RS485`/`RS232` -> `rtu`, `TCP/IP` -> `tcp`), so a client
cannot pick a wrong frame encoding, and the port slave inventory is filled/cleared automatically.

### `createClient()`

Creates a client bound to a port session, registers it and assigns its slave to that port.

```js
const client = await controller.createClient({
  slaveId: 42,
  transportId: 'RS485_BUS', // omit to let the router pick a port by (slaveId, RSMode)
  clientId: 'flow-meter', // optional, generated when omitted
  timeout: 3000,
});
```

- one port serves several clients (several devices) — exchanges are serialized by the port queue;
- on `RS232` a second device is rejected with `RSModeConstraintError`;
- a duplicate `clientId` is rejected with `ClientAlreadyExistsError`;
- a second client for the **same device** (same port + slave id) is rejected with
  `DuplicateSlaveIdError`: two masters for one device double the traffic and make its connection
  state ambiguous. `allowDuplicateSlaveId: true` allows it deliberately (with a warning);
- deliberately has no `framing` option.

### `getClient()` / `listClients()` / `removeClient()`

```js
controller.getClient('flow-meter'); // ModbusClient | null
controller.listClients(); // all clients
controller.listClients('RS485_BUS'); // clients of one port
await controller.removeClient('flow-meter'); // drops the client, its device state and its slave
```

### `reassignClient()` / `setSlaveId()`

Moves a managed client to another device address. The controller variant keeps the roster, the port
slave inventory and the client's own state in sync; for a managed client `client.setSlaveId()` simply
delegates to it.

```js
await controller.reassignClient('flow-meter', 43); // controller side
await client.setSlaveId(43); // same effect for a client created by this controller

// Moving onto an address that another client of the same port already serves:
await controller.reassignClient('flow-meter', 47); // -> DuplicateSlaveIdError
await controller.reassignClient('flow-meter', 47, { allowDuplicateSlaveId: true }); // deliberate
```

A client that was never registered by a controller only changes its address internally: no roster,
no inventory, nothing else to update.

`removeTransport()` / `destroy()` remove all clients of the affected port automatically.

> **Teardown is immediate.** `removeClient()` (and `client.disconnect()` for a managed client) drops the
> client and its polling tasks without waiting for a running exchange. `disconnectTransport()` pauses the
> port's polling tasks and closes the port right away — queued calls are rejected with
> `ModbusNotConnectedError` instead of waiting, and the tasks resume on the next `connectTransport()`.
> `destroy()` stops everything at once: queued and in-flight callers are rejected immediately and the port
> is closed without draining.

### `getSession()`

Returns the port session that owns a port id — the object that holds the transport, the shared
queue, the polling manager, the port tracker and the clients.

```js
const session = controller.getSession('RS485_BUS');
session.queue.getStats(); // { queueLength, processing }
session.clients.size; // number of devices on this port
```

### `getTransport()`

**Deprecated** — use `getSession(id).transport` instead.

---

## Routing control methods (Slave ID's)

> Normally you never call these by hand: `createClient()` / `removeClient()` keep the inventory in
> sync. They remain public for manual scenarios (for example, pre-assigning a slave before a client exists).

### `assignSlaveIdToTransport()`

Binds an additional Slave ID to an existing transport.

**Example**:

```js
await controller.assignSlaveIdToTransport('RS485_BUS', 10);
```

**Expected result**:

```bash
2026-09-25 14:10:00.330 INFO Transport Controller [RS485_BUS][rtu][ID:10] Slave 10 assigned to transport "RS485_BUS"
```

---

### `removeSlaveIdFromTransport()`

Unlinks the device from the communication channel.

**Example**:

```js
// If there was only a slave 10 on the RS485_BUS transport:
await controller.removeSlaveIdFromTransport('RS485_BUS', 10);
```

**Expected result**:

```bash
2026-09-25 14:15:00.412 INFO Transport Controller [RS485_BUS][rtu][ID:10] Slave 10 removed from transport "RS485_BUS"
2026-09-25 14:15:00.413 INFO Transport Controller Transport "RS485_BUS" is empty. Auto-removing...
2026-09-25 14:15:00.414 INFO Transport Controller Transport "RS485_BUS" fully removed
```

---

## Background Polling Management (Proxy)

> The polling manager is a scheduler over the port queue: one port = one exchange at a time, so
> tasks of different devices can never interleave on the wire. A failing task (for example a silent
> device with retries/backoff) does not block the other tasks any more. Manual requests
> (`writeToPort`, client calls) are submitted to the same queue with `immediate` priority.
> Task-level concurrency is controlled by `concurrency` in `IPollingManagerConfig` (`strict` by default).

### `addPollingTask()`

Adds the task of cyclic register reading for a specific transport.

**Example**:

```js
controller.addPollingTask('RS485_BUS', {
  id: 'read-holding',
  interval: 2000,
  fn: () => client.readHoldingRegisters(100, 5),
  onData: data => console.log('Data:', data),
});
```

**Expected result**:

```bash
2026-09-25 14:20:00.517 INFO manager Task added -> read-holding
```

---

### `controlTask()` / `controlPolling()`

Starts, stops, pauses, or resumes polling tasks. Accepts plain strings or `EPollingAction`/`EPollingBulkAction` enums. Methods now throw an error if the transport is not found (BUG-5 fix).

**Using plain strings (no import needed)**:

```js
// Single task control
controller.controlTask('RS485_BUS', 'read-holding', 'pause');
controller.controlTask('RS485_BUS', 'read-holding', 'resume');
controller.controlTask('RS485_BUS', 'read-holding', 'stop');
controller.controlTask('RS485_BUS', 'read-holding', 'start');

// Bulk control for all tasks on a transport
controller.controlPolling('RS485_BUS', 'pauseAll');
controller.controlPolling('RS485_BUS', 'resumeAll');
controller.controlPolling('RS485_BUS', 'stopAll');
controller.controlPolling('RS485_BUS', 'startAll');
```

**Using typed enums (optional, for IDE autocomplete)**:

```js
const { EPollingAction, EPollingBulkAction } = require('modbus-connect/types');

controller.controlTask('RS485_BUS', 'read-holding', EPollingAction.Pause);
controller.controlPolling('RS485_BUS', EPollingBulkAction.ResumeAll);
```

---

### `executeImmediate()`

A method for executing extraordinary commands (for example, recording at the touch of a button). Ensures that the request does not "collide" with background polling.

**Example**:

```js
await controller.executeImmediate('RS485_BUS', async () => {
  return await client.writeSingleRegister(10, 1);
});
```

**Expected result**:

```bash
2026-09-25 14:22:05.288 INFO ModbusClient [ID:42][FC:6] Response received +50ms
```

---

## Diagnostics and Status

### `getStatus()`

Returns the current status of one or all transports.

**Example**:

```js
const status = controller.getStatus('RS485_BUS');
console.log(status);
```

**Expected result**:

```bash
{
    id: 'RS485_BUS',
    connected: true,
    lastError: undefined,
    connectedSlaveIds: [1, 2, 10],
    uptime: 125000,
    reconnectAttempts: 0,
    pollingStats: {
        queueLength: 0,     // jobs waiting in the port queue
        tasksRunning: 3,    // polling tasks currently running
        clientsCount: 3     // clients (devices) registered on this port
    }
}
```

---

### `getActiveTransportCount()`

Returns the number of transports that are currently successfully connected.

**Example**:

```js
console.log('Active lines:', controller.getActiveTransportCount());
```

---

### `writeToPort()`

Low-level method for writing raw bytes directly to a transport's port and optionally reading the response. The operation is submitted as an immediate job to the port queue, so it never collides with background tasks or client requests.

**Example**:

```js
const response = await controller.writeToPort('RS485_BUS', rawAduBytes, 10, 3000);
```

---

### `destroy()`

Gracefully shuts down the entire controller: stops all polling, disconnects all transports, and releases all resources.

**Example**:

```js
await controller.destroy();
```

---

## Event tracking

### `setDeviceStateHandlerForTransport()`

Lets you know when a particular Slave ID on the line stopped responding (or reappeared). It uses a debounce mechanism to eliminate false alarms in case of single interference.

**Example**:

```js
await controller.setDeviceStateHandlerForTransport('RS485_BUS', (slaveId, connected, error) => {
  const status = connected ? 'online' : `disabled (${error.message})`;
  console.log(`[Event] Device ${slaveId} is now ${status}`);
});
```

**Expected result** (In case of disconnection):

```bash
2026-09-25 14:30:05.101 WARN ModbusClient [ID:1][FC:3][ATT:1] Modbus request timed out Attempt failed
[Event] Device 1 is now disabled (Modbus request timed out)
```

---

### `client.setDeviceStateHandler()`

Each client owns an **isolated device tracker**, so connection quality is judged per device.
The handler is called only when the state actually changes, and a disconnect is debounced
(500 ms by default), so single lost frames do not produce false alarms.

```js
await client.setDeviceStateHandler((slaveId, connected, error) => {
  if (connected) console.log(`[device ${slaveId}] online`);
  else console.error(`[device ${slaveId}] offline: ${error?.type} — ${error?.message}`);
});
```

```bash
[device 42] online
[device 42] offline: Timeout — Read timeout: No data received within 1000ms
[device 42] online
```

> The port-level tracker lives in the port session (see `getSession(id).portTracker`) and is
> exposed through `setPortStateHandler()` / `setPortStateHandlerForTransport()`.
