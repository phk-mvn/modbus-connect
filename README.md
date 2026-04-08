# Modbus Connect (Node.js & Web Serial)

Modbus connect is a cross-platform library for Modbus RTU/TCP communication in both NodeJS and modern browsers (via the Web Serial API).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/modbus-connect.svg)](https://www.npmjs.com/package/modbus-connect)

## Features

- 🌐 **Isomorphism**: Works in Node.js and modern browsers.
- 🛡️ **Security (Mutex)**: Eliminates collisions between background polling and manual commands.
- 🔄 **Polling Manager**: A queue of tasks with priorities, delays and exponential backoff.
- ⚡ **Smart reconnect**: Automatic connection recovery for Serial and TCP.
- 🧪 **Emulator**: Full-fiedged TCP-slave and RTU-slave for testing without hardware.

## Install

```bash
npm install modbus-connect
```

## Node RTU connection

```js
import TransportController from 'modbus-connect/transport';
import ModbusClient from 'modbus-connect/client';

const SLAVE_ID = 92;
const TRANSPORT_ID = 'TEST_RTU';

async function main() {
  const controller = new TransportController();
  await controller.addTransport(TRANSPORT_ID, 'node-rtu', {
    path: '/dev/tty.usbserial-01AB5F6D',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    writeTimeout: 500,
    readTimeout: 500,
    slaveIds: [SLAVE_ID],
  });

  await controller.connectTransport(TRANSPORT_ID);

  const client = new ModbusClient(controller, SLAVE_ID, {
    framing: 'rtu',
    timeout: 3000,
  });

  await new Promise(r => setTimeout(r, 250));

  const pollingTask = {
    id: 'task-read-holding-registers',
    interval: 1000,
    fn: async () => {
      return await client.readHoldingRegisters(0, 2);
    },
    onData: data => {
      console.log(data);
    },
    onError: err => {
      console.error(err.message);
    },
  };

  controller.addPollingTask(TRANSPORT_ID, pollingTask);
}
```

**Expected result**:

```bash
phk_mvn@MacBook-Air-Danila modbus-connect % node test-rtu.js
[14:20:01] INFO: [Transport Controller] Transport "TEST_RTU" added with PollingManager
[14:20:01] DEBUG: [Node RTU] Opening serial port /dev/tty.usbserial-01AB5F6D...
[14:20:01] INFO: [Transport Controller] Transport "TEST_RTU" connected
[14:20:01] INFO: [Polling Manager] Task added -> task-read-holding-registers
[ [ 1024, 2048 ] ]
[14:20:02] INFO: [ModbusClient][ID:92] Response received 45ms
[ [ 1024, 2048 ] ]
[14:20:03] INFO: [ModbusClient][ID:92] Response received 42ms
...
```

## Node TCP/IP connection

```js
import TransportController from 'modbus-connect/transport';
import ModbusClient from 'modbus-connect/client';

const SLAVE_ID = 92;
const TRANSPORT_ID = 'TEST_TCP';

async function main() {
  const controller = new TransportController();

  await controller.addTransport(TRANSPORT_ID, 'node-tcp', {
    host: '10.59.43.96',
    port: 502,
    readTimeout: 2000,
    writeTimeout: 1000,
    maxBufferSize: 4096,
    reconnectInterval: 5000,
    maxReconnectAttempts: Infinity,
    slaveIds: [SLAVE_ID],
  });

  await controller.connectTransport(TRANSPORT_ID);

  const client = new ModbusClient(controller, SLAVE_ID, {
    framing: 'tcp',
    timeout: 3000,
  });

  await new Promise(r => setTimeout(r, 250));

  const pollingTask = {
    id: 'task-read-holding-registers',
    interval: 1000,
    fn: async () => {
      return await client.readHoldingRegisters(0, 4);
    },
    onData: data => {
      console.log(data);
    },
    onError: err => {
      console.error(err.message);
    },
  };

  controller.addPollingTask(TRANSPORT_ID, pollingTask);
}
```

**Expected result**:

```bash
phk_mvn@MacBook-Air-Danila modbus-connect % node test.js
[04:04:57] INFO: [Transport Controller] Transport "TEST_TCP" added with PollingManager
[04:04:57] INFO: [Node TCP] Connecting to 10.59.43.96:502...
[04:04:57] INFO: [Transport Controller] Transport "TEST_TCP" connected
[04:04:57] INFO: [Node TCP] SUCCESS: Connected to 10.59.43.96:502
[04:04:57] INFO: [Polling Manager] Task added -> task-read-holding-registers
[ [ 4114, 35714, 1986, 0 ] ]
[04:04:57] INFO: [ModbusClient][ID:92] Response received 13ms
[ [ 4114, 35714, 1986, 0 ] ]
[04:04:58] INFO: [ModbusClient][ID:92] Response received 11ms
[ [ 4114, 35714, 1986, 0 ] ]
[04:04:59] INFO: [ModbusClient][ID:92] Response received 12ms
...
```

## Web RTU connection (Browser)

To use Modbus in the browser, you must first obtain a port using the `Web Serial API`. Note that this code must be triggered by a user gesture (e.g., a button click).

```js
import TransportController from 'modbus-connect/transport';
import ModbusClient from 'modbus-connect/client';

const SLAVE_ID = 1;
const TRANSPORT_ID = 'WEB_SERIAL_RTU';

async function startModbus() {
  // 1. Request port from user
  const port = await navigator.serial.requestPort();

  const controller = new TransportController();

  // 2. Add transport with 'web-rtu' type
  await controller.addTransport(TRANSPORT_ID, 'web-rtu', {
    port, // Pass the native WebSerial port object
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    slaveIds: [SLAVE_ID],
  });

  await controller.connectTransport(TRANSPORT_ID);

  const client = new ModbusClient(controller, SLAVE_ID, {
    framing: 'rtu',
    timeout: 2000,
  });

  // 3. Setup Polling
  controller.addPollingTask(TRANSPORT_ID, {
    id: 'web-task-coils',
    interval: 2000,
    fn: async () => {
      return await client.readCoils(0, 8);
    },
    onData: data => {
      console.log('Coils status:', data[0]);
    },
    onError: err => {
      console.error('Web Serial Error:', err.message);
    },
  });
}
```

**Expected result**:

```bash
[14:25:10] INFO: [Transport Controller] Transport "WEB_SERIAL_RTU" added with PollingManager
[14:25:10] INFO: [Web RTU] Port opened successfully
[14:25:10] INFO: [Transport Controller] Transport "WEB_SERIAL_RTU" connected
[14:25:10] INFO: [Polling Manager] Task added -> web-task-coils
Coils status: [true, false, true, true, false, false, false, true]
[14:25:11] INFO: [ModbusClient][ID:1] Response received 85ms
```

## Emulator Node RTU / TCP connection

```js
import TransportController from 'modbus-connect/transport';
import ModbusClient from 'modbus-connect/client';

const SLAVE_ID = 92;
const TRANSPORT_ID = 'TEST_TCP';

async function main() {
  const controller = new TransportController();
  await controller.addTransport('emulator-1', 'rtu-emulator', {
    slaveId: 1,
    responseLatencyMs: 30,
    initialRegisters: {
      holding: [
        { start: 100, value: 1234 },
        { start: 101, value: 5678 },
      ],
      coils: [{ start: 0, value: true }],
    },
  });

  await controller.connectTransport('emulator-1');

  // Client configuration depending on the type of emulator
  const client = new ModbusClient(controller, 1, {
    framing: 'rtu', // or 'tcp'
    timeout: 3000,
    retryCount: 1,
  });

  // Polling task (will work with any emulator)
  controller.addPollingTask('emulator-1', {
    id: 'task1',
    interval: 1000,
    fn: async () => {
      return await client.readHoldingRegisters(100, 2);
    },
    onData: data => {
      console.log(data);
    },
    onError: err => {
      console.error('Polling error:', err.message);
    },
  });
}
```

**Expected result**:

```bash
phk_mvn@MacBook-Air-Danila modbus-connect % node test.js
[04:04:52] INFO: [Polling Manager] Task added -> task1
[04:04:52] INFO: [Transport Controller] Transport "emulator-1" added with PollingManager
[04:04:52] INFO: [ModbusSlaveCore] ModbusSlaveCore initialized successfully (Slave ID: 1)
[04:04:52] INFO: [RTU Emulator] RTU Emulator connected
[04:04:52] INFO: [ModbusSlaveCore] Registers added successfully: {"coils":1,"discrete":0,"holding":2,"input":0}
[04:04:52] INFO: [Transport Controller] Transport "emulator-1" connected
[ [ 1234, 5678 ] ]
[04:04:52] INFO: [ModbusClient][ID:1] Response received 32ms
[ [ 1234, 5678 ] ]
[04:04:53] INFO: [ModbusClient][ID:1] Response received 32ms
[ [ 1234, 5678 ] ]
[04:04:54] INFO: [ModbusClient][ID:1] Response received 32ms
```

---

# Transport Controller method's

The `TransportController` coordinates the operation of transports, distributes the load between them, and provides an interface for managing the tasks of cyclic device polling.

### 1. Lifecycle & Configuration Management

#### `addTransport(id, type, options, reconnectOptions?, pollingConfig?)`

Initializes and registers a new communication transport.

- **id**: string — Unique identifier for the transport.
- **type**: 'node-rtu' | 'node-tcp' | 'web-rtu' | 'rtu-emulator' | 'tcp-emulator' — The underlying transport technology.
- **options**: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort }) — Configuration object (baudRate, parity, slaveIds, RSMode, host, IP port, etc.).
- **reconnectOptions** (optional): { maxReconnectAttempts?: number; reconnectInterval?: number; } — Auto-reconnection settings.
- **pollingConfig** (optional): IPollingManagerConfig — Configuration for the internal Polling Manager.

