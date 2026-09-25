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
- **Single serialization point (PortQueue)**: Background polling, manual commands and `writeToPort()` all go through one per-port queue — exchanges can never collide on the channel
- **Polling Manager**: A queue of tasks with priorities, delays and exponential backoff
- **Smart reconnect**: Automatic connection recovery for Serial and TCP/IP
- **Emulator**: Full-fiedged TCP-slave and RTU-slave for testing without hardware
- **Auto Discovery (Scanner)**: Ultra-fast device discovery with adaptive mathematical timeouts and parallel TCP scanning.

## Documentation

- [Usage example ⇗](#usage-example)
- [Transport Controller ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/TransportController.md)
- [Modbus Scanner ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/ModbusScanner.md)
- [Traffic Sniffer ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/TrafficSniffer.md)
- [Modbus Client ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/ModbusClient.md)
- [Polling Manager ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/PollingManager.md)
- [Emulator's ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/Emulators.md)
- [Types and Interfaces ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/TypesAndInterfaces.md)
- [Error Reference ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/ErrorsReference.md)
- [Changelog ⇗](https://github.com/phk-mvn/modbus-connect/blob/main/docs/CHANGELOG.md)

## Install

Using NPM:

```
$ npm install modbus-connect
```

Using YARN:

```
$ yarn add modbus-connect
```

## <span id="usage-example">Usage</span>

```js
// Types library
import { _type_ } from 'modbus-connect/types';

// Transport Controller — it also owns and creates clients (controller.createClient)
import TransportController from 'modbus-connect/transport';
```

## Node RTU connection Example

```js
import TransportController from 'modbus-connect/transport';

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
  });

  await controller.connectTransport(TRANSPORT_ID);

  // The controller creates the client: framing is derived from the port RS mode (RS485 -> rtu)
  // and the slave is added to the port inventory automatically.
  const client = await controller.createClient({
    slaveId: SLAVE_ID,
    transportId: TRANSPORT_ID,
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
  });

  await controller.connectTransport(TRANSPORT_ID);

  const client = await controller.createClient({
    slaveId: SLAVE_ID,
    transportId: TRANSPORT_ID,
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
  });

  await controller.connectTransport(TRANSPORT_ID);

  const client = await controller.createClient({
    slaveId: SLAVE_ID,
    transportId: TRANSPORT_ID,
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
  const client = await controller.createClient({
    slaveId: 1,
    transportId: 'emulator-1',
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
