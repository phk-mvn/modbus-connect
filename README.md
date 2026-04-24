![banner](assets/logo.png)

# modbus-connect

![TypeScript](https://img.shields.io/badge/typescript-%23007acc.svg?style=for-the-badge&logo=typescript&logoColor=white)
![npm downloads](https://img.shields.io/npm/dt/modbus-connect?logo=npm&style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)
![Contributors](https://img.shields.io/github/contributors/phk-mvn/modbus-connect?style=for-the-badge)
[![License MIT](https://img.shields.io/badge/License-MIT-red.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/phk-mvn/modbus-connect?style=for-the-badge)](https://github.com/phk-mvn/modbus-connect/stargazers)

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
  - [Modbus Scanner ⇗](#modbus-scanner)
  - [Traffic Sniffer ⇗](#traffic-sniffer)
- [Modbus Client ⇗](#modbus-client)
- [Polling Manager ⇗](#polling-manager)
- [Emulator's ⇗](#emulators)
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
      console.error(err.message ?? err);
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
      console.error(err.message ?? err);
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
- **Async Routing**: `assignSlaveIdToTransport` and `removeSlaveIdFromTransport` are now properly async — always `await` them to avoid race conditions.

---

### **Transport management methods**

`addTransport()`

Adds and initializes a new transport. Creates a personal `PollingManager` for it.

> **Note**: The `options` object also accepts `slaveIds: number[]` to auto-assign devices, and for `node-rtu` you can use `path` as an alias for `port`. These are convenience options extracted at runtime even though they aren't in the TypeScript transport option interfaces.

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

`controlTask()` / `controlPolling()`

Starts, stops, pauses, or resumes polling tasks (IMP-7). Accepts plain strings or `EPollingAction`/`EPollingBulkAction` enums. Methods now throw an error if the transport is not found (BUG-5 fix).

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

`writeToPort()`

Low-level method for writing raw bytes directly to a transport's port and optionally reading the response. The operation is protected by the polling mutex, so it won't collide with background tasks.

**Example**:

```js
const response = await controller.writeToPort('RS485_BUS', rawAduBytes, 10, 3000);
```

---

`destroy()`

Gracefully shuts down the entire controller: stops all polling, disconnects all transports, and releases all resources.

**Example**:

```js
await controller.destroy();
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

# <span id="modbus-scanner">Modbus Scanner</span>

The `ModbusScanner` is a high-performance tool built into the `TransportController` that allows you to discover Modbus devices on a line or network without knowing their exact settings.

### **Key Features**

- **Scan Profiles**: Mandatory `profile` parameter (`'quick'`, `'deep'`, `'custom'`) that presets baud rates, parities, concurrency, and timeouts. User options override profile defaults.
- **Adaptive Turbo Mode**: Automatically calculates the minimum physical timeout based on the Baud Rate. (e.g., ~14ms for 115200 baud).
- **Isomorphic RTU Scanning**: Automatically detects if you are in Node.js or a Browser environment.
- **High-Concurrency TCP Scanning**: Scans multiple Unit IDs in parallel with configurable concurrency and timeout.
- **Lifecycle Control**: Ability to pause, resume, stop, and reset the scanning process programmatically. Supports `AbortSignal` for external cancellation.
- **Scan Statistics**: Returns `IScanReport` with discovered devices and detailed `IScanStats` (duration, probes sent, timeouts, CRC errors, exception responses).
- **Traffic Sniffer Integration**: When sniffer is enabled on the controller, scan traffic is automatically captured for analysis.
- **Multi-Baud Discovery**: Optional `multiBaud` flag allows reporting devices found on multiple baud rates (default deduplicates by slaveId).
- **Per-Unit Progress**: TCP scan reports progress for each individual Unit ID, not just per batch.

---

### **Scan Profiles**

The `profile` parameter is **mandatory** and provides sensible defaults. You can still override any field by providing it explicitly.

| Profile  | Baud Rates                                 | Parities                     | Stop Bits | Concurrency | TCP Timeout | Padding |
| -------- | ------------------------------------------ | ---------------------------- | --------- | ----------- | ----------- | ------- |
| `quick`  | 115200, 57600, 38400, 19200, 9600          | none, even                   | 1, 2      | 100         | 200ms       | 5ms     |
| `deep`   | 115200, 57600, 38400, 19200, 9600, ...1200 | none, even, odd, mark, space | 1, 2      | 25          | 500ms       | 10ms    |
| `custom` | — (you must provide all options)           | —                            | —         | —           | —           | —       |

---

### **Callback System**

The scanner uses a reactive callback system to provide real-time feedback, making it ideal for building smooth User Interfaces.

- `onDeviceFound(device)`: Triggered immediately when a device is verified. You can use this to populate a list in your UI as the scan progresses.
- `onProgress(current, total, info)`: Triggered on every request attempt.
  - `current`: Current attempt index.
  - `total`: Total planned attempts.
  - `info`: Object containing current scan parameters (RTU: `{ baud, parity, stopBits, slaveId }`, TCP: `{ host, port, unitId }`).
- `onFinish(results)`: Triggered when the entire scan process is complete. Returns an array of all discovered IScanResult objects.
- `onStats(stats)`: Triggered when scan finishes with detailed statistics (`durationMs`, `probesSent`, `timeouts`, `crcErrors`, `exceptionResponses`).

---

### **Scanning Options (`IScanOptions`)**

| Property          | Type                            | Description                                                                  |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| `profile`         | `'quick' \| 'deep' \| 'custom'` | **Required**. Scan profile that provides default values.                     |
| `path`            | `string or IWebSerialPort`      | Serial port path (Node) or SerialPort object (Web).                          |
| `bauds`           | `number[]`                      | List of baud rates to check. Overridden by profile defaults unless `custom`. |
| `parities`        | `TParityType[]`                 | List of parities to check. Overridden by profile defaults unless `custom`.   |
| `slaveIds`        | `number[]`                      | Range of Slave IDs to check (1-247).                                         |
| `unitIds`         | `number[]`                      | Range of Unit IDs to check for TCP scan.                                     |
| `registerAddress` | `number`                        | The register address to read for verification. Default: `0`.                 |
| `controller`      | `ScanController`                | An instance of `ScanController` to manage the scan externally.               |
| `concurrency`     | `number`                        | TCP parallel request count. Default from profile.                            |
| `tcpTimeout`      | `number`                        | TCP response timeout in ms. Default from profile.                            |
| `multiBaud`       | `boolean`                       | Report devices on multiple baud rates (default: `false`, dedup by slaveId).  |
| `signal`          | `AbortSignal`                   | Standard `AbortSignal` for external scan cancellation.                       |
| `stopBitsList`    | `(1 or 2)[]`                    | List of stop bits to scan (RTU only). Default from profile: `[1, 2]`.        |
| `padding`         | `number`                        | Extra ms padding for RTU timeout. Default from profile.                      |

---

### **Scanning Methods**

`scanRtuPort(options)`

This method iterates through the matrix of Baud Rates and Parities. Once a device is found, it "locks" the port settings and quickly scans the remaining Slave IDs. Returns `IScanReport` with results and statistics.

**Example**:

```js
const report = await controller.scanRtuPort({
  profile: 'quick',
  path: '/dev/ttyUSB0', // In Browser, pass the port object here
  bauds: [9600, 115200], // Overrides profile defaults

  onDeviceFound: device => {
    console.log(
      `New device discovered! ID: ${device.slaveId} @ ${device.baudRate}bps parity:${device.parity} stopBits:${device.stopBits}`
    );
  },

  onProgress: (current, total, info) => {
    const percent = Math.round((current / total) * 100);
    process.stdout.write(
      `Scanning ${info.baud}bps | ${info.parity} | ${info.stopBits}SB | ID: ${info.slaveId} [${percent}%]\r`
    );
  },

  onFinish: allDevices => {
    console.log(`\nScan complete. Total devices found: ${allDevices.length}`);
  },
});

console.log('Stats:', report.stats);
// Stats: { durationMs: 12450, probesSent: 2470, timeouts: 2465, crcErrors: 0, exceptionResponses: 5 }
```

---

`scanTcpPort(options)`

Uses high-concurrency parallel requests to map a TCP gateway or a subnetwork. Returns `IScanReport`.

**Example**:

```js
const report = await controller.scanTcpPort({
  profile: 'deep',
  hosts: ['192.168.1.100'],
  ports: [502],
  unitIds: Array.from({ length: 255 }, (_, i) => i + 1),

  onDeviceFound: device => {
    console.log(`Found TCP Unit: ${device.slaveId} at ${device.host}`);
  },

  onStats: stats => {
    console.log(`Scan took ${stats.durationMs}ms, ${stats.probesSent} probes sent`);
  },
});

console.log('Discovered devices:', report.results);
```

---

### **Scanner Control**

If you need to manage the scan process (e.g., from a UI), use these methods:

| Method         | Description                                              |
| -------------- | -------------------------------------------------------- |
| `pauseScan()`  | Suspends the current scan at the next iteration.         |
| `resumeScan()` | Resumes a previously paused scan.                        |
| `stopScan()`   | Immediately stops the scan and releases the port/socket. |

You can also use `AbortController` for external cancellation:

```js
const abortCtrl = new AbortController();

const report = controller.scanRtuPort({
  profile: 'quick',
  path: '/dev/ttyUSB0',
  signal: abortCtrl.signal,
});

// Cancel from outside:
setTimeout(() => abortCtrl.abort(), 5000);
```

---

### **Scan Report (`IScanReport`)**

Both `scanRtuPort` and `scanTcpPort` return an `IScanReport`:

```ts
{
  results: IScanResult[];
  stats: IScanStats;
}
```

**Scan Result (`IScanResult`)**

```ts
{
  type: 'node-rtu' | 'web-rtu' | 'node-tcp';
  slaveId: number;     // The Modbus address found
  baudRate?: number;   // (RTU only) The working baud rate
  parity?: string;     // (RTU only) none, even, or odd
  stopBits?: 1 | 2;    // (RTU only) Actual stop bits used during scan
  port?: string;       // The physical port path
  host?: string;       // (TCP only) The device IP
  tcpPort?: number;    // (TCP only) The device Port
  discoveredAt: number;// Unix timestamp when device was discovered
}
```

**Scan Statistics (`IScanStats`)**

```ts
{
  durationMs: number; // Total scan duration
  probesSent: number; // Total Modbus requests sent
  timeouts: number; // Requests that timed out
  crcErrors: number; // CRC validation failures (RTU)
  exceptionResponses: number; // Modbus exception responses (device exists but refused)
}
```

<br>

# <span id="traffic-sniffer">Traffic Sniffer</span>

The sniffer instance is available via the `controller.sniffer` property. It uses an Observer pattern (subscription-based) to deliver data.

**Methods**:

| Method                   | Description                                                           | Returns                             |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------- |
| `onPacket(handler)`      | Subscribes to the stream of individual packets (TX and RX separately) | `() => void` (Unsubscribe function) |
| `onTransaction(handler)` | Subscribes to completed transactions (Paired Request + Response)      | `() => void` (Unsubscribe function) |

---

### Transaction Structure (`ITransaction`)

Unlike individual packets, a transaction represents a full Modbus cycle. This is the best way to monitor device health and latency.

| Property      | Type                               | Description                                                               |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `id`          | `string`                           | Unique alphanumeric ID for the transaction.                               |
| `transportId` | `string`                           | Identifier of the transport channel.                                      |
| `protocol`    | `'rtu'` or `'tcp'`                 | The protocol used for this exchange.                                      |
| `request`     | `ISnifferPacket`                   | The complete request packet (TX).                                         |
| `response`    | `ISnifferPacket` or `null`         | The complete response packet (RX). `null` if a timeout occurred.          |
| `status`      | `'ok'` or `'error'` or `'timeout'` | Transaction result: `ok` (success), `error` (exception/CRC), `timeout`.   |
| `durationMs`  | `number`                           | Round-trip time (RTT) from start of TX to end of RX.                      |
| `error`       | `string`                           | Error message (e.g., "Response Timeout" or Modbus Exception description). |
| `timestamp`   | `number`                           | Unix timestamp of when the transaction was completed.                     |

---

### Packet Structure (`ISnifferPacket`):

Every packet (`tx` or `rx`) captured by the sniffer:

| Property      | Type             | Description                                                       |
| ------------- | ---------------- | ----------------------------------------------------------------- |
| `id`          | `string`         | Unique alphanumeric ID for the transaction.                       |
| `transportId` | `string`         | Identifier of the transport (e.g., COM port path or IP:Port).     |
| `direction`   | `'tx'` or `'rx'` | Direction: `tx` (Sent request), `rx` (Received response).         |
| `timestamp`   | `number`         | Precise high-resolution timestamp (`performance.now()`).          |
| `raw`         | `Uint8Array`     | The actual raw bytes of the packet.                               |
| `hex`         | `string`         | Formatted HEX string (e.g., `"7A 03 00 01"`).                     |
| `ascii`       | `string`         | ASCII representation (non-printable characters replaced by dots). |
| `analysis`    | `object`         | Deep protocol analysis (see below).                               |
| `meta`        | `object`         | Performance metrics and status (see below).                       |

---

### `onTransaction` Usage Example

```js
const controller = new TransportController({ sniffer: true });

controller.sniffer.onTransaction(tx => {
  const { status, durationMs, request, response, transportId } = tx;

  if (status === 'timeout') {
    console.log(
      `\x1b[31m[TIMEOUT]\x1b[0m ${transportId} -> Device ${request.analysis.slaveId} didn't respond`
    );
    return;
  }

  const color = status === 'ok' ? '\x1b[32m' : '\x1b[31m'; // Green for OK, Red for Error

  console.log(`${color}===[${status.toUpperCase()}] [${transportId}] [${durationMs}ms]===\x1b[0m`);
  console.log(
    `  Req: Slave ${request.analysis.slaveId} | Func 0x${request.analysis.funcCode.toString(16)}`
  );

  if (response) {
    console.log(`  Res: ${response.analysis.description}`);
    console.log(`  CRC: ${response.analysis.crcValid ? 'VALID' : 'INVALID'}`);
  }
});
```

---

### Meta Structure (`ISnifferPacket.meta`):

| Property         | Type      | Description                                                             |
| ---------------- | --------- | ----------------------------------------------------------------------- |
| `latencyMs`      | `number`  | Time between TX completion and first byte of RX (Device reaction time). |
| `transferMs`     | `number`  | Time taken to receive the entire packet (Physical transmission time).   |
| `totalMs`        | `number`  | Full transaction cycle time (`latency + transfer`).                     |
| `bytesPerSecond` | `number`  | Calculated throughput speed of the line.                                |
| `isFragment`     | `boolean` | `true` if the packet is part of a larger chunk (internal use).          |
| `error`          | `string`  | Optional transport-level error message.                                 |

---

### `onPacket()` Usage Example

```js
const controller = new TransportController({ sniffer: true });

// Subscribe to packets
controller.sniffer.onPacket(packet => {
  // Ignore RX fragments (wait for fully reassembled packets)
  if (packet.direction === 'rx' && packet.meta.isFragment) return;

  const { direction, transportId, analysis, meta, hex, ascii } = packet;

  // Style settings
  const color = direction === 'tx' ? '\x1b[36m' : '\x1b[32m'; // Cyan for TX, Green for RX
  const reset = '\x1b[0m';

  console.log(`\n${color}===[${direction.toUpperCase()}] [${transportId}]===${reset}`);

  // Protocol Details
  if (analysis) {
    console.log(`  Protocol: Slave ${analysis.slaveId} | Func 0x${analysis.funcCode.toString(16)}`);
    console.log(`  Summary:  ${analysis.description}`);
  }

  // Data Representations
  console.log(`  HEX:      ${hex}`);
  console.log(`  ASCII:    ${ascii}`);

  // Performance Metrics (for RX)
  if (direction === 'rx') {
    console.log(`  Metrics:`);
    console.log(`    ⏱  Latency:  ${meta.latencyMs} ms`);
    console.log(`    🚀 Transfer: ${meta.transferMs} ms`);
    console.log(`    📊 Bitrate:  ${meta.bytesPerSecond} B/s`);
    console.log(`    🛡  Checksum: ${analysis.crcValid ? 'VALID' : 'INVALID'}`);
  }
});
```

---

### Why use the Sniffer?

Unlike standard logging, the `TrafficSniffer`:

- **Zero Impact**: It runs asynchronously and doesn't delay your Modbus requests.
- **Sub-millisecond Precision**: Uses `performance.now()` for ultra-accurate timing.
- **Fragment Reassembly**: Automatically glues together packets that arrive in multiple chunks (common in Serial/TCP).
- **Error Debugging**: Helps identify if a failure is due to device latency, CRC corruption, or transport issues.

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

Reads the Holding registers. Returns a `RegisterData` object (extends `Array<number>`) that supports type conversion and sub-selection.

```js
const regs = await client.readHoldingRegisters(10, 2);
console.log(regs); // [1500, 240] — works like a regular array
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 55ms
[1500, 240]
```

---

`readInputRegisters(startAddress, quantity) (FC 0x04)`

Reads the Input registers. Returns a `RegisterData` object (extends `Array<number>`) that supports type conversion and sub-selection.

```js
const inputs = await client.readInputRegisters(0, 1);
console.log(inputs); // [356]
```

**Expected result**:

```bash
[ModbusClient][ID:122] Response received 48ms
[356]
```

---

### **RegisterData — Type Conversion & Sub-Selection**

`readHoldingRegisters` and `readInputRegisters` return a `RegisterData` object instead of a plain `number[]`. `RegisterData` extends `Array<number>`, so all existing code (index access, `.length`, `.map`, etc.) continues to work without changes. The new methods allow you to convert raw 16-bit register values into standard numeric types and select specific registers from a block read.

---

#### **Conversion Methods**

| Method                 | Registers/value |  Returns   | Description            |
| ---------------------- | :-------------: | :--------: | ---------------------- |
| `asUInt16()`           |        1        | `number[]` | 0–65535 (identity)     |
| `asInt16()`            |        1        | `number[]` | −32768–32767           |
| `asUInt32(wordOrder)`  |        2        | `number[]` | 0–4294967295           |
| `asInt32(wordOrder)`   |        2        | `number[]` | −2147483648–2147483647 |
| `asFloat32(wordOrder)` |        2        | `number[]` | IEEE 754 single        |
| `asFloat64(wordOrder)` |        4        | `number[]` | IEEE 754 double        |

All multi-register methods accept an optional `wordOrder` parameter: `'BE'` (default, Big-Endian / standard Modbus) or `'LE'` (Little-Endian / word-swapped). Some devices store 32-bit values with the low word at the lower address — use `'LE'` for those.

**Scalar shortcuts** return a single `number` (the first converted value):

`asUInt16Scalar()`, `asInt16Scalar()`, `asUInt32Scalar(wordOrder)`, `asInt32Scalar(wordOrder)`, `asFloat32Scalar(wordOrder)`, `asFloat64Scalar(wordOrder)`

**Examples**:

```js
const regs = await client.readHoldingRegisters(0, 2);

// Float32 from 2 registers
const temp = regs.asFloat32Scalar(); // 23.5

// Int32 with word-swap (LE device)
const pressure = regs.asInt32Scalar('LE');

// Multiple float32 values from 8 registers
const block = await client.readHoldingRegisters(0, 8);
const temps = block.asFloat32(); // [23.5, 1.025, 12.3, -0.5]
```

---

#### **Sub-Selection — `.sub()` and `.pick()`**

When a device stores different parameters at consecutive addresses in different formats, you can read all registers in **one request** and then extract individual fields:

```js
// One request for 10 registers, then extract individual fields:
const block = await client.readHoldingRegisters(0, 10);

const temperature = block.sub(0, 2).asFloat32Scalar(); // registers 0–1 → float
const pressure = block.sub(2, 2).asFloat32Scalar(); // registers 2–3 → float
const status = block.sub(4).asUInt16Scalar(); // register 4 → uint16
const counter = block.sub(5, 2).asInt32Scalar(); // registers 5–6 → int32
const flow = block.sub(7, 2).asFloat32Scalar(); // registers 7–8 → float
const errorCode = block.sub(9).asInt16Scalar(); // register 9 → int16
```

`.sub(offset, count?)` — selects a contiguous range. `count` defaults to 1 if omitted.

`.pick(...indices)` — selects arbitrary registers (non-contiguous):

```js
// Pick specific registers scattered across the block
const flags = block.pick(4, 9).asUInt16(); // [1, 0]
```

> **Important**: When using `.pick()` with multi-register conversions (asUInt32, asInt32, asFloat32, asFloat64), **the order of indices you pass determines the word order**. For example, `block.pick(0, 1).asFloat32()` treats register 0 as the high word and register 1 as the low word (standard BE). But `block.pick(1, 0).asFloat32()` reverses the words — register 1 becomes the high word and register 0 becomes the low word. This is equivalent to applying a word-swap. Use this intentionally when your device stores values in a non-standard word order.

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

Updates any task option and restarts it. Now **async** — waits for any in-progress execution to complete before replacing the task (RISK-6 fix).

```js
await manager.updateTask('main-sensor-poll', {
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
| `loggerEnabled`     | `boolean`  | Enable/disable internal logging. Defaults to `true`.             |
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

# <span id="types">Types and Interfaces</span>

All interactions in the library are strongly typed. The interfaces are divided into logical blocks: Client, Transport, Polling Manager, and Emulation.

### **Modbus Client API**

`IModbusClient`

The primary interface for high-level operations.

| Method                                         | Description                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `readHoldingRegisters(start, qty)`             | Reads holding registers (FC 0x03). Returns `Promise<RegisterData>`. |
| `readInputRegisters(start, qty)`               | Reads input registers (FC 0x04). Returns `Promise<RegisterData>`.   |
| `writeSingleRegister(addr, val, timeout?)`     | Write a single register (FC 0x06).                                  |
| `writeMultipleRegisters(addr, vals, timeout?)` | Write a group of registers (FC 0x10).                               |
| `readCoils(start, qty, timeout?)`              | Reads coils (FC 0x01). Returns boolean[].                           |
| `readDiscreteInputs(start, qty, timeout?)`     | Reads discrete inputs (FC 0x02).                                    |
| `writeSingleCoil(addr, val, timeout?)`         | Writes a single bit (FC 0x05).                                      |
| `writeMultipleCoils(addr, vals, timeout?)`     | Writes a group of bits (FC 0x0F).                                   |
| `reportSlaveId(timeout?)`                      | Reports the device ID (FC 0x11).                                    |
| `readDeviceIdentification(decoder, timeout?)`  | Reads the device ID (FC 0x2B).                                      |
| `executeCustomFunction(name, ...args)`         | Calls a plugin function.                                            |
| `setSlaveId(newId)`                            | Changes the device address for the client.                          |
| `connect() / disconnect()`                     | Logical state management.                                           |
| `enableLogger() / disableLogger()`             | Logging control.                                                    |
| `IModbusClientOptions`                         | (Constructor options)                                               |

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
- `reloadTransport(id, options)`: Hot-swapping port settings. Old trackers are properly cleaned up before recreation.
- `removeTransport(id)`: Complete removal.
- `getTransportForSlave(slaveId, requiredRSMode)`: Search for a transport by route.
- `assignSlaveIdToTransport(transportId, slaveId)`: Bind a device to a port. **Async** — always `await`.
- `removeSlaveIdFromTransport(transportId, slaveId)`: Unlink a device. **Async** — always `await`. Targets the specific transport tracker only.

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

- `UnknownError`: Unspecified error.
- `PortClosed`: The physical port is closed.
- `Timeout`: The device did not respond.
- `CRCError`: Checksum error.
- `ConnectionLost`: Connection lost.
- `DeviceOffline`: The device went offline.
- `MaxReconnect`: The recovery attempt limit has been exceeded.
- `ManualDisconnect`: Disconnected by user request.
- `Destroyed`: Transport was destroyed.

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
    logger?: Logger; // External logger instance
    [key: string]: unknown; // Additional custom options
}
```

`IPollingTaskOptions` (Specific task settings)

```ts
{
    id: string; // Unique task ID
    name?: string; // Human-readable task name
    priority?: number; // Priority (the higher the priority, the earlier in the queue)
    interval: number; // Execution frequency (ms)
    fn: Function | Function[]; // Modbus requests
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

### **Connection Trackers (State Tracking)**

`IDeviceConnectionTracker` (Slave Device Status)

- `notifyConnected(slaveId)`: Marks the device as "Online".
- `notifyDisconnected(slaveId, error, message)`: Triggers a debounce (default 500ms). Errors in the handler are caught and logged — no unhandled rejections.
- `getConnectedSlaveIds()`: Returns a list of all live Slave IDs.

`IPortConnectionTracker` (Physical port status)

`notifyConnected(slaveIds[])`: The port is open. SlaveIds are now correctly forwarded from the controller.
`notifyDisconnected(error, message, slaveIds[])`: The port has failed. Debounce default 300ms. Errors caught.
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

### 4.3.3 (2026-04-23)

- **Critical — StateManager passes slaveIds to PortTracker**: `notifyPortConnected()` was calling `tracker.notifyConnected()` without forwarding `slaveIds`, so the per-transport PortTracker always stored an empty array. Now correctly forwards the list
- **Critical — ITransportController async signatures**: `assignSlaveIdToTransport()` and `removeSlaveIdFromTransport()` were declared as `void` in the interface but implemented as `async`. Fixed to `Promise<void>` — callers must now `await` these methods
- **Critical — RTU Emulator handlers**: All handler methods (`setDeviceStateHandler`, `setPortStateHandler`, `notifyDeviceConnected`, `notifyDeviceDisconnected`, etc.) were empty stubs. Now properly store and invoke handlers on `connect()`/`disconnect()` — device and port tracking works for RTU emulator
- **Critical — TCP Emulator device disconnect**: `disconnect()` only called the port handler, not the device handler. DeviceConnectionTracker left slaves in `connected` state forever. Now emits `ManualDisconnect` for both device and port
- **Fix — Debounce unhandled rejection**: `_doNotifyDisconnected` in both `DeviceConnectionTracker` and `PortConnectionTracker` is `async` but was called from `setTimeout` without `.catch()`. Now wrapped to prevent unhandled promise rejections
- **Fix — PortTracker type safety**: `setHandler` used `error as any` cast. Replaced with proper type narrowing `{ type: EConnectionErrorType; message: string } | undefined`
- **Fix — createTrackersForTransport leaks**: `reloadTransport()` called `createTrackersForTransport()` for existing transportId without clearing old trackers, leaking debounce timers and handlers. Now clears old trackers before creating new ones
- **Fix — NodeSerial passes connectedSlaveIds on disconnect**: `_notifyPortDisconnected()` always passed `[]` instead of `Array.from(this._connectedSlaveIds)`. Now correctly reports affected devices
- **Fix — removeDeviceState targets specific transport**: Iterated all trackers instead of the one owning the slave. New signature `removeDeviceState(slaveId, transportId?)` with backwards-compatible fallback
- **Fix — TrafficSniffer bytesPerSecond when transfer=0**: When `recordRxStart` wasn't called, `bytesPerSecond` used `1ms` as divisor producing inflated values (e.g. 8000 B/s for 8 bytes). Now returns `0` when transfer time is unavailable
- **Fix — TrafficSniffer handler error catching**: `_emitTransaction` and `_notify` used `Promise.resolve().then()` without `.catch()`, causing unhandled rejections when user handlers throw. Now wrapped in try/catch with error logging

### 4.3.2 (2026-04-22)

- **Scanner Overhaul — Critical Bug Fixes**:
  - **Fixed stopBits not being passed to transport**: Scanner always used `stopBits=1` (serialport default) regardless of parity, causing devices to be found with wrong connection parameters (e.g. `parity:even, stopBits:2` when actual connection was `8E1`)
  - **Added stopBits enumeration**: Scanner now iterates over `stopBitsList` (default `[1, 2]`), checking all valid combinations: 8N1, 8N2, 8E1, 8E2, 8O1, 8O2, etc.
  - **Fixed stopBits in scan report**: `_addRtu` was incorrectly computing `stopBits = parity === 'none' ? 1 : 2` instead of using the actual connection parameter. Now reports the real `stopBits` used during the probe
  - **Added `stopBitsList` option**: Replaced `IScanOptions.stopBits` with `stopBitsList: (1 | 2)[]` for full control over which stop bits to scan
  - **Added `stopBits` to `IScanProgressRtu`**: Progress callback now includes the current stopBits being scanned
  - Fixed `ScanController` sync issue between `TransportController` and `ScanService` — `stop()`/`resume()` now correctly operate on the same controller instance
  - Added parallel scan protection — `ScanService` now throws an error if a scan is already in progress instead of silently overwriting the active controller
  - `ScanController.isStopped` is now reversible via new `reset()` method, allowing controller reuse
  - Removed hardcoded TCP concurrency (50) and timeout (250ms) — both are now configurable via `IScanOptions.concurrency` and `IScanOptions.tcpTimeout`
  - Fixed race condition between `pause` and `stop` — scan now checks `isStopped` immediately after exiting the pause loop
  - Wrapped `TransportFactory.create` + `connect` in try/catch per baud rate — a failed port opening no longer kills the entire scan, it skips to the next speed
  - Fixed unsafe type detection in `ScanService._detectRtuTransportType` — now checks for `IWebSerialPort` interface instead of `typeof path !== 'string'`
  - Replaced `any` types in `IScanResult.port` and `IScanOptions.path` with proper `string` and `IWebSerialPort` types
- **Scanner Overhaul — New Features**:
  - **Scan Profiles** (`TScanProfile`): Mandatory `profile` parameter (`'quick'`, `'deep'`, `'custom'`) that presets baud rates, parities, concurrency, timeouts, and padding. User-provided options override profile defaults.
  - **Scan Report** (`IScanReport`): Both `scanRtuPort` and `scanTcpPort` now return `IScanReport` containing `results: IScanResult[]` and `stats: IScanStats` instead of just `IScanResult[]`
  - **Scan Statistics** (`IScanStats`): Tracks `durationMs`, `probesSent`, `timeouts`, `crcErrors`, and `exceptionResponses`. Available via `report.stats` or `onStats` callback.
  - **Discovery Timestamp**: Every `IScanResult` now includes `discoveredAt: number` (Unix timestamp of when the device was found)
  - **AbortController Integration**: Added `signal?: AbortSignal` to `IScanOptions` for standard external scan cancellation
  - **Multi-Baud Discovery**: Added `multiBaud?: boolean` to `IScanOptions` — when `true`, devices responding on multiple baud rates are reported separately (default: `false`, deduplicates by slaveId)
  - **Traffic Sniffer Integration**: When sniffer is enabled on `TransportController`, scan traffic is automatically captured for analysis
  - **Per-Unit TCP Progress**: TCP scan now reports `onProgress` for each individual Unit ID (`{ host, port, unitId }`) instead of only per batch
  - **Typed Progress Callbacks**: `onProgress` info is now typed as `IScanProgressRtu` or `IScanProgressTcp` instead of `any`

### 4.3.0 (2026-04-21)

- The library's **file system architecture** has been **redesigned**
- Fixed an issue where the port for the `WEB transport` (**WEB Serial API**) was not actually closed
- The balancing system in `TransportController` has been **removed**
- **All typing has been fixed**:
  - Duplicates have been removed
  - Existing interfaces have been optimized, and types for module classes have been updated
- The documentation has been **updated**