#### `removeTransport(id)`

Stops all tasks, closes the connection, and removes the transport from the registry.

- **id**: string — The ID of the transport to remove.

#### `reloadTransport(id, options)`

Re-creates a transport instance with new settings without changing its ID or removing it from the registry.

- **id**: string — The ID of the transport to reload.
- **options**: INodeSerialTransportOptions | (IWebSerialTransportOptions & { port: IWebSerialPort }) — The new configuration options.

### 2. Connection Control

#### `connectTransport(id)`

Manually initiates a connection for a specific transport.

- **id**: string — The transport ID.

#### `disconnectTransport(id)`

Manually closes the connection for a specific transport.

- **id**: string — The transport ID.

#### `connectAll()`

Attempts to connect all registered transports simultaneously. (No parameters).

#### `disconnectAll()`

Disconnects all registered transports. (No parameters).

### 3. Polling Management (Proxy Methods)

#### `addPollingTask(transportId, options)`

Registers a new recurring polling task to the transport's queue.

- **transportId**: string — The target transport ID.
- **options**: IPollingTaskOptions — Task parameters (interval, functionCode, address, quantity, slaveId, callback, etc.).

#### `removePollingTask(transportId, taskId)`

Removes a specific polling task.

- **transportId**: string — The transport ID.
- **taskId**: string — The unique ID of the task to remove.

#### `updatePollingTask(transportId, taskId, newOptions)`

Updates the configuration of an existing task.

