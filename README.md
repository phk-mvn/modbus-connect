![banner](assets/logo.png)

# modbus-connect

[![npm version](https://img.shields.io/npm/v/modbus-connect)](https://www.npmjs.com/package/modbus-connect)
[![js-standart-style](https://img.shields.io/badge/code%20style-standart-brightgreen.svg?style=flat)](https://standartjs.com/)
[![License MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensources.org/licenses/MIT)

modbus-connect is a [cross-platform]() library for Modbus RTU/TCP communication in both Node.js and modern browsers

## Features

- **Isomorphism**: Works in Node.js and modern browsers
- **Security (Mutex)**: Eliminates collisions between background polling and manual commands
- **Polling Manager**: A queue of tasks with priorities, delays and exponential backoff
- **Smart reconnect**: Automatic connection recovery for Serial and TCP/IP
- **Emulator**: Full-fiedged TCP-slave and RTU-slave for testing without hardware
- **Auto Discovery (Scanner)**: Ultra-fast device discovery with adaptive mathematical timeouts and parallel TCP scanning.

## Documentation

- [Usage example ⇗](#usage-example)
- [Transport Controller ⇗](#transport-controller)
- [Modbus Client ⇗](#modbus-client)
- [Polling Manager ⇗](#polling-manager)
- [Emulator's ⇗](#emulators)
- [Modbus Scanner ⇗](#modbus-scanner)
- [Types ⇗](#types)
- [Error's ⇗](#errors)
- [Changelog ⇗](#changelog)

## Install

Using NPM:

```
$ npm install modbus-connect
```

Using YARN:

```
$ yarn add modbus-connect
```

## Usage

```js
// Types library
import { _type_ } from 'modbus-connect/types';

// Main Modbus Client
import ModbusClient from 'modbus-client/client';

// Transport Controller for managing connections
import TransportController from 'modbus-connect/transport';
```

## Node RTU connection Example

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
[14:20:01] INFO: [Transport Controller] Transport "TEST_RTU" connected
[14:20:01] INFO: [Polling Manager] Task added -> task-read-holding-registers
[ [ 1024, 2048 ] ]
[14:20:02] INFO: [ModbusClient][ID:92] Response received 45ms
[ [ 1024, 2048 ] ]
[14:20:03] INFO: [ModbusClient][ID:92] Response received 42ms
...
```

## Node TCP connection Example

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

## Web RTU (browser) connection Example

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
...
```

## Emulator Node RTU / TCP connection

```js
import TransportController from 'modbus-connect/transport';
import ModbusClient from 'modbus-connect/client';

const SLAVE_ID = 92;
const TRANSPORT_ID = 'TEST_TCP';

async function main() {
  const controller = new TransportController();
  await controller.addTransport(
    'emulator-1',
    'rtu-emulator', // or 'tcp-emulator'
    {
      slaveId: 1,
      responseLatencyMs: 30,
      initialRegisters: {
        holding: [
          { start: 100, value: 1234 },
          { start: 101, value: 5678 },
        ],
        coils: [{ start: 0, value: true }],
      },
    }
  );

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

<br>

# <span id="transport-controller">TransportController</span>

The `TransportController` is the central link of the library that manages the lifecycle of all connections (Node.js Serial, WebSerial, TCP, Emulators). It is responsible for routing Modbus requests to the required ports, load balancing, device health monitoring, and background polling management.

## Subtleties and features of the work

- **Thread Safety (Mutex)**: All operations to change the transport registry (`add`, `remove`, `reload`) are protected by an internal mutex. This eliminates "data races" with simultaneous asynchronous calls.
- **Mode Restrictions (RSMode)**:
- **RS485/ TCP/IP**: Allows you to connect an unlimited number of Slave IDs to a single transport.
  - **RS232**: Strictly limited to **one** device per port. When trying to bind a second Slave ID, the controller will throw an `RSModeConstraintError`.
- **Automatic deletion**: If you delete the last Slave ID from the transport using `removeSlaveIdFromTransport`, the controller will automatically stop and delete this transport from memory.
- **Secure Events**: When port or device events occur (connection/disconnection), the controller updates the status trackers under the mutex, but calls your callback functions outside of it. This ensures that there are no Deadlocks.

---

### **Transport management methods**

`addTransport()`

Adds and initializes a new transport. Creates a personal `PollingManager` for it.

**Example**:

```js
await controller.addTransport('RS485_BUS', 'node-rtu', {
  path: '/dev/ttyUSB0',
  baudRate: 9600,
  RSMode: 'RS485',
  slaveIds: [1, 2],
});
```

**Expected result**:

```bash
[14:00:01] INFO: [Transport Controller] Transport "RS485_BUS" added with PollingManager
```

---

`connectTransport()`

Opens a physical connection for a specific transport and starts polling tasks.

**Example**:

```js
await controller.connectTransport('RS485_BUS');
```

**Expected result**:

```bash
[14:00:02] INFO: [Node RTU] Serial port /dev/ttyUSB0 opened
[14:00:02] INFO: [Transport Controller] Transport "RS485_BUS" connected
```

---

`reloadTransport()`

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
[14:05:10] INFO: [Transport Controller] Transport "RS485_BUS" disconnected
[14:05:10] INFO: [Transport Controller] Transport "RS485_BUS" reloaded with new options
[14:05:11] INFO: [Transport Controller] Transport "RS485_BUS" connected
```

---

### **Routing control methods (Slave ID's)**

`assignSlaveIdToTransport()`

Binds an additional Slave ID to an existing transport.

**Example**:

```js
await controller.assignSlaveIdToTransport('RS485_BUS', 10);
```

**Expected result**:

```bash
[14:10:00] INFO: [Transport Controller] Assigned slaveId 10 to transport "RS485_BUS"
```

---

`removeSlaveIdFromTransport()`

Unlinks the device from the communication channel.

**Example**:

```js
// If there was only a slave 10 on the RS485_BUS transport:
await controller.removeSlaveIdFromTransport('RS485_BUS', 10);
```

**Expected result**:

```bash
[14:15:00] INFO: [Transport Controller] Removed slaveId 10 from transport "RS485_BUS"
[14:15:00] INFO: [Transport Controller] Transport "RS485_BUS" is empty. Auto-removing...
[14:15:00] INFO: [Transport Controller] Transport "RS485_BUS" disconnected
[14:15:00] INFO: [Transport Controller] Transport "RS485_BUS" fully removed and cleaned up
```

---

### **Background Polling Management (Proxy)**

`addPollingTask()`

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
[14:20:00] INFO: [Polling Manager] Task added -> read-holding
```

---

`executeImmediate()`

A method for executing extraordinary commands (for example, recording at the touch of a button). Ensures that the request does not "collide" with background polling.

**Example**:

```js
await controller.executeImmediate('RS485_BUS', async () => {
  return await client.writeSingleRegister(10, 1);
});
```

**Expected result**:

```bash
[14:22:05] INFO: [ModbusClient][ID:1] Response received 50ms
```

---

### **Diagnostics and Status**

`getStatus()`

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
    reconnectAttempts: 0
}
```

---

`getActiveTransportCount()`

Returns the number of transports that are currently successfully connected.

**Example**:

```js
console.log('Active lines:', controller.getActiveTransportCount());
```

---

### **Event tracking**

`setDeviceStateHandlerForTransport()`

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
[14:30:05] WARN: [DeviceConnectionTracker] Device 1: OFFLINE (Timeout)
[Event] Device 1 is now disabled (Modbus request timed out)
```

<br>

# <span id="modbus-client">ModbusClient</span>

`ModbusClient` is a high—level interface for communicating with Modbus devices. It manages thread safety via Mutex, implements the logic of retries, and automatically synchronizes with transports in case they are rebooted.

---

### **Constructor and Options (IModbusClientOptions)**

Constructor Parameters:

- `transportController': An instance of `TransportController` through which the client finds the desired port.
- `SlaveID`: Device address (0-255). The default is 1.
- `options`: Configuration object.

Full list of options options:

| Option       | Type                                 | Description                                                                        |
| ------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `framing`    | `'rtu'` or `'tcp'`                   | The type of encoding of the packet. The default is `rtu`.                          |
| `RSMode`     | `'RS485'` or `'RS232'` or `'TCP/IP'` | Physical layer mode. By default, it is selected based on `framing`.                |
| `timeout`    | `number`                             | Waiting time for a response from the device (ms). Default: 1000.                   |
| `retryCount` | `number`                             | How many times to repeat the request in case of a communication error. Default: 0. |
| `retryDelay` | `number`                             | Delay between retries (ms). Default: 100.                                          |
| `plugins`    | `TPluginConstructor[]`               | An array of plugin classes that will be initialized immediately.                   |

Example of initialization with all parameters:

```js
const client = new ModbusClient(controller, 122, {
  framing: 'rtu',
  RSMode: 'RS485',
  timeout: 3000,
  retryCount: 3,
  retryDelay: 500,
  plugins: [CustomPlugin],
});
```

---

### **Status management and logging methods**

`enableLogger() / disableLogger()`

Enables or completely disables logging for this client.

```js
client.disableLogger(); // There will be no more logs of this client in the console
client.enableLogger(); // Logs are being output again
```

---

`connect()`

Performs a logical check of transport availability for the given Slave ID.

```js
await client.connect();
```

**Expected result**:

```bash
[12:00:00] INFO: [ModbusClient][ID:122] Client is ready. Transport is connected and available
```

---

`disconnect()`

Logically disables the client and removes its Slave ID from the transport routes in the controller.

```js
await client.disconnect();
```

**Expected result**:

```bash
[12:00:05] INFO: [ModbusClient][ID:122] Client disconnected and unregistered from transport
```

---

`setSlaveId(newSlaveId)`

Changes the Slave ID address on the fly. All subsequent requests will be sent to the new address.

```js
await client.setSlaveId(10);
```

**Expected result**:

```bash
[12:00:10] INFO: [ModbusClient][ID:10] Slave ID changed 122 -> 10 3. Read Methods
```

---

`readCoils(startAddress, quantity, timeout?) (FC 0x01)`

Reads the values of the bit flags (Coils).

```js
const coils = await client.readCoils(0, 5);
console.log(coils);
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 45ms
[true, true, true, true, false]
```

---

``readDiscreteInputs(startAddress, quantity, timeout?) (FC 0x02)`

Reads the values of the digital inputs.

```js
const inputs = await client.readDiscreteInputs(100, 3);
console.log(inputs);
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 40ms
[true, true, false]
```

---

`readHoldingRegisters(startAddress, quantity) (FC 0x03)`

Reads the Holding registers.

```js
const regs = await client.readHoldingRegisters(10, 2);
console.log(regs);
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 55ms
[1500, 240]
```

---

`readInputRegisters(startAddress, quantity) (FC 0x04)`

Reads the Input registers.

```js
const inputs = await client.readInputRegisters(0, 1);
console.log(inputs);
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 48ms
[356]
```

---

### **Methods of writing data (Write Methods)**

`writeSingleCoil(address, value, timeout?) (FC 0x05)`

Writes one bit.

```js
const res = await client.writeSingleCoil(5, true);
console.log(res);
```

---

`writeSingleRegister(address, value, timeout?) (FC 0x06)`

Writes one 16-bit register.

```js
const res = await client.writeSingleRegister(20, 1000);
console.log(res);
```

---

`writeMultipleCoils(address, values, timeout?) (FC 0x0F)`

Records a group of bits.

```js
const res = await client.writeMultipleCoils(0, [true, false, true]);
console.log(res);
```

---

`writeMultipleRegisters(address, values, timeout?) (FC 0x10)`

Writes a group of registers.

```js
const res = await client.writeMultipleRegisters(10, [100, 200, 300]);
console.log(res); // { startAddress: 10, quantity: 3 }
```

---

### **Service and diagnostic methods**

`reportSlaveId(timeout?) (FC 0x11)`

Requests a description of the device.

```js
const info = await client.reportSlaveId();
console.log(info);
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 35ms
{ slaveId: 122, isRunning: true, data: Uint8Array(...) }
```

---

`readDeviceIdentification(decoder, timeout?) (FC 0x2B)`

Reads the device's passport data (Vendor, Model, etc.).

```js
const id = await client.readDeviceIdentification('utf-8');
console.log(id.objects);
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 110ms
{ 0: "VendorName", 1: "ProductCode", 2: "v1.0" }
```

---

### **Plugins and custom features\***

The library allows you to extend the standard Modbus with manufacturer-specific functions.

How to write a plugin correctly:

A plugin is a class that should have a name property and a customFunctionCodes object. Each function code must contain the buildRequest (PDU assembly) and parseResponse (response parsing) methods.

```js
// Example of a plugin for working with a non-standard
class MyManufacturerPlugin {
  constructor() {
    this.name = 'ManufacturerExtraFunctions';
    this.customFunctionCodes = {
      // The name of the method that we will call via executeCustomFunction
      getFirmwareHash: {
        // Creating the request body (Function Code + Data)
        buildRequest: subCode => {
          const pdu = new Uint8Array(2);
          pdu[0] = 0x64; // Custom function code
          pdu[1] = subCode; // Additional parameter
          return pdu;
        },
        // Parsing the received response PDU
        parseResponse: responsePdu => {
          // Skip the byte of the function [0] and return the data
          return responsePdu.slice(1);
        },
      },
    };
  }
}
```

**Plugin registration**:

Method A: Using the constructor (recommended)

```js
const client = new ModbusClient(controller, 1, {
  plugins: [MyManufacturerPlugin],
});
```

Method B: Using the use() method

```js
const client = new ModbusClient(controller, 1);
client.use(new MyManufacturerPlugin());
```

**Calling a custom function**:

```js
// Calling the function by the name specified in the plugin
const hash = await client.executeCustomFunction('getFirmwareHash', 0x01);
console.log('Firmware hash:', hash);
```

---

### **Getters**

`currentSlaveId`

Returns the current address of the device that the client is working with.

```js
console.log(client.currentSlaveId); // 122
```

---

### **Important Mechanisms (Under the hood)**

- `_syncProtocol()`: The client is a smart shell. Before each request, it checks whether the transport in the `TransportController` has been restarted (for example, the port path or IP has changed). If the transport is new, the client instantly updates its internal exchange logic without interrupting the program.
- **Mutex Lock**: All methods (`read`, `write`, `custom`) are protected by a single mutex. If you call 5 reading methods at the same time, they will line up in a strict queue. This ensures that packets do not get mixed up in the communication channel.
- **Retry Logic**:
  - If the device does not respond or the data is corrupted (CRC Error), the client will automatically retry (`retryCount`).
  - If the device has responded with a **Modbus Exception** (for example, Illegal Function), repeated attempts **are not performed**, as this is a logical error, not a physical failure.

<br>

# <span id="polling-manager">PollingManager</span>

`PollingManager` is a scheduler that automates polling of Modbus devices. It manages queues based on priorities, handles communication errors through a delay system, and ensures that background tasks do not conflict with manual commands.

---

### **Configuration (IPollingManagerConfig)**

These parameters are set when creating the manager and are applied to all tasks by default.

| Parameter             | Type     | Description                                                    |
| --------------------- | -------- | -------------------------------------------------------------- |
| `defaultMaxRetries`   | `number` | Number of attempts in case of failure (default: 3).            |
| `defaultBackoffDelay` | `number` | Base delay between attempts in ms (default: 1000).             |
| `defaultTaskTimeout`  | `number` | The timeout of one operation in ms (default: 5000).            |
| `interTaskDelay`      | `number` | Pause between different tasks in the queue in ms (default: 0). |

---

### **Task registration (addTask)**

The `addTask` method accepts an `IPollingTaskOptions` object. All possible parameters are shown here.

```js
manager.addTask({
  // Basic settings
  id: 'main-sensor-poll',
  name: 'Temperature sensor query',
  priority: 10, // High priority (0 - low)
  interval: 2000, // Every 2 seconds
  fn: [
    // Array of functions (executed in turn)
    async () => await client.readHoldingRegisters(0, 2),
    async () => await client.readHoldingRegisters(10, 1),
  ],
  immediate: true, // Start immediately when adding
  shouldRun: () => true, // Check before each cycle (should I run?)

  // Redefining the retray settings for this specific task
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
  onError: (err, idx, count) => console.error(`>>> Function ${idx} failed after ${count} attempts'),
  onFinish: (success, results) => console.log('>>> Iteration completed. Success:', success),
});
```

**Expected result**:

```bash
[10:00:00] INFO: [Polling Manager] Task added -> main-sensor-poll
>>> The task is running
[10:00:00] DEBUG: [Task][taskId:main-sensor-poll] Executing task
>>> Preparing for the request...
[10:00:00] INFO: [ModbusClient][ID:1] Response received 50ms
>>> Raw data received: [[123, 456], [1]]
>>> Cycle completed successfully: [[123, 456], [1]]
>>> The iteration is completed. Success: true
```

---

### **PollingManager Method Reference**

`updateTask(id, newOptions)`

Updates any task option and restarts it.

```js
manager.updateTask('main-sensor-poll', {
  interval: 5000,
  priority: 100,
  maxRetries: 5,
});
```

**Expected result**:

```bash
[10:05:00] INFO: [Task][taskId:main-sensor-poll] Task stopped
[10:05:00] INFO: [Polling Manager] Task removed
[10:05:00] INFO: [Polling Manager] Task added -> main-sensor-poll
```

---

`removeTask(id)`

Complete removal task from the system.

```js
manager.removeTask('main-sensor-poll');
```

**Expected result**:

```bash
[10:10:00] INFO: [Task][taskId:main-sensor-poll] Task stopped
[10:10:00] INFO: [Polling Manager] Task removed
```

---

`pauseTask(id) / resumeTask(id)`

Temporary stop of execution. The task remains in memory.

```js
manager.pauseTask('main-sensor-poll');
manager.resumeTask('main-sensor-poll');
```

**Expected result**:

```bash
[10:15:00] INFO: [Task][taskId:main-sensor-poll] Task paused
[10:15:05] INFO: [Task][taskId:main-sensor-poll] Task resumed
```

---

`restartTask(id)`

Instant restart of task timers.

```js
manager.restartTask('main-sensor-poll');
```

**Expected result**:

```bash
[10:20:00] INFO: [Task][taskId:main-sensor-poll] Task stopped
[10:20:00] DEBUG: [Task][taskId:main-sensor-poll] Task started
```

---

`setTaskInterval(id, interval)`

Changing the polling frequency without restarting the entire task.

```js
manager.setTaskInterval('main-sensor-poll', 1000);
```

**Expected result**:

```bash
[10:25:00] INFO: [Task][taskId:main-sensor-poll] Interval updated
```

---

`executeImmediate(fn)`

Executes asynchronous code (for example, writing) by capturing Mutex. The polling queue will freeze until the function is executed.

```js
const result = await manager.executeImmediate(async () => {
  return await client.writeSingleRegister(100, 255);
});
```

**Expected result**:

```bash
[10:30:00] INFO: [ModbusClient][ID:1] Response received 40ms
```

---

`getQueueInfo()`

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
    ]
}
```

---

`getSystemStats()`

```js
console.log(manager.getSystemStats());
```

**Expected result**:

```bash
{ totalTasks: 1, totalQueues: 1, queuedTasks: 0 }
```

---

`clearAll()`

Full stop and clean up.

```js
manager.clearAll();
```

**Expected result**:

```bash
[10:40:00] INFO: [Polling Manager] Clearing all tasks
[10:40:00] INFO: [Task][taskId:main-sensor-poll] Task stopped
[10:40:00] INFO: [Polling Manager] All tasks cleared
```

---

`disableAllLoggers()`

```js
manager.disableAllLoggers(); // Sets the 'silent' level for a total of 4. Bulk Management (Bulk Methods)
```

---

| Method              | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `startAllTasks()`   | Starts all tasks that were in the stopped state.                              |
| `stopAllTasks()`    | Stops all tasks and clears the queue.                                         |
| `pauseAllTasks()`   | Puts all tasks in paused mode (timers are running, but no requests are made). |
| `resumeAllTasks()`  | Unpauses all tasks and starts the queue processing loop.                      |
| `restartAllTasks()` | Calls stop and start for each task sequentially.                              |

---

### **Important technical details**

- **Mutex Lock**: The `_processQueue` background loop always uses `this.mutex.runExclusive`. This ensures that if you use `executeImmediate`, your bytes won't get mixed up with the polled bytes.
- **FIFO + Priority**: The queue is sorted by priority. If tasks have the same priority, they are executed in the order they arrive (First-In-First-Out).
- **Zombie Task Protection**: If you call `removeTask` while waiting for a response from the device (e.g., 2 seconds), the manager will intercept the response but will not call the `onData` callback, preventing the processing of stale data. - **CPU Safety**: Between tasks in the queue, the manager takes a micro-pause using `setImmediate` (or `setTimeout(0)`) to avoid blocking the Event Loop and allow the application to process other asynchronous events.

<br>

# <span id="emulators">Modbus Emulators (RTU & TCP)</span>

Emulators allow you to simulate real Modbus devices directly in your code. They support four memory areas (Coils, Discrete Inputs, Holding Registers, Input Registers), can simulate network delays, errors (Exceptions), and automatically change data (sensor simulation).

### **Adding an Emulator to the Controller**

Emulators are registered as regular transports using `addTransport`.

**Options for `rtu-emulator` and `tcp-emulator`**:

| Option              | Type       | Description                                                      |
| ------------------- | ---------- | ---------------------------------------------------------------- |
| `slaveId`           | `number`   | Modbus Unit ID of the emulator (0-247). Defaults to 1.           |
| `responseLatencyMs` | `number`   | Artificial response delay in ms (simulates line speed).          |
| `initialRegisters`  | `object`   | An object with initial data for memory.                          |
| `slaveIds`          | `number[]` | List of IDs that the controller should forward to this emulator. |
| `RSMode`            | `string`   | For `tcp-emulator` only: operating mode (default: 'TCP/IP').     |

**Example of creating an RTU emulator**:

```js
const TransportController = require('modbus-connect/transport');
const controller = new TransportController();

await controller.addTransport('SIM_RTU', 'rtu-emulator', {
  slaveId: 122,
  responseLatencyMs: 50,
  initialRegisters: {
    holding: [{ start: 0, value: 1500 }],
    coils: [{ start: 5, value: true }],
  },
  slaveIds: [122],
});
```

**Example of creating a TCP emulator**:

```js
await controller.addTransport('SIM_TCP', 'tcp-emulator', {
  slaveId: 1,
  responseLatencyMs: 10,
  RSMode: 'TCP/IP',
  initialRegisters: {
    input: [{ start: 100, value: 366 }],
  },
  slaveIds: [1],
});
```

**Expected result**:

```bash
[10:00:00] INFO: [ModbusSlaveCore] ModbusSlaveCore initialized successfully (Slave ID: 122)
[10:00:00] INFO: [Transport Controller] Transport "SIM_RTU" added with PollingManager
```

### **Emulator Data Management\***

To interact with the emulator's internal memory and behavior, you must access its core via the transport's `getCore()` method.

`addRegisters(definitions)`

Allows you to bulk add or update data in memory.

```js
const emu = controller.getTransport('SIM_RTU');
const core = emu.getCore();

core.addRegisters({
  coils: [
    { start: 0, value: true },
    { start: 1, value: false },
  ],
  discrete: [{ start: 10, value: true }],
  holding: [
    { start: 0, value: 100 },
    { start: 100, value: 2500 },
  ],
  input: [{ start: 50, value: 36.6 }],
});
```

**Expected result**:

```bash
[10:05:00] INFO: [ModbusSlaveCore] Registers added successfully: {"coils":2,"discrete":1,"holding":2,"input":1}
```

---

`infinityChange(options)`

Starts automatic register value change. This is the perfect tool for simulating temperature, pressure, and other sensors.

| Parameter      | Type         | Description                                     |
| -------------- | ------------ | ----------------------------------------------- |
| `typeRegister` | `string`     | Type: 'Holding', 'Input', 'Coil', 'Discrete'.   |
| `register`     | `number`     | Register address.                               |
| `range`        | `[min, max]` | Random value range (ignored for Coil/Discrete). |
| `interval`     | `number`     | Value update period in milliseconds.            |

**Example**:

```js
core.infinityChange({
  typeRegister: 'Holding',
  register: 0,
  range: [100, 200], // The value will randomly jump from 100 to 200
  interval: 1000, // Update every second
});
```

**Expected result**:

```bash
[10:10:00] INFO: [ModbusSlaveCore] Infinity change started for Holding[0] (interval: 1000ms)
[10:10:01] DEBUG: [ModbusSlaveCore] Infinity change: Holding[0] = 142
[10:10:02] DEBUG: [ModbusSlaveCore] Infinity change: Holding[0] = 187
```

---

`stopInfinityChange(options)`

Stops data generation

```js
core.stopInfinityChange({
  typeRegister: 'Holding',
  register: 0,
});
```

**Expected result**:

```bash
[10:15:00] DEBUG: [ModbusSlaveCore] Infinity change stopped for Holding:0
```

---

`setException(functionCode, address, exceptionCode)`

Simulates a device error for a specific address and function. Allows you to test how your application handles hardware failures.

- `functionCode`: Function code (e.g. `0x03`).
- `address`: Address.
- `exceptionCode`: Error code (0x01 — Illegal Function, 0x02 — Illegal Data Address, etc.).

**Example**:

```js
// When attempting to read Holding Register 10, return the error "Illegal Data Address"
core.setException(0x03, 10, 0x02);
```

**Expected result (when requested by the client)**:

```bash
[10:20:00] WARN: [ModbusSlaveCore] Throwing exception for function 0x3 at address 10: code 0x2
```

---

`clearAll()`

Full clear: removes all data from tables, resets all errors, and stops all infinityChange tasks.

```js
core.clearAll();
```

**Expected result**:

```bash
[10:25:00] INFO: [ModbusSlaveCore] All registers, exceptions and infinity tasks cleared
```

---

### **Full example: Emulator + Client + Polling**

```js
const TransportController = require('modbus-connect/transport');
const ModbusClient = require('modbus-connect/client');

async function startSystem() {
  const controller = new TransportController();

  // 1. Create and connect the emulator
  await controller.addTransport('DEVICE_SIM', 'rtu-emulator', {
    slaveId: 10,
    responseLatencyMs: 20,
    slaveIds: [10],
  });
  await controller.connectTransport('DEVICE_SIM');

  // 2. Set up dynamic data
  const core = controller.getTransport('DEVICE_SIM').getCore();
  core.infinityChange({
    typeRegister: 'Holding',
    register: 1,
    range: [30, 40],
    interval: 1000,
  });

  // 3. Create a client to work with this emulator
  const client = new ModbusClient(controller, 10, {
    framing: 'rtu',
    timeout: 1000,
  });

  // 4. Start the poll
  controller.addPollingTask('DEVICE_SIM', {
    id: 'poll-emulator',
    interval: 2000,
    fn: () => client.readHoldingRegisters(1, 1),
    onData: val => console.log('Value from the emulator:', val),
  });
}

startSystem();
```

**Expected result**:

```bash
[12:00:00] INFO: [ModbusSlaveCore] ModbusSlaveCore initialized successfully (Slave ID: 10)
[12:00:00] INFO: [RTU Emulator] RTU Emulator connected
[12:00:00] INFO: [ModbusSlaveCore] Infinity change started for Holding[1] (interval: 1000ms)
[12:00:00] INFO: [Polling Manager] Task added -> poll-emulator
[12:00:02] INFO: [ModbusClient][ID:10] Response received 22ms
Value from emulator: [34]
```

<br>

# <span id="modbus-scanner">Modbus Scanner</span>

The `ModbusScanner` is a high-performance tool built into the `TransportController` that allows you to discover Modbus devices on a line or network without knowing their exact settings.

### **Key Features**

- **Adaptive Turbo Mode**: Automatically calculates the minimum physical timeout based on the Baud Rate. (e.g., ~14ms for 115200 baud).
- **Isomorphic RTU Scanning**: Automatically detects if you are in Node.js or a Browser environment.
- **High-Concurrency TCP Scanning**: Scans multiple Unit IDs in parallel (up to 50 at once).
- **Lifecycle Control**: Ability to pause, resume, or stop the scanning process programmatically.

---

### **Callback System**

The scanner uses a reactive callback system to provide real-time feedback, making it ideal for building smooth User Interfaces.

- `onDeviceFound(device)`: Triggered immediately when a device is verified. You can use this to populate a list in your UI as the scan progresses.
- `onProgress(current, total, info)`: Triggered on every request attempt.
  - `current`: Current attempt index.
  - `total`: Total planned attempts.
  - `info`: Object containing current scan parameters (`baud`, `parity`, `slaveId`).
- `onFinish(results)`: Triggered when the entire scan process is complete. Returns an array of all discovered IScanResult objects.

---

### **Scanning Options (`IScanOptions`)**

| Property          | Type               | Description                                                                  |
| ----------------- | ------------------ | ---------------------------------------------------------------------------- |
| `path`            | `string or object` | Serial port path (Node) or SerialPort object (Web).                          |
| `bauds`           | `number[]`         | List of baud rates to check. Default: `[115200, 57600, 38400, 19200, 9600]`. |
| `parities`        | `TParityType[]`    | List of parities to check. Default: `['none', 'even', 'odd']`.               |
| `slaveIds`        | `number[]`         | Range of Slave IDs to check (1-247).                                         |
| `registerAddress` | `number`           | The register address to read for verification. Default: `0`.                 |
| `controller`      | `ScanController`   | An instance of `ScanController` to manage the scan externally.               |

---

### **Scanning Methods**

`scanRtuPort(options)`

This method iterates through the matrix of Baud Rates and Parities. Once a device is found, it "locks" the port settings and quickly scans the remaining Slave IDs.

**Example**:

```js
const results = await controller.scanRtuPort({
  path: '/dev/ttyUSB0', // In Browser, pass the port object here
  bauds: [9600, 115200],
  slaveIds: Array.from({ length: 247 }, (_, i) => i + 1),

  onDeviceFound: device => {
    console.log(`✨ New device discovered! ID: ${device.slaveId}`);
  },

  onProgress: (current, total, info) => {
    // Smooth progress update for UI
    const percent = Math.round((current / total) * 100);
    process.stdout.write(`Scanning ${info.baud}bps | ID: ${info.slaveId} [${percent}%]\r`);
  },

  onFinish: allDevices => {
    console.log(`\nScan complete. Total devices found: ${allDevices.length}`);
  },
});
```

---

`scanTcpPort(options)`

Uses high-concurrency parallel requests to map a TCP gateway or a subnetwork.

**Example**:

```js
const tcpDevices = await controller.scanTcpPort({
  hosts: ['192.168.1.100'], // Scan devices behind this gateway
  ports: [502],
  unitIds: Array.from({ length: 255 }, (_, i) => i + 1), // Check all possible Unit IDs

  onDeviceFound: device => {
    console.log(`✅ Found TCP Unit: ${device.slaveId} at ${device.host}`);
  },

  onFinish: results => {
    // Process final list
    saveDevicesToDatabase(results);
  },
});
```

---

### **Scanner Control**

If you need to manage the scan process (e.g., from a UI), use these methods:

| Method         | Description                                              |
| -------------- | -------------------------------------------------------- |
| `pauseScan()`  | Suspends the current scan at the next iteration.         |
| `resumeScan()` | Resumes a previously paused scan.                        |
| `stopScan()`   | Immediately stops the scan and releases the port/socket. |

---

Scan Result Interface (`IScanResult`)

```ts
{
  type: 'node-rtu' | 'web-rtu' | 'node-tcp';
  slaveId: number;     // The Modbus address found
  baudRate?: number;   // (RTU only) The working baud rate
  parity?: string;     // (RTU only) none, even, or odd
  stopBits?: number;   // (RTU only) 1 or 2
  port?: string | any; // The physical port identifier
  host?: string;       // (TCP only) The device IP
  tcpPort?: number;    // (TCP only) The device Port
}
```

<br>

# <span id="types">Types and Interfaces</span>

All interactions in the library are strongly typed. The interfaces are divided into logical blocks: Client, Transport, Polling Manager, and Emulation.

### **Modbus Client API**

`IModbusClient`

The primary interface for high-level operations.

| Method                                         | Description                                                     |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `readHoldingRegisters(start, qty)`             | Reads holding registers (FC 0x03). Returns `Promise<number[]>`. |
| `readInputRegisters(start, qty)`               | Reads input registers (FC 0x04). Returns `Promise<number[]>`.   |
| `writeSingleRegister(addr, val, timeout?)`     | Write a single register (FC 0x06).                              |
| `writeMultipleRegisters(addr, vals, timeout?)` | Write a group of registers (FC 0x10).                           |
| `readCoils(start, qty, timeout?)`              | Reads coils (FC 0x01). Returns boolean[].                       |
| `readDiscreteInputs(start, qty, timeout?)`     | Reads discrete inputs (FC 0x02).                                |
| `writeSingleCoil(addr, val, timeout?)`         | Writes a single bit (FC 0x05).                                  |
| `writeMultipleCoils(addr, vals, timeout?)`     | Writes a group of bits (FC 0x0F).                               |
| `reportSlaveId(timeout?)`                      | Reports the device ID (FC 0x11).                                |
| `readDeviceIdentification(decoder, timeout?)`  | Reads the device ID (FC 0x2B).                                  |
| `executeCustomFunction(name, ...args)`         | Calls a plugin function.                                        |
| `setSlaveId(newId)`                            | Changes the device address for the client.                      |
| `connect() / disconnect()`                     | Logical state management.                                       |
| `enableLogger() / disableLogger()`             | Logging control.                                                |
| `IModbusClientOptions`                         | (Constructor options)                                           |

```ts
{
    framing?: 'rtu' | 'tcp'; // Packet type
    RSMode?: 'RS485' | 'RS232' | 'TCP/IP'; // Physical mode
    timeout?: number; // Request timeout (ms)
    retryCount?: number; // Number of retries if communication error occurs
    retryDelay?: number; // Delay between retries (ms)
    echoEnabled?: boolean; // Clear echo bytes (for RS485)
    plugins?: TPluginConstructor[]; // List of plugin classes
}
```

---

### **Transport Layer**

`ITransportController`

Central manager of all connections.

- `addTransport(id, type, options, reconnect?, polling?)`: Register a new channel.
- `reloadTransport(id, options)`: Hot-swapping port settings.
- `removeTransport(id)`: Complete removal.
- `getTransportForSlave(slaveId, requiredRSMode)`: Search for a transport by route.
- `assignSlaveIdToTransport(transportId, slaveId)`: Bind a device to a port.
- `setLoadBalancer(strategy)`: Select a strategy (`'round-robin' | 'sticky' | 'first-available'`).

---

`ITransport` (Common Port Interface)

Any transport (Serial, TCP, WebSerial) must implement these methods:

- `write(buffer)`: Send bytes.
- `read(length, timeout)`: Read bytes.
- `flush()`: Clear the buffer.
- `getRSMode()`: Returns the current operating mode.

---

`EConnectionErrorType` (Error Enumeration)

Used in trackers to classify problems:

- `PortClosed`: The physical port is closed.
- `Timeout`: The device did not respond.
- `CRCError`: Checksum error.
- `ConnectionLost`: Connection lost.
- `MaxReconnect`: The recovery attempt limit has been exceeded.

---

### **Polling Manager (Polling automation)**

`IPollingManagerConfig` (Global settings)

```ts
{
    defaultMaxRetries?: number; // Default retries
    defaultBackoffDelay?: number; // Backoff delay
    defaultTaskTimeout?: number; // Task execution timeout
    interTaskDelay?: number; // Pause between tasks in the queue
    logLevel?: string; // Log level
}
```

`IPollingTaskOptions` (Specific task settings)

```ts
{
    id: string; // Unique task ID
    priority?: number; // Priority (the higher the priority, the earlier in the queue)
    interval: number; // Execution frequency (ms)
    fn: Function | Function[]; // Modbus requests
    onData?: (data) => void; // Success data callback
    onError?: (err, idx, retry) => void; // Error of a specific function
    onFailure?: (err) => void; // Final task failure
    shouldRun?: () => boolean; // Start condition
    immediate?: boolean; // Whether to run immediately
}
```

---

### **Connection Trackers (State Tracking)**

`IDeviceConnectionTracker` (Slave Device Status)

- `notifyConnected(slaveId)`: Marks the device as "Online".
- `notifyDisconnected(slaveId, error, message)`: Triggers a debounce.
- `getConnectedSlaveIds()`: Returns a list of all live Slave IDs.

`IPortConnectionTracker` (Physical port status)

`notifyConnected(slaveIds[])`: The port is open.
`notifyDisconnected(error, message, slaveIds[])`: The port has failed.
`isConnected()`: Line status.

---

### **Emulator API**

`IModbusSlaveCoreEmulator` (Emulator core)

If you're writing your own emulator, it must support:

- `addRegisters(definitions)`: Filling memory with data.
- `infinityChange(params)`: Starting a cyclic change of values.
- `setException(fc, addr, code)`: Setting up hardware error simulation.
- `processRequest(unitId, pdu)`: Processing incoming packets.

---

### `Type Usage Examples (TypeScript)`

Creating a plugin based on interfaces:

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

**Processing status via the status interface**:

```ts
import { ITransportStatus } from 'modbus-connect/types';

const status: ITransportStatus = controller.getStatus('COM1') as ITransportStatus;
if (status.connected) {
  console.log(`Transport ${status.id} online. Uptime: ${status.uptime}ms`);
}
```

<br>

# <span id="errors">Error Reference</span>

All custom errors in the library inherit from the `ModbusError` base class, which in turn extends the standard JavaScript `Error`.

### **Basic and system protocol errors**

| Error class                    | Description and cause                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `ModbusError`                  | Base class for all library errors.                                                                  |
| `ModbusTimeoutError`           | Request timeout. The device did not respond within the timeout period.                              |
| `ModbusCRCError`               | Checksum (RTU) error. The received packet is corrupted (CRC16 error).                               |
| `ModbusResponseError`          | Base class for all errors related to invalid responses.                                             |
| `ModbusTooManyEmptyReadsError` | Too many empty reads in a row. Indicates a dead connection.                                         |
| `ModbusExceptionError`         | Modbus Exception. Logical error returned by the device (contains the function code and error code). |
| `ModbusFlushError`             | The operation was aborted due to flushing (flush) of the transport's internal buffer.               |

### **Data Validation Errors**

| Error Class                         | Description and Cause                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `ModbusInvalidAddressError`         | An address outside the 1-255 range for Slave ID or an invalid register address was specified. |
| `ModbusInvalidFunctionCodeError`    | Using a function code not supported by the standard or plugins.                               |
| `ModbusInvalidQuantityError`        | Attempt to read/write more or less data than allowed (e.g., > 125 registers).                 |
| `ModbusIllegalDataAddressError`     | Exception 0x02. Attempt to access a non-existent address in device memory.                    |
| `ModbusIllegalDataValueError`       | Exception 0x03. A value was transmitted that the device cannot accept.                        |
| `ModbusSlaveBusyError`              | Exception 0x06. The device is busy and cannot process the request at this time.               |
| `ModbusAcknowledgeError`            | Exception 0x05. The request has been accepted, but will take a long time to complete.         |
| `ModbusSlaveDeviceFailureError`     | Exception 0x04. A fatal error (crash) has occurred within the slave device.                   |
| `ModbusInvalidStartingAddressError` | An attempt was made to start an operation from an invalid base address.                       |

### **Frame format and parsing errors**

| Error class                         | Description and cause                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ModbusMalformedFrameError`         | A packet was received whose structure does not comply with the Modbus standard.                        |
| `ModbusInvalidFrameLengthError`     | The length of the received response does not match the expected length for this function code.         |
| `ModbusInvalidTransactionIdError`   | TCP. The Transaction ID in the response did not match the one sent.                                    |
| `ModbusUnexpectedFunctionCodeError` | The function code in the response differs from the code in the request (and this is not an Exception). |
| `ModbusSyncError`                   | Loss of frame synchronization (missing start/end markers).                                             |
| `ModbusFrameBoundaryError`          | Violation of data frame boundaries while reading from the stream.                                      |

### **Connection and transport errors**

| Error Class                    | Description and Cause                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `ModbusConnectionRefusedError` | TCP. The remote server actively rejected the connection attempt.                 |
| `ModbusConnectionTimeoutError` | TCP. The TCP connection establishment timed out.                                 |
| `ModbusNotConnectedError`      | Attempting to fulfill a request when the transport is closed or not initialized. |
| `ModbusAlreadyConnectedError`  | Attempting to call connect() while the connection is already active.             |
| `ModbusBufferOverflowError`    | Incoming data exceeded maxBufferSize.                                            |
| `ModbusInsufficientDataError`  | Too few bytes were received to complete packet parsing.                          |
| `ModbusBufferUnderrunError`    | Attempting to read more bytes than are physically available in the buffer.       |

### **Physical Layer Errors**

| Error Class            | Description and Cause                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `ModbusParityError`    | Parity error (incorrect Parity settings on one of the nodes).                  |
| `ModbusCollisionError` | A collision was detected (simultaneous transmission on a half-duplex channel). |
| `ModbusNoiseError`     | Data on the channel is corrupted by electrical interference or noise.          |
| `ModbusOverrunError`   | Data is arriving faster than the hardware buffer can handle it.                |
| `ModbusFramingError`   | UART framing error (usually due to a BaudRate or Stop bit mismatch).           |
| `ModbusLRCError`       | Longitudinal Redundancy Check Error (for ASCII mode).                          |
| `ModbusChecksumError`  | General error of any packet checksum.                                          |

### **Gateway Errors and Advanced Exceptions**

| Error Class                         | Description and Cause                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `ModbusGatewayPathUnavailableError` | Exception 0x0A. The gateway cannot route to the end device.                        |
| `ModbusGatewayTargetDeviceError`    | Exception 0x0B. The gateway did not wait for a response from the device behind it. |
| `ModbusGatewayBusyError`            | The gateway is overloaded and cannot accept a new request.                         |
| `ModbusMemoryParityError`           | Exception 0x08. Parity error reading from device memory.                           |
| `ModbusMemoryError`                 | General internal error accessing device memory.                                    |
| `ModbusDataOverrunError`            | Data overflow while processing a request.                                          |
| `ModbusStackOverflowError`          | Internal stack overflow during low-level operations.                               |

### **Timing and broadcast errors**

| Error Class                    | Description and Cause                                                    |
| ------------------------------ | ------------------------------------------------------------------------ |
| `ModbusInterFrameTimeoutError` | The allowed pause between bytes within a single frame was exceeded.      |
| `ModbusSilentIntervalError`    | Violation of the 3.5 character silent interval in Modbus RTU.            |
| `ModbusBaudRateError`          | Error related to a mismatch between the actual and specified baud rates. |
| `ModbusBroadcastError`         | Error attempting to perform a broadcast request (Slave ID 0).            |
| `ModbusConfigError`            | Error in the Modbus stack configuration parameters.                      |
| `ModbusDataConversionError`    | Unable to convert data to the required type (e.g., Buffer -> String).    |

### **Implementation-Specific Errors (Node/Web)**

**Web Serial Transport**:

- `TransportError`: Base class for transport failures.
- `WebSerialTransportError`: Web Serial API-level error.
- `WebSerialConnectionError`: Failed to open port in browser.
- `WebSerialReadError`: Web Serial read stream failed.
- `WebSerialWriteError`: Web Serial write stream failed.

**Node Serial Transport**:

- `NodeSerialTransportError`: Base class for Node.js Serial errors.
- `NodeSerialConnectionError`: Port not found or used by another process.
- `NodeSerialReadError`: Physical port read error in Node.js.
- `NodeSerialWriteError`: Physical write or `drain` method error.

### **PollingManager Errors**

| Error Class                     | Description and Cause                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| `PollingManagerError`           | General polling manager error.                                       |
| `PollingTaskAlreadyExistsError` | Attempt to add a task with an existing ID.                           |
| `PollingTaskNotFoundError`      | Attempt to manage a task that is not in the list.                    |
| `PollingTaskValidationError`    | Error in task parameters (invalid interval, missing function).       |
| `RSModeConstraintError`         | Violation of mode rules (e.g., attempt to add two devices to RS232). |

<br>

# <span id="changelog">Changelog</span>

### 4.1.0 (2026-04-11)

- Major Feature: High-Performance Modbus Scanner
  - **Ultra-Fast RTU Scanning**: Introduced a new algorithm that uses mathematical formulas `(264000 / baud + 5)` to calculate the absolute minimum physical timeout for each speed.
  - **Scan Lifecycle Management**: Added `pauseScan()`, `resumeScan()`, and `stopScan()` methods to `TransportController` for granular control.
  - **Smart Filtering**: The scanner now automatically filters duplicate devices if they respond across different parity settings on short lines.
  - **Enhanced Progress Tracking**: `onProgress` callback now provides real-time metadata (current baud, parity, and slave ID).

### 4.0.8 (2026-04-09)

- TransportController Stability & Concurrency Update
  - **Deadlock Prevention**: Fixed a critical issue where `removeTransport` and `reloadTransport` could hang indefinitely. Internal event handlers are now forcibly unbound before disconnection to prevent re-entry into the non-reentrant `_registryMutex`.
  - **Race Condition Protection**: State handlers for ports and devices now use `_registryMutex.runExclusive`, ensuring the transport registry remains consistent during asynchronous updates.
  - **Thread-safe Routing**: Added mutex protection to the `assignSlaveIdToTransport` method to prevent routing map corruption during simultaneous configuration changes.
  - **Callback Isolation**: External user-defined handlers are now executed outside of mutex blocks, allowing users to safely call controller methods (e.g., getStatus) within callbacks.
  - **Memory Leak Prevention**: Enhanced removeTransport to fully clear all internal maps, including trackers and local handler references.
  - **Robustness**: All external handler calls are now wrapped in try-catch blocks to prevent third-party code errors from interrupting the controller's lifecycle.

- PollingManager Performance & Logic Fixes
  - **Mutex Synchronization**: The polling queue and `executeImmediate` method now share the same mutex. This eliminates **packet collisions** by ensuring only one request is active on the line at any time.
  - **Zombie Task Protection**: Enforced strict state checks (stopped/paused) after every await operation. Tasks now terminate immediately upon removal, even if a request was already in progress.
  - **Data Leak Prevention**: Implemented final state verification before triggering onData and onSuccess callbacks. Results are ignored if the task state changed during the request.
  - **Resume Logic**: Resolved a race condition in the `resume()` method using a new isEnqueued flag, preventing duplicate execution cycles.
  - **Performance Optimization**: Removed hardcoded **30ms** and **10ms** delays from the processing loop. Polling now runs at the maximum speed allowed by the hardware.
  - **Configuration**: Added the `interTaskDelay` parameter to the `IPollingManagerConfig` for fine-tuning communication with slower devices.
  - **Bug Fix**: Fixed a typo where `defaultTaskTimout` prevented the application of global timeout settings.

- Connection Trackers (Device & Port)
  - **Deadlock Fixes**: Modified **DeviceConnectionTracker** and **PortConnectionTracker** to execute handlers outside of critical sections. Users can now query tracker states directly from within state-change events.
  - **Integrity**: All state-reading methods (e.g., getConnectedSlaveIds, getState) now use runExclusive to ensure data consistency.
  - **Debounce Reliability**: Added "stale event" detection to the debounce logic. Disconnection notifications are **automatically ignored** if a device reconnects before the timer expires.
  - **Immutability**: Methods now return deep copies of state objects and arrays to protect internal storage from external modification.

- ModbusClient Resilience
  - **Automatic Sync**: Fixed the "Stale Transport" issue where the client would lose connection after a transport hot-reload. The `_syncProtocol` mechanism now **automatically reconnects** to the new transport instance.
  - **Lazy Initialization**: The client no longer crashes during construction if the transport is not yet registered. The internal protocol is now initialized upon the first data request.
  - **Error Handling**: Improved the `_sendRequest` logic to preserve and throw original Error objects with full stack traces, significantly improving debugging.
  - **Async Disconnect**: The disconnect method now properly awaits the asynchronous removal of Slave ID routing in the controller.
  - **Refactoring**: Simplified the `readDeviceIdentification` method by removing redundant slave ID state management.

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