- **transportId**: string — The transport ID.
- **taskId**: string — The ID of the task to update.
- **newOptions**: IPollingTaskOptions — The new task configuration object.

#### `controlTask(transportId, taskId, action)`

Changes the state of a specific task.

- **transportId**: string — The transport ID.
- **taskId**: string — The task ID.
- **action**: 'start' | 'stop' | 'pause' | 'resume' — The action to perform.

#### `controlPolling(transportId, action)`

Performs bulk actions on all tasks assigned to a transport.

- **transportId**: string — The transport ID.
- **action**: 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll' — The bulk action to perform.

### 4. Direct Execution & I/O

#### `executeImmediate(transportId, fn)`

Executes an asynchronous function with exclusive access to the transport, ensuring no collision with background polling.

- **transportId**: string — The transport ID.
- **fn**: () => Promise<_T_> — The async function to execute (e.g., a Modbus Write command).

#### `writeToPort(transportId, data, readLength?, timeout?)`

Writes raw bytes directly to the port and optionally waits for a response.

- **transportId**: string — The transport ID.
- **data**: Uint8Array — The raw data buffer to send.
- **readLength**: number (default: 0) — Number of bytes to read immediately after writing.
- **timeout**: number (default: 3000) — Response timeout in milliseconds.

### 5. Routing & Slave Management

#### `assignSlaveIdToTransport(transportId, slaveId)`

Maps a new Slave ID (Device ID) to an existing transport.

- **transportId**: string — The target transport.
- **slaveId**: number — The Modbus unit identifier (1-247).

#### `removeSlaveIdFromTransport(transportId, slaveId)`

Unbinds a Slave ID from a transport and cleans up its tracking state.

- **transportId**: string — The transport ID.
- **slaveId**: number — The Modbus unit identifier.

#### `getTransportForSlave(slaveId, requiredRSMode)`

Finds the most suitable transport for a specific device based on the load balancing strategy.

- **slaveId**: number — The device address.
- **requiredRSMode**: TRSMode ('RS485' | 'RS232' | 'TCP/IP') — The required protocol mode.

#### `setLoadBalancer(strategy)`

Updates the global logic used to select a transport when multiple are available.

- **strategy**: TLoadBalancerStrategy ('first-available' | 'round-robin' | 'sticky').

### 6. Event Handlers

#### `setDeviceStateHandler(handler)`

Sets a global callback for device connection/disconnection events across all transports.

- **handler**: TDeviceStateHandler — Function: (slaveId: number, connected: boolean, error?: any) => void.

#### `setPortStateHandler(handler)`

Sets a global callback for physical port/socket state changes.

- **handler**: TPortStateHandler — Function: (connected: boolean, slaveIds?: number[], error?: any) => void.

#### `setDeviceStateHandlerForTransport(transportId, handler)`

Attaches a device state handler specifically to one transport.

- **transportId**: string — The transport ID.
- **handler**: TDeviceStateHandler — The callback function.

#### `setPortStateHandlerForTransport(transportId, handler)`

Attaches a port state handler specifically to one transport.

- **transportId**: string — The transport ID.
- **handler**: TPortStateHandler — The callback function.

### 7. Diagnostics & Info

#### `getTransport(id)`

Returns the raw transport instance.

- **id**: string — The transport ID.

#### `listTransports()`

Returns an array of ITransportInfo objects containing metadata for all registered transports. (No parameters).

#### `getStatus(id?)`

Retrieves the health status of transports.

- **id** (optional): string — If provided, returns ITransportStatus for that ID. If omitted, returns a Record<string, ITransportStatus> for all transports.

#### `getPollingQueueInfo(transportId)`

Returns statistics for the polling queue (tasks count, execution state).

- **transportId**: string — The transport ID.

#### `getActiveTransportCount()`

Returns the number of currently connected transports. (No parameters).

---

# Modbus client method's

The `ModbusClient` class is the primary high-level interface for interacting with Modbus devices. It handles protocol framing, retry logic, timeouts, and error management.

## 1. Constructor & Core Lifecycle

#### `constructor(transportController, slaveId?, options?)`

Initializes a new instance of the Modbus Client.

- **transportController**: ITransportController — The controller managing physical connections.
- **slaveId**: number (default: 1) — The Modbus unit address (0-255).
- **options**: IModbusClientOptions (optional) — Configuration object:
  - timeout: number (default: 1000) — Response timeout in ms.
  - retryCount: number (default: 0) — Number of retry attempts on failure.
  - retryDelay: number (default: 100) — Delay between retries in ms.
  - framing: 'rtu' | 'tcp' — Framing protocol to use.
  - RSMode: TRSMode — Physical mode (RS485, RS232, TCP/IP).
  - plugins: Constructor[] — List of plugin classes to initialize.

#### `connect()`

Performs a logical connection check. It verifies that a valid transport exists for the current Slave ID and that the port is open. (No parameters).

#### `disconnect()`

Performs a logical disconnection. This stops client operations but does **not** close the physical transport (which is managed by the TransportController). (No parameters).

#### `use(plugin)`

Registers a plugin to extend client functionality (e.g., adding custom function codes).

- **plugin**: IModbusPlugin — An instance of the plugin to register.

## 2. Slave ID Management

#### `currentSlaveId (Getter)`

Returns the current Modbus address (Slave ID) assigned to this client.

- **Returns**: number (1-255).

#### `setSlaveId(newSlaveId)`

Dynamically changes the Slave ID for all subsequent requests made by this client instance.

- **newSlaveId**: number — The new address (integer between 1 and 255).

## 3. Standard Read Operations

#### `readCoils(startAddress, quantity, timeout?)`

Reads the ON/OFF status of discrete coils (Function Code 0x01).

- **startAddress**: number — Starting address (0-65535).
- **quantity**: number — Number of coils to read (1-2000).
- **timeout**: number (optional) — Custom timeout for this specific request.
- **Returns**: Promise<boolean[]> — Array of boolean values.

#### `readDiscreteInputs(startAddress, quantity, timeout?)`

Reads the ON/OFF status of discrete inputs (Function Code 0x02).

- **startAddress**: number — Starting address (0-65535).
- **quantity**: number — Number of inputs to read (1-2000).
- **timeout**: number (optional) — Custom timeout for this specific request.
- **Returns**: Promise<boolean[]> — Array of boolean values.

#### `readHoldingRegisters(startAddress, quantity)`

Reads the binary contents of holding registers (Function Code 0x03).

- **startAddress**: number — Starting address (0-65535).
- **quantity**: number — Number of registers to read (1-125).
- **Returns**: Promise<number[]> — Array of 16-bit register values.

#### `readInputRegisters(startAddress, quantity)`

Reads the binary contents of input registers (Function Code 0x04).

- **startAddress**: number — Starting address (0-65535).
- **quantity**: number — Number of registers to read (1-125).
- **Returns**: Promise<number[]> — Array of 16-bit register values.

## 4. Standard Write Operations

#### `writeSingleCoil(address, value, timeout?)`

Writes a single ON/OFF status to a coil (Function Code 0x05).

- **address**: number — Coil address (0-65535).
- **value**: boolean — Value to write (true = ON, false = OFF).
- **timeout**: number (optional) — Custom timeout for this specific request.
- **Returns**: Promise<{ startAddress: number; value: boolean }> — Confirmation of the write operation.

#### `writeSingleRegister(address, value, timeout?)`

Writes a single holding register (Function Code 0x06).

- **address**: number — Register address (0-65535).
- **value**: number — 16-bit value to write (0-65535).
- **timeout**: number (optional) — Custom timeout for this specific request.
- **Returns**: Promise<{ startAddress: number; value: number }> — Confirmation of the write operation.

#### `writeMultipleCoils(address, values, timeout?)`

Writes multiple ON/OFF statuses to a sequence of coils (Function Code 0x0F).

- **address**: number — Starting address (0-65535).
- **values**: boolean[] — Array of boolean values to write (1-1968 items).
- **timeout**: number (optional) — Custom timeout for this specific request.
- **Returns**: Promise<{ startAddress: number; quantity: number }> — Confirmation of address and count written.

#### `writeMultipleRegisters(address, values, timeout?)`

Writes a block of holding registers (Function Code 0x10).

- **address**: number — Starting address (0-65535).
- **values**: number[] — Array of 16-bit values (0-65535) to write (1-123 items).
- **timeout**: number (optional) — Custom timeout for this specific request.
- **Returns**: Promise<{ startAddress: number; quantity: number }> — Confirmation of address and count written.

## 5. Advanced & Diagnostic Operations

#### `executeCustomFunction(functionName, ...args)`

Executes a custom Modbus function registered via a plugin.

- **functionName**: string — The name defined in the plugin's customFunctionCodes.
- **...args**: any[] — Arguments required by the plugin's request builder.
- **Returns**: Promise<_any_> — Parsed response from the plugin's response parser.

#### `reportSlaveId(timeout?)`

Reads the description of the controller, the current status of the device, and other information (Function Code 0x11).

- **timeout**: number (optional) — Custom timeout for this request.
- **Returns**: Promise<{ slaveId: number; isRunning: boolean; data: Uint8Array }> — Detailed device report.

#### `readDeviceIdentification(decoder: windows-1251 | utf-8 (default), timeout?)`

Reads identification and additional information relevant to the physical and functional description of the device (Function Code 0x2B / 0x0E).

- **timeout**: number (optional) — Custom timeout for this request.
- **Returns**: Promise<_Object_> — An object containing device properties (e.g., VendorName, ProductCode, Revision) decoded as strings.

---

# Error type's

## 1. Core & Protocol Errors

| Error class                      | Description                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Modbus Error**                 | The base class for all errors in the library                                                                              |
| **ModbusTimeoutError**           | Thrown when a request exceeds the allocated timeout period                                                                |
| **ModbusCRCError**               | Thrown when the CRC check fails (usually due to noise in RTU mode)                                                        |
| **ModbusResponseError**          | Base class for errors related to invalid or unexpected responses                                                          |
| **ModbusExceptionError**         | Thrown when the slave returns a standart Modbus exception (e.g., 0x01, 0x02). Includes `functionCode` and `exceptionCode` |
| **ModbusFlushError**             | Occurs when an operation is interrupted by a transport buffer flush                                                       |
| **ModbusTooManyEmptyReadsError** | Thrown after multiple consecutive reads return no data                                                                    |

## 2. Standart Modbus Exception Mappings

| Error Class                             | Description                                                                 |
| :-------------------------------------- | :-------------------------------------------------------------------------- |
|  **ModbusIllegalDataAddressError**      | Exception Code 0x02: The data address is not allowed by the slave.          |
|  **ModbusIllegalDataValueError**        | Exception Code 0x03: The value being written is outside the allowed range.  |
| **ModbusSlaveDeviceFailureError**       | Exception Code 0x04: An unrecoverable error occurred in the slave.          |
| **ModbusAcknowledgeError**              | Exception Code 0x05: Slave accepted the request but needs time to process.  |
|  **ModbusSlaveBusyError**               | Exception Code 0x06: Slave is currently processing a long-duration command. |
|  **ModbusMemoryParityError**            | Exception Code 0x08: Memory parity error detected in the slave.             |
|  **ModbusGatewayPathUnavailableError**  | Exception Code 0x0A: Gateway is misconfigured or overloaded.                |
| **ModbusGatewayTargetDeviceError**      | Exception Code 0x0B: Gateway target device failed to respond.               |

## 3. Data Validation & Parsing

| Error Class                           | Description                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| **ModbusInvalidAddressError**         | Thrown when a Slave ID or Register address is outside the range 1-255 / 0-65535. |
| **ModbusInvalidFunctionCodeError**    | Thrown when an unsupported Modbus function code is requested.                    |
| **ModbusInvalidQuantityError**        | Thrown when the number of registers/coils requested exceeds protocol limits.     |
| **ModbusMalformedFrameError**         | Received data does not follow the Modbus frame structure.                        |
| **ModbusInvalidFrameLengthError**     | The length of the received frame does not match the expected length.             |
| **ModbusInvalidTransactionIdError**   | (TCP only) The received Transaction ID does not match the sent ID.               |
| **ModbusUnexpectedFunctionCodeError** | The response function code does not match the request.                           |
| **ModbusInsufficientDataError**       | Received fewer bytes than required to parse the PDU.                             |

## 4. Connection & Transport State

| Error Class                      | Description                                                       |
| -------------------------------- | ----------------------------------------------------------------- |
| **ModbusNotConnectedError**      | Attempting an I/O operation while the transport is disconnected.  |
| **ModbusAlreadyConnectedError**  | Attempting to connect when a connection is already active.        |
| **ModbusConnectionRefusedError** | The remote host (TCP) actively refused the connection.            |
| **ModbusConnectionTimeoutError** | The handshake/connection attempt timed out.                       |
| **TransportError**               | Base class for all transport-specific (Web/Node) errors.          |
| **RSModeConstraintError**        | Violation of mode rules (e.g., trying to add 2 devices to RS232). |

## 5. Physical Layer & Serial Errors

| Error Class                   | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| **ModbusParityError**         | Serial line parity check failed.                                |
| **ModbusFramingError**        | Serial line framing error (start/stop bits).                    |
| **ModbusLRCError**            | Checksum failure for ASCII mode.                                |
| **ModbusOverrunError**        | Hardware buffer overrun (data arriving too fast).               |
| **ModbusNoiseError**          | Communication integrity compromised by electrical noise.        |
| **ModbusBaudRateError**       | Mismatch between configured and actual baud rate.               |
| **ModbusSilentIntervalError** | Violation of the 3.5-character silent interval required by RTU. |

## 6. Platform-Specific Transport Errors

| Platform           | Error Classes                                                        |
| ------------------ | -------------------------------------------------------------------- |
| **Web Serial**     | WebSerialConnectionError, WebSerialReadError, WebSerialWriteError    |
| **Node.js Serial** | NodeSerialConnectionError, NodeSerialReadError, NodeSerialWriteError |

## 7. Polling Manager Errors

| Error Class                       | Description                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| **PollingTaskAlreadyExistsError** | Thrown when adding a task with a non-unique ID.              |
| **PollingTaskNotFoundError**      | Thrown when trying to control or remove a non-existent task. |
| **PollingTaskValidationError**    | Thrown when task options (interval, slaveId) are invalid.    |

---

# Polling Manager method's

The `PollingManager` handles the scheduling, prioritization, and execution of recurring Modbus tasks. It ensures that multiple polling requests are queued and executed without colliding.

## 1. Manager Configuration & Lifecycle

#### `constructor(config?)`

Initializes the Polling Manager with optional default settings.

- **config**: IPollingManagerConfig (optional):
  - defaultMaxRetries: number (default: 3) — Retries per task function.
  - defaultBackoffDelay: number (default: 1000) — Wait time between retries.
  - defaultTaskTimeout: number (default: 5000) — Timeout for each task function.
  - logLevel: string (default: 'info') — Initial logging level.

#### `addTask(options)`

Registers and (by default) starts a new recurring task.

- **options**: IPollingTaskOptions:
  - id: string (**Required**) — Unique task identifier.
  - interval: number (**Required**) — Time between executions in ms.
  - fn: Function | Function[] (**Required**) — The async function(s) to execute.
  - priority: number (default: 0) — Higher numbers execute first in the queue.
  - immediate: boolean (default: true) — If false, task waits one interval before the first run.
  - maxRetries / backoffDelay / taskTimeout: number — Overrides manager defaults.
  - **Callbacks**: onData, onError, onStart, onStop, onFinish, onBeforeEach, onRetry, onSuccess, onFailure.

#### `updateTask(id, newOptions)`

Updates an existing task. It replaces the old task with new configuration while preserving the running/paused state.

- **id**: string — The task ID.
- **newOptions**: IPollingTaskOptions — New parameters to apply.

#### `removeTask(id)`

Completely removes a task from the manager and stops it if it was running.

- **id**: string — The task ID.

#### `clearAll()`

Stops and deletes every single task registered in the manager. (No parameters).

## 2. Individual Task Control (via Manager)

#### `startTask(id) / stopTask(id)`

Starts or completely stops a specific task. A stopped task is removed from the execution queue.

- **id**: string — The task ID.

#### `pauseTask(id) / resumeTask(id)`

Pauses or resumes a specific task. A paused task stays in the manager but skips scheduling until resumed.

- **id**: string — The task ID.

#### `restartTask(id)`

Stops and then immediately starts a task again.

- **id**: string — The task ID.

#### `setTaskInterval(id, interval)`

Changes the repetition rate of a specific task.

- **id**: string — The task ID.
- **interval**: number — New interval in milliseconds.

## 3. Bulk Operations

#### `startAllTasks() / stopAllTasks()`

Starts or stops every registered task simultaneously. (No parameters).

#### `pauseAllTasks() / resumeAllTasks()`

Pauses or resumes every registered task. Useful during global connection drops. (No parameters).

#### `restartAllTasks()`

Stops and restarts every registered task. (No parameters).

## 4. Status & Diagnostics

#### `hasTask(id)`

Returns true if a task with the given ID exists.

- **id**: string.

#### `isTaskRunning(id) / isTaskPaused(id)`

Returns the current state of a specific task.

- **id**: string.

#### `getTaskState(id)`

Returns a detailed state object for a task.

- **id**: string.
- **Returns**: IPollingTaskState | null ({ stopped, paused, running, inProgress }).

#### `getTaskIds()`

Returns an array of all registered task IDs. (No parameters).

#### `getQueueInfo()`

Returns information about the tasks currently waiting in the execution queue. (No parameters).

- **Returns**: IPollingQueueInfo ({ queueLength, tasks: [...] }).

#### `getSystemStats()`

Returns basic metrics about the manager. (No parameters).

- **Returns**: IPollingSystemStats ({ totalTasks, totalQueues, queuedTasks }).

## 5. Advanced Execution & Logging

#### `executeImmediate(fn)`

Executes a function immediately using the manager's internal mutex. This is used to perform one-off requests (like a Modbus Write) without colliding with the background polling cycle.

- **fn**: () => Promise<_T_> — The async logic to execute.
- **Returns**: Promise<_T_> — The result of the function.

#### `setLogLevel(level)`

Changes the logging level for the manager and all associated tasks.

- **level**: string (e.g., 'debug', 'info', 'warn', 'error').

#### `disableAllLoggers()`

Sets the log level to 'error' for everything, effectively silencing non-critical output. (No parameters).

---

# Extending ModbusClient with Plugins

The `ModbusClient` includes a flexible plugin system that allows you to extend its functionality with manufacturer-specific or custom Modbus function codes. This is particularly useful when dealing with industrial devices that implement non-standard features.

## 1. How the Plugin System Works

A plugin is essentially a bridge between your high-level code and the Modbus Protocol Data Unit (PDU). To create a plugin, you must implement the `IModbusPlugin` interface, which requires:

1. **`name`**: A unique string identifier for the plugin.
2. **`customFunctionCodes`**: An object where keys are the names of your methods and values are handlers containing:
   - `buildRequest(...args)`: Logic to convert arguments into a `Uint8Array` (PDU: Function Code + Data).
   - `parseResponse(pdu)`: Logic to convert the returned `Uint8Array` back into a readable JavaScript object or value.

## 2. Example: Creating a Custom Plugin

Let's imagine a device that has a custom **Function Code `0x42`** to retrieve "Advanced Device Diagnostics" (Uptime and Internal Temperature).

```ts
// AdvancedDiagnosticsPlugin.ts
import { IModbusPlugin, ICustomFunctionHandler } from './types/modbus-types';

export class AdvancedDiagnosticsPlugin implements IModbusPlugin {
  public name = 'AdvancedDiagnostics';

  // Define custom handlers
  public customFunctionCodes: Record<string, ICustomFunctionHandler> = {
    /**
     * Retrieves uptime and temperature using custom code 0x42
     */
    getAdvancedStats: {
      // Step 1: Build the Request PDU
      buildRequest: (requestType: number): Uint8Array => {
        const pdu = new Uint8Array(2);
        pdu[0] = 0x42; // The custom Function Code
        pdu[1] = requestType; // A sub-command or parameter
        return pdu;
      },

      // Step 2: Parse the Response PDU
      parseResponse: (pdu: Uint8Array) => {
        // The device returns: [0x42, UptimeHigh, UptimeLow, TempHigh, TempLow]
        const view = new DataView(pdu.buffer, pdu.byteOffset, pdu.byteLength);

        return {
          functionCode: pdu[0],
          uptimeSeconds: view.getUint16(1), // Bytes 1 & 2
          temperature: view.getUint16(3) / 10, // Bytes 3 & 4 (fixed point)
        };
      },
    },
  };
}
```

## 3. Registering and Using the Plugin

You can register plugins during client initialization or dynamically at runtime using the .use() method.

```ts
import TransportController from './modbus/transport/transport-controller';
import ModbusClient from './modbus/client';
import { AdvancedDiagnosticsPlugin } from './AdvancedDiagnosticsPlugin';

async function run() {
  const controller = new TransportController();

  // Method A: Register via Constructor
  const client = new ModbusClient(controller, 1, {
    plugins: [AdvancedDiagnosticsPlugin],
    framing: 'rtu',
  });

  // OR Method B: Register dynamically
  // const plugin = new AdvancedDiagnosticsPlugin();
  // client.use(plugin);

  try {
    console.log('Executing custom function...');

    // Execute using the name defined in the plugin's customFunctionCodes
    const stats = await client.executeCustomFunction('getAdvancedStats', 0x01);

    console.log('Result received:', stats);
  } catch (error) {
    console.error('Failed to execute custom function:', error);
  }
}
```

## 4. Expected Results

### Communication Flow:

1. **Request Generation**: client.executeCustomFunction('getAdvancedStats', 0x01) calls the plugin's buildRequest(0x01).
2. **PDU Created**: The PDU [0x42, 0x01] is generated.
3. **Transport**: The client wraps this PDU in an ADU (adding Slave ID and CRC/Checksum) and sends it.
4. **Device Response**: The device returns bytes (e.g., [0x01, 0x42, 0x0E, 0x10, 0x00, 0xFA, CRC...]).
5. **Parsing**: The client extracts the response PDU [0x42, 0x0E, 0x10, 0x00, 0xFA] and passes it to the plugin's parseResponse.

### Final Output (Example):

If the device responded with the bytes above, the stats variable in your code would look like this:

```JSON
{
  "functionCode": 66,
  "uptimeSeconds": 3600,
  "temperature": 25.0
}
```

## 5. Summary of Best Practices

- **Unique Names**: Ensure your plugin name is unique. If you register two plugins with the same name, the client will skip the second one.
- **Error Handling**: If buildRequest or parseResponse fails, the client will catch the error and throw it as a standard ModbusError.
- **PDU Only**: Remember that the plugin only deals with the **PDU** (Function Code + Data). You do **not** need to handle Slave IDs, TCP headers, or CRC/LRC manually; the ModbusClient and Transport layers handle that automatically.

---

# Modbus-Connect Type Definitions Reference

This library provides a comprehensive set of TypeScript types and interfaces to ensure type safety across Client, Transport, and Polling operations.

## 1. Importing Types

You can import types directly from the package subpath:

```ts
import {
  IModbusCLient,
  ITransportController,
  IPollingTaskOptions,
  TRSMode,
} from 'modbus-connect/types';
```

## 2. Core Client Types

#### `IModbusClientOptions`

Configuration used when instantiating a `ModbusClient`.

- **`framing`**: `'rtu'`| `'tcp'` — The protocol framing method.
- **`RSMode`**: `TRSMode` — Physical layer (RS485, RS232, TCP/IP).
- **`timeout`**: `number` — Response timeout in milliseconds.
- **`retryCount`**: `number` — Number of attempts per request.
- **`retryDelay`**: `number` — Delay between retries in ms.
- **`plugins`**: `TPluginConstructor[]` — List of plugin classes to load.

## 3. Transport & Connection Types

#### `TRSMode (Type)`

Defines the physical communication standard:

- `'RS485'` | `'RS232'` | `'TCP/IP'`

#### `EConnectionErrorType (Enum)`

Standardized error codes for connection state tracking:

- `UnknownError`, `PortClosed`, `Timeout`, `CRCError`, `ConnectionLost`, `DeviceOffline`, `MaxReconnect`, `ManualDisconnect`, `Destroyed`.

#### `INodeSerialTransportOptions`

Options for Node.js serialport transport:

- **`baudRate`**: `number` (e.g., 9600, 115200).
- **`dataBits`**: `5 | 6 | 7 | 8`.
- **`stopBits`**: `1 | 2`.
- **`parity`**: `'none' | 'even' | 'mark' | 'odd' | 'space'`.
- **`reconnectInterval`**: `number` — Delay between reconnect attempts.
- **`maxReconnectAttempts`**: `number`.

## 4. Polling Manager Types

#### `IPollingTaskOptions`

The most critical interface for setting up automated polling.

- **`id`**: `string` (**Required**) — Unique task ID.
- **`interval`**: `number` (**Required**) — Polling frequency in ms.
- **`fn`**: `Function | Function[]` (**Required**) — The Modbus operation(s).
- **`priority`**: `number` — Higher priority tasks move to the front of the queue.
- **`immediate`**: `boolean` — Start immediately upon adding.
- **`shouldRun`**: `() => boolean` — Conditional check before execution.
- **Callbacks**:
  - `onData`: `(data: any[]) => void` — Called on successful read.
  - `onError`: `(error: Error, fnIndex: number, retry: number) => void`.
  - `onFinish`: `(success: boolean, results: any[]) => void`.

#### `IPollingTaskState`

- **`stopped`**: `boolean` — Task is manually stopped.
- **`paused`**: `boolean` — Task is temporarily paused.
- **`running`**: `boolean` — Task is active (not stopped).
- **`inProgress`**: `boolean` — Task is currently executing an I/O operation.

## 5. Transport Controller & Routing

#### `ITransportInfo`

Metadata stored in the controller for each transport:

- **`status`**: `'disconnected' | 'connecting' | 'connected' | 'error'`.
- **`slaveIds`**: `number[]` — Array of Modbus IDs routed to this transport.
- **`reconnectAttempts`**: `number` — Current count of retry attempts.

#### `TLoadBalancerStrategy`

Strategy for selecting a transport when multiple paths exist for a Slave ID:

- `'round-robin'`, `'sticky'`, `'first-available'`.

## 6. Trackers & Callbacks

#### `TDeviceStateHandler`

Callback for monitoring individual device (Slave ID) availability.

- **Signature**: `(slaveId: number, connected: boolean, error?: { type: EConnectionErrorType, message: string }) => void`

#### `TPortStateHandler`

Callback for monitoring the physical port/socket status.

- **Signature**: `(connected: boolean, slaveIds?: number[], error?: { type: EConnectionErrorType, message: string }) => void`

## 7. Emulator Types (For Testing)

#### `IRegisterDefinitions`

Initial data structure for the Modbus Emulator:

- **`coils`**, **`discrete`**, **`holding`**, **`input`**: `IRegisterDefinition[]`
  - `{ start: number, value: number | boolean }`

#### `IInfinityChangeParams`

Simulates a sensor by changing register values over time:

- **`typeRegister`**: Register type.
- **`range`**: `[min, max]`.
- **`interval`**: Frequency of value changes in ms.

## Summary of Main Interfaces

| Interface                      | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| **`IModbusCLient`**            | High-level API (Read/Write/Plugins).                 |
| **`ITransportController`**     | Orchestrates multiple connections and routing.       |
| **`IPollingManager`**          | Manages the queue and execution of background tasks. |
| **`ITransport`**               | Low-level interface for physical data exchange.      |
| **`IDeviceConnectionTracker`** | Monitors the "Health" of individual Slave IDs.       |

# Changelog

### 4.0.3 (2026-04-08)

- The module's internal clocks were constantly drifting. Now they're using the **system time**.
- In ModbusClient, the `readDeviceIdentification (0x2B)` method was hardcoded to TextDecoder('windows-1251'). The encoding is now configurable, with options of `windows-1251` and `utf-8` available via the `decoder` parameter of the method.
- Fixed static code typing in the `modbus/protocol.ts` file
- Redundant `any` types are removed in the `TransportController` and `tcp-emulator.ts` module's.
- Modified the types in the `modbus-types.ts` file

### 4.0.2 (2026-04-07)

- **Security**: Now the removal of the Slave ID cannot occur simultaneously with the addition of another transport or reboot
- **Memory**: The `_stickyMap` card is now cleared as soon as the device is removed. Previously, there were accumulated "dead" bindings
- **Logic**: A potential error has been removed when **removeTransport** could be called twice for the same ID from different asynchrounous calls
- Added the `enableLogger()/disableLogger()` method's to the **ModbusClient** and **TransportController** modules. Sets the level to `info`, by default loggers are enabled in both modules
- The implementation types of module classes have been finalized
  > **A logger in a WEB environment** functionality has been sent for revision

### 4.0.0 (2026-04-06)

- Improved TCP/IP transport - `'node-tcp'`
- The frame logic has been redesigned. Now the type of frame for processing and constructing requests is initialized in the constructor of the `ModbusCliet` class, and not at the time of sending the request.
- The emulator of the slave device has been redesigned. Now it consists of 2 new transports - `'rtu-emulator'` and ``tcp-emulator'`. All their requests go through ModbusClient and TransportController, which simplifies their development by simply creating a certain type of transport and its options.
- File compilation has been redesigned, now `.d.ts` and `.js.map` files are compiled for each library file, which affect convenient debugging and development
- The types and interfaces in the `modbus/types/modbus-types.ts` file have been improved
- Modules such as have been removed from the import (require):
  - `modbus-connect/logger`, use the `pino` logger yourself
  - `modbus-connect/slave-emulator`, use special transports instead
- **ECHO** functionality has been sent for revision
  > The overall result of the update:
  > Requests have become faster. For example, previously reading 2 Holding registers took 46-51ms, now it takes 29-31ms ~60% faster. The emulator now runs ~40% faster

### 3.2.0 (2026-03-05)

**Major Feature: Universal Polling Function Support**

- **Enhanced `fn` flexibility** — `PollingManager` now supports any type of function as a task: synchronous arrow functions, multi-line logic blocks, and standard asynchronous functions.
- **Removed strict Promise requirement** — The execution engine no longer requires `fn` to explicitly return a `Promise`. Synchronous code (like `console.log` or local variable manipulations) now executes correctly within the polling cycle without throwing validation errors.
- **Improved Type Definitions** — Updated `PollingTaskOptions` and `TaskController` signatures to accept `() => unknown | Promise<unknown>`, providing better IDE support for both sync and async tasks.

**Improvements & Fixes:**

- **Robust Task Validation** — Rewritten `_validateTaskOptions` logic to perform deep validation of the `fn` parameter. If an array of functions is provided, the manager now verifies every single element to ensure it is a valid function before starting the task.
- **Execution Safety** — Internal task runner now wraps all calls in `Promise.resolve()`, ensuring that even functions returning `undefined` or non-promise values are handled gracefully by the timeout and retry logic.
- **Arrow Function Support** — Explicitly tested and optimized for arrow functions with multi-line blocks, allowing complex logic directly within the task definition.

### 3.1.2 (2026-03-03)

**Major Features:**

- **Dynamic Slave ID Change** - full runtime support for changing a device's Modbus address without recreating the `ModbusClient` instance or reconnecting the transport
- Added `setSlaveId(newSlaveId: number): Promise<void>` method to `ModbusClient` - immediately updates the slave ID used for all subsequent requests.
- Added read-only `currentSlaveId: number` property - returns the currently active slave ID (useful in polling callbacks, logging, and diagnostics).
- Recommended workflow after device address change: call `setSlaveId()`, update `TransportController` routing (`removeSlaveIdFromTransport` + `assignSlaveIdToTransport`), and **recreate polling tasks** for reliability.

**Improvements & Fixes:**

- Polling tasks can now be safely recreated after slave ID changes using `removePollingTask` + `createPollingTask` with the new ID.
- Improved RS-485 stability: enforced minimum inter-frame delay (30-50 ms) between polling cycles and manual requests to prevent collisions on multi-device buses.
- Enhanced logging context: `currentSlaveId` is now automatically included in all request/response logs when changed.
- Documentation update: added detailed "Dynamic Slave ID Change" section with full example workflow.

### 3.0.1 (2026-01-14)

- Fixed an issue with the **Device Connection Tracker**. Now everything works as it did before the `3.0.0` update.

### 3.0.0 (2026-01-13)

- **Improved:** The `add Transport`, `remove Transport`, `reload Transport` and `destroy` methods in the **TransportController** module are now mutex protected.
- **Improved:** Updated typing of the **TransportController** module in the `src/transport/transport-controller.d.ts` file
- **Major Feature:** Added full **Modbus TCP** support for both Node.js and Web (WebSocket proxy).
- **Architecture Overhaul:** Introduced `ModbusFramer` and `ModbusProtocol` layers.
- **Performance Optimization:** Eliminated redundant framing checks in the main execution loop (Zero-Branching logic).
- **Improved Reliability:** Implemented an intelligent stream reading loop in `ModbusProtocol` that waits for complete/valid packets. This fixes CRC errors on variable-length responses.
- **Encapsulation:** Transaction ID management moved entirely to `TcpFramer`.
- **Breaking Change:** Internal methods `_readPacket` and `_getExpectedResponseLength` removed from `ModbusClient`.
- **Bug Fix:** Fixed plugin support for custom functions with dynamic response lengths (e.g., file/archive reading).
