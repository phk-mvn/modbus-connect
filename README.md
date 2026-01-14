# Modbus Connect (Node.js/Web Serial API)

Modbus Connect is a cross-platform library for Modbus RTU communication in both Node.js and modern browsers (via the Web Serial API). It enables robust, easy interaction with industrial devices over serial ports.

## Navigation through documentation

- [Features](#features)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Modbus Client](#modbus-client)
- [Transport Controller](#transport-controller)
- [Modbus TCP Support](#modbus-tcp)
- [Architecture: Framers & Protocol](#architecture)
- [Errors Types](#errors-types)
- [Polling Manager](#polling-manager)
- [Slave Emulator](#slave-emulator)
- [Logger](#logger)
- [Utils](#utils)
- [Utils CRC](#utils-crc)
- [Plugin System](#plugin-system)
- [Tips for use](#tips-for-use)
- [Expansion](#expansion)
- [CHANGELOG](#changelog)

<br>

# <span id="features">Features</span>

- Supports Modbus RTU over serial ports (Node.js) and Web Serial API (Browser).
- Automatic reconnection mechanisms (primarily in transport layer).
- Robust error handling with specific Modbus exception types.
- Integrated polling manager for scheduled data acquisition.
- Built-in logging with configurable levels and categories.
- Diagnostic tools for monitoring communication performance.
- Utility functions for CRC calculation, buffer manipulation, and data conversion.
- Slave emulator for testing purposes (without COM port).
- **Plugin System:** Extend client functionality with custom functions, data types, and CRC algorithms without modifying the library core.
- Supports Modbus RTU and **Modbus TCP** (Node.js and Browser).
- **Multilayer Architecture:** Separation of Transport, Framing, and Protocol logic.
- **Intelligent Stream Reading:** Robust handling of partial packets and variable-length responses (perfect for custom archive functions).

<br>

# <span id="installation">Installation</span>

```bash
npm install modbus-connect
```

<br>

# <span id="basic-usage">Basic Usage</span>

### Importing Modules

The library provides several entry points for different functionalities:

```js
// Types library
import { _type_ } from 'modbus-connect/types';

// Main Modbus client
import ModbusClient from 'modbus-connect/client';

// Transport controller for managing connections
import TransportController from 'modbus-connect/transport';

// Logger for diagnostics and debugging
import Logger from 'modbus-connect/logger';

// Slave emulator for testing
import SlaveEmulator from 'modbus-connect/slave-emulator';
```

### Creating Transports via TransportController

The `TransportController` is the centralized way to manage one or more transport connections. It handles routing, reconnection, and assignment of slave IDs to specific transports.
**Node.js Serial Port:**

```js
await controller.addTransport(
  'node-port-1',
  'node',
  {
    port: '/dev/ttyUSB', // or 'COM' on Windows
    baudRate: 19200,
    slaveIds: [1, 2], // Assign these slave IDs to this transport
  },
  {
    maxReconnectAttempts: 10, // Reconnect options
  },
  {
    defaultInterval: 1000, // Polling options (Optional)
  }
);

await controller.connectAll();
```

**Web Serial API port:**

```js
// Function to request a SerialPort instance, typically called from a user gesture
const getSerialPort = await navigator.serial.requestPort();

await controller.addTransport('web-port-1', 'web', {
  port: getSerialPort,
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  maxEmptyReadsBeforeReconnect: 10,
  slaveIds: [3, 4],
});

await controller.connectAll();
```

**Node.js TCP:**

```js
await controller.addTransport('node-tcp-1', 'node-tcp', {
  host: '192.168.1.10',
  port: 502,
  slaveIds: [1],
});
```

**Web WebSocket Proxy (TCP):**

```js
await controller.addTransport('web-tcp-1', 'web-tcp', {
  url: 'ws://localhost:8080',
  slaveIds: [1],
});
```

To set the read/write speed parameters, specify writeTimeout and readTimeout during addTransport. Example:

```js
await controller.addTransport('node-port-2', 'node', {
  port: 'COM3',
  writeTimeout: 500,
  readTimeout: 500,
  slaveIds: [5],
});
```

> If you do not specify values ​​for `readTimeout/writeTimeout` during initialization, the default parameter will be used - 1000 ms for both values

### Creating a Client

```js
const client = new ModbusClient(controller, 1, {
  /* ...options */
});
```

- `controller` — The `TransportController` instance.
- `slaveId` — Device address (1..247). The controller will route requests to the correct transport.
- `options` — `{ timeout, retryCount, retryDelay, plugins }`

### Connecting and Communicating

```js
try {
  await client.connect();
  console.log('Connected to device');

  const registers = await client.readHoldingRegisters(0, 10);
  console.log('Registers:', registers);

  await client.writeSingleRegister(5, 1234);
} catch (error) {
  console.error('Communication error:', error.message);
} finally {
  await client.disconnect();
  await controller.disconnectAll(); // Disconnect all managed transports
}
```

### Work via RS485

In order to work via RS485, you first need to connect the COM port.

```js
await controller.addTransport('rs485-port', 'node', {
  port: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  writeTimeout: 500,
  readTimeout: 500,
  slaveIds: [38, 51], // Multiple devices on the same port
});

await controller.connectAll();

const device_1 = new ModbusClient(controller, 38, { timeout: 1000 });
const device_2 = new ModbusClient(controller, 51, { timeout: 1000 });

try {
  const registers_1 = await device_1.readHoldingRegisters(0, 10);
  console.log('Registers 1:', registers_1);

  const registers_2 = await device_2.readHoldingRegisters(0, 10);
  console.log('Registers 2:', registers_2);
} catch (error) {
  console.error('Communication error:', error.message);
} finally {
  await device_1.disconnect();
  await device_2.disconnect();
  await controller.disconnectAll();
}
```

<br>

# <span id="modbus-client">Modbus Client</span>

The ModbusClient class is a client for working with Modbus devices (RTU/TCP, etc.) via the transport layer. It supports standard Modbus functions (reading/writing registers and coils), SGM130-specific functions (device comments, files, reboot, controller time), and integration with the logger from **Logger**. The client uses a **mutex** for synchronization, error retry, **diagnostics**, and protocol abstraction via **Framers**.

Key Features:

- **Transport:** Works **exclusively** through a `TransportController` instance, which manages routing to the underlying physical transports. Direct interaction with a transport is no longer supported.
- **Retry and Timeouts**: Automatic retry (up to retryCount), retryDelay delay, default timeout of 2000ms.
- **Logging**: Integration with Logger (default 'error' level). Context support (slaveId, funcCode).
- **Data Conversion**: Automatic conversion of registers to types (`uint16`, `float`, strin`g, etc.), with byte/word swap support.
- **Errors**: Special classes (`ModbusTimeoutError`, `ModbusCRCError`, `ModbusExceptionError`, etc.).
- **CRC**: Support for various algorithms (`crc16Modbus` by default).
- **Echo**: Optional echo check for serial (for debugging).
- **Extensible via Plugins:** Supports external plugins to add proprietary function codes, custom data types, and new CRC algorithms without modifying the library's source code.
  **Dependencies:**

- async-mutex for synchronization.
- Functions from ./function-codes/\* for building/parsing PDUs.
- Logger, Diagnostics, packet-builder, utils, errors, crc.

**Logging levels:** Defaults to 'error'. Enable enableLogger() for more details.

## Initialization

Include the module:

```js
const ModbusClient = require('modbus-connect/client');
const TransportController = require('modbus-connect/transport');
```

Create an instance:

```js
// Import your plugin class
const { MyAwesomePlugin } = require('./plugins/my-awesome-plugin.js');

const controller = new TransportController();
await controller.addTransport('com-port-3', 'node', {
  port: 'COM3',
  baudRate: 9600,
  parity: 'none',
  dataBits: 8,
  stopBits: 1,
  slaveIds: [1],
  RSMode: 'RS485', // or 'RS232'. Default is 'RS485'.
});

await controller.connectAll();

const options = {
  timeout: 3000,
  retryCount: 2,
  retryDelay: 200,
  diagnostics: true,
  echoEnabled: true,
  crcAlgorithm: 'crc16Modbus',
  plugins: [MyAwesomePlugin], // Pass plugin classes directly in constructor
};

const client = new ModbusClient(controller, 1, options); // options: framing ('rtu' | 'tcp') - default: 'rtu'
```

**_Initialization output (if logging is enabled):_** _No explicit output in the constructor. Logging is enabled by methods._

**Connection:**

```js
await client.connect();
```

**Output (if level >= 'info'):**

```bash
[04:28:57][INFO][NodeSerialTransport] Serial port COM3 opened
```

**Disconnect:**

```js
await client.disconnect();
```

**Output:**

```bash
[05:53:17][INFO][NodeSerialTransport] Serial port COM3 closed
```

## Logging Controls

### 1. enableLogger(level = 'info')

Enables ModbusClient logging.

**Example:**

```js
client.enableLogger('debug');
```

Now all requests/errors will be logged.

### 2. disableLogger()

Disables (sets 'error').

**Example:**

```js
client.disableLogger();
```

### 3. setLoggerContext(context)

Adds a global context (e.g., { custom: 'value' }).

**Example:**

```js
client.setLoggerContext({ env: 'test' });
```

The context is added to all logs.

## Basic Modbus methods (standard functions)

### Standard Modbus Functions

| HEX  | Name                       |
| :--: | -------------------------- |
| 0x03 | Read Holding Registers     |
| 0x04 | Read Input Registers       |
| 0x10 | Write Multiple Registers   |
| 0x06 | Write Single Register      |
| 0x01 | Read Coils                 |
| 0x02 | Read Discrete Inputs       |
| 0x05 | Write Single Coil          |
| 0x0F | Write multiple Coils       |
| 0x2B | Read Device Identification |
| 0x11 | Report Slave ID            |

### Summary type data

| Type             | Size (regs)  | DataView Method       | Endian / Swap          | Notes                                           |
| ---------------- | ------------ | --------------------- | ---------------------- | ----------------------------------------------- |
| `uint16`         | 1            | `getUint16`           | Big Endian             | No changes                                      |
| `int16`          | 1            | `getInt16`            | Big Endian             |                                                 |
| `uint32`         | 2            | `getUint32`           | Big Endian             | Standard 32-bit read                            |
| `int32`          | 2            | `getInt32`            | Big Endian             |                                                 |
| `float`          | 2            | `getFloat32`          | Big Endian             | IEEE 754 single precision float                 |
| `uint32_le`      | 2            | `getUint32`           | Little Endian          |                                                 |
| `int32_le`       | 2            | `getInt32`            | Little Endian          |                                                 |
| `float_le`       | 2            | `getFloat32`          | Little Endian          |                                                 |
| `uint32_sw`      | 2            | `getUint32`           | Word Swap              | Swap words (e.g., 0xAABBCCDD → 0xCCDDAABB)      |
| `int32_sw`       | 2            | `getInt32`            | Word Swap              |                                                 |
| `float_sw`       | 2            | `getFloat32`          | Word Swap              |                                                 |
| `uint32_sb`      | 2            | `getUint32`           | Byte Swap              | Swap bytes (e.g., 0xAABBCCDD → 0xBBAADDCC)      |
| `int32_sb`       | 2            | `getInt32`            | Byte Swap              |                                                 |
| `float_sb`       | 2            | `getFloat32`          | Byte Swap              |                                                 |
| `uint32_sbw`     | 2            | `getUint32`           | Byte + Word Swap       | Swap bytes and words (0xAABBCCDD → 0xDDCCBBAA)  |
| `int32_sbw`      | 2            | `getInt32`            | Byte + Word Swap       |                                                 |
| `float_sbw`      | 2            | `getFloat32`          | Byte + Word Swap       |                                                 |
| `uint32_le_sw`   | 2            | `getUint32`           | LE + Word Swap         | Little Endian with Word Swap                    |
| `int32_le_sw`    | 2            | `getInt32`            | LE + Word Swap         |                                                 |
| `float_le_sw`    | 2            | `getFloat32`          | LE + Word Swap         |                                                 |
| `uint32_le_sb`   | 2            | `getUint32`           | LE + Byte Swap         | Little Endian with Byte Swap                    |
| `int32_le_sb`    | 2            | `getInt32`            | LE + Byte Swap         |                                                 |
| `float_le_sb`    | 2            | `getFloat32`          | LE + Byte Swap         |                                                 |
| `uint32_le_sbw`  | 2            | `getUint32`           | LE + Byte + Word Swap  | Little Endian with Byte + Word Swap             |
| `int32_le_sbw`   | 2            | `getInt32`            | LE + Byte + Word Swap  |                                                 |
| `float_le_sbw`   | 2            | `getFloat32`          | LE + Byte + Word Swap  |                                                 |
| `uint64`         | 4            | `getUint32` + BigInt  | Big Endian             | Combined BigInt from high and low parts         |
| `int64`          | 4            | `getUint32` + BigInt  | Big Endian             | Signed BigInt                                   |
| `double`         | 4            | `getFloat64`          | Big Endian             | IEEE 754 double precision float                 |
| `uint64_le`      | 4            | `getUint32` + BigInt  | Little Endian          |                                                 |
| `int64_le`       | 4            | `getUint32` + BigInt  | Little Endian          |                                                 |
| `double_le`      | 4            | `getFloat64`          | Little Endian          |                                                 |
| `hex`            | 1+           | —                     | —                      | Returns array of HEX strings per register       |
| `string`         | 1+           | —                     | Big Endian (Hi → Lo)   | Each 16-bit register → 2 ASCII chars            |
| `bool`           | 1+           | —                     | —                      | 0 → false, nonzero → true                       |
| `binary`         | 1+           | —                     | —                      | Each register converted to 16 boolean bits      |
| `bcd`            | 1+           | —                     | —                      | BCD decoding from registers                     |

### Expanded Usage Examples

| Example usage        | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `type: 'uint16'`     | Reads registers as unsigned 16-bit integers (default no byte swapping)       |
| `type: 'int16'`      | Reads registers as signed 16-bit integers                                    |
| `type: 'uint32'`     | Reads every 2 registers as unsigned 32-bit big-endian integers               |
| `type: 'int32'`      | Reads every 2 registers as signed 32-bit big-endian integers                 |
| `type: 'float'`      | Reads every 2 registers as 32-bit IEEE 754 floats (big-endian)               |
| `type: 'uint32_le'`  | Reads every 2 registers as unsigned 32-bit little-endian integers            |
| `type: 'int32_le'`   | Reads every 2 registers as signed 32-bit little-endian integers              |
| `type: 'float_le'`   | Reads every 2 registers as 32-bit IEEE 754 floats (little-endian)            |
| `type: 'uint32_sw'`  | Reads every 2 registers as unsigned 32-bit with word swap                    |
| `type: 'int32_sb'`   | Reads every 2 registers as signed 32-bit with byte swap                      |
| `type: 'float_sbw'`  | Reads every 2 registers as float with byte+word swap                         |
| `type: 'hex'`        | Returns an array of hex strings, e.g., `["0010", "FF0A"]`                    |
| `type: 'string'`     | Converts registers to ASCII string (each register = 2 chars)                 |
| `type: 'bool'`       | Returns an array of booleans, 0 = false, otherwise true                      |
| `type: 'binary'`     | Returns array of 16-bit boolean arrays per register (each bit separately)    |
| `type: 'bcd'`        | Decodes BCD-encoded numbers from registers, e.g., `0x1234` → `1234`          |
| `type: 'uint64'`     | Reads 4 registers as a combined unsigned 64-bit integer (BigInt)             |
| `type: 'int64_le'`   | Reads 4 registers as signed 64-bit little-endian integer (BigInt)            |
| `type: 'double'`     | Reads 4 registers as 64-bit IEEE 754 double precision float (big-endian)     |
| `type: 'double_le'`  | Reads 4 registers as 64-bit IEEE 754 double precision float (little-endian)  |

All methods are asynchronous and use `_sendRequest` to send with retry. They return data or a response object. The timeout is optional (uses default).

### 4. readHoldingRegisters(startAddress, quantity, options = {})

Reads holding registers (function 0x03). Converts to the type from options.type.

**Parameters:**

- `startAddress (number):` Start address (0-65535).
- `quantity (number):` Number of registers (1-125).
- `options.type (string, opt):` 'uint16', 'int16', 'uint32', 'float', 'string', 'hex', 'bool', 'bcd', etc. (see \_convertRegisters).

**Example 1: Basic reading of uint16.**

```js
const registers = await client.readHoldingRegisters(100, 2);
console.log(registers); // [1234, 5678] (array of numbers)
```

**Log output (if level >= 'debug'):**

```bash
[14:30:15][DEBUG] Attempt #1 — sending request { slaveId: 1, funcCode: 3 }
[14:30:15][DEBUG] Packet written to transport { bytes: 8, slaveId: 1, funcCode: 3 }
[14:30:15][DEBUG] Echo verified successfully { slaveId: 1, funcCode: 3 } (if echoEnabled)
[14:30:15][DEBUG] Received chunk: { bytes: 9, total: 9 }
[14:30:15][INFO] Response received { slaveId: 1, funcCode: 3, responseTime: 50 }
```

**Example 2: Reading as a float (2 registers = 1 float).**

```js
const floats = await client.readHoldingRegisters(200, 2, { type: 'float' });
console.log(floats); // [3.14159] (array of float)
```

**Example 3: Reading a string.**

```js
const str = await client.readHoldingRegisters(300, 5, { type: 'string' });
console.log(str); // 'Hello' (string)
```

**Errors:** ModbusTimeoutError, ModbusCRCError, ModbusExceptionError (with exception code).

### 5. readInputRegisters(startAddress, quantity, options = {})

Reads input registers (function 0x04). Same as readHoldingRegisters.

**Example:**

```js
const inputs = await client.readInputRegisters(50, 3, { type: 'uint32' });
console.log(inputs); // [12345678, 87654321] (2 uint32 from 4 registers)
```

**Output:** Same as readHoldingRegisters, funcCode=4.

### 6. writeSingleRegister(address, value, timeout)

Writes a single holding register (function 0x06).

**Parameters:**

- `address (number):` Address.
- `value (number):` Value (0-65535).
- `timeout (number, optional):` Timeout.

**Example:**

```js
const response = await client.writeSingleRegister(400, 999);
console.log(response); // { address: 400, value: 999 }
```

**Log output:**

```bash
[14:30:15][INFO] Response received { slaveId: 1, funcCode: 6, responseTime: 30 }
```

### 7. writeMultipleRegisters(startAddress, values, timeout)

Writes multiple holding registers (function 0x10).

**Parameters:**

- startAddress (number).
- values ​​(number[]): Array of values.
- timeout (number, optional).

**Example:**

```js
const response = await client.writeMultipleRegisters(500, [100, 200, 300]);
console.log(response); // { startAddress: 500, quantity: 3 }
```

**Output:** funcCode=16 (0x10).

### 8. readCoils(startAddress, quantity, timeout)

Reads coils (function 0x01). Returns `{ coils: boolean[] }`.

**Example:**

```js
const { coils } = await client.readCoils(0, 8);
console.log(coils); // [true, false, true, ...]
```

**Output:** funcCode=1.

### 9. readDiscreteInputs(startAddress, quantity, timeout)

Reads discrete inputs (function 0x02). Same as readCoils.

**Example:**

```js
const { inputs } = await client.readDiscreteInputs(100, 10);
console.log(inputs); // [false, true, ...]
```

### 10 writeSingleCoil(address, value, timeout)

Writes a single coil (function 0x05). value: 0xFF00 (true) or 0x0000 (false).

**Example:**

```js
const response = await client.writeSingleCoil(10, 0xff00); // Enable
console.log(response); // { address: 10, value: 0xFF00 }
```

### 11. writeMultipleCoils(startAddress, values, timeout)

Writes multiple coils (function 0x0F). values: `boolean[]` or `number[]` (0/1).

**Example:**

```js
const response = await client.writeMultipleCoils(20, [true, false, true]);
console.log(response); // { startAddress: 20, quantity: 3 }
```

## Special Modbus Functions

### 1. reportSlaveId(timeout)

Report slave ID (function 0x11). Returns { slaveId, runStatus, ... }.

**Example:**

```js
const info = await client.reportSlaveId();
console.log(info); // { slaveId: 1, runStatus: true, ... }
```

### 2. readDeviceIdentification(timeout)

Reading identification (function 0x2B). SlaveId is temporarily reset to 0.

**Example:**

```js
const id = await client.readDeviceIdentification();
console.log(id); // { vendor: 'ABC', product: 'XYZ', ... }
```

## Internal methods (For expansion)

- `_toHex(buffer):` Buffer to a hex string. Used in logs.
- `_sendRequest(pdu, timeout, ignoreNoResponse):` Basic sending method with retry, echo, and diagnostics.
- `_convertRegisters(registers, type):` Register conversion (supports 16/32/64-bit, float, string, BCD, hex, bool, binary with swaps: \_sw, \_sb, \_le, and combinations).

**Conversion example with swap:**

```js
// In readHoldingRegisters options: { type: 'float_sw' } — word swap for float.
const swapped = await client.readHoldingRegisters(400, 2, { type: 'float_sw' });
```

## Diagnostics

The client uses Diagnostics for statistics (recordRequest, recordError, etc.). Access via client.diagnostics.

**Example:**

```js
console.log(client.diagnostics.getStats()); // { requests: 10, errors: 2, ... }
```

## Full usage example

```js
const ModbusClient = require('modbus-connect/client');
const TransportController = require('modbus-connect/transport');

async function main() {
  const controller = new TransportController();

  await controller.addTransport('com-port-3', 'node', {
    port: 'COM3',
    baudRate: 9600,
    parity: 'none',
    dataBits: 8,
    stopBits: 1,
    slaveIds: [1],
    RSMode: 'RS485', // or 'RS232'. Default is 'RS485'.
  });

  await controller.connectAll();

  const client = new ModbusClient(controller, 1, { timeout: 1000, retryCount: 1 });
  client.enableLogger('info');

  try {
    await client.connect();

    const regs = await client.readHoldingRegisters(0, 10, { type: 'uint16' });
    console.log('Registers:', regs);

    await client.writeSingleRegister(0, 1234);

    const time = await client.getControllerTime();
    console.log('Controller time:', time);

    await client.disconnect();
  } catch (err) {
    console.error('Modbus error:', err);
  } finally {
    await controller.disconnectAll();
  }
}

main();
```

**Expected output (snippet):**

```bash
[05:53:16][INFO][NodeSerialTransport] Serial port COM3 opened
[05:53:17][INFO] Response received { slaveId: 1, funcCode: 3, responseTime: 45 }
Registers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
[05:53:18][INFO] Response received { slaveId: 1, funcCode: 6, responseTime: 20 }
Controller time: { datetime: '2025-10-07T10:00:00Z' }
[05:53:19][INFO][NodeSerialTransport] Serial port COM3 closed
```

**On error (timeout):**

```bash
[14:30:15][WARN] Attempt #1 failed: Read timeout { responseTime: 1000, error: ModbusTimeoutError, ... }
[14:30:15][DEBUG] Retrying after delay 200ms { slaveId: 1, funcCode: 3 }
[14:30:15][ERROR] All 2 attempts exhausted { error: ModbusTimeoutError, ... }
Modbus error: Read timeout
```

<br>

# <span id="transport-controller">Transport Controller</span>

The `transport/transport-controller.js` module provides a centralized way to manage **multiple** Modbus transports (serial or TCP) depending on the environment (Node.js or Web). `TransportController` allows you to **manage connections**, **route requests** between devices with different `slaveId`s via different transports, and provides **load balancing** and **fault tolerance**.

**Key Features:**

- **Transport Management:** Add, remove, connect, disconnect.
- **Routing:** Automatically routes requests from `ModbusClient` to the correct transport based on `slaveId`.
- **Dynamic Assignment:** Ability to assign new `slaveId`s to an already connected transport.
- **Fault Tolerance:** Supports fallback transports.
- **Logging:** Integrated with the main logger.
- **Diagnostics:** Can provide transport-level statistics.
- **Device/Port State Tracking:** Internally leverages the state tracking capabilities of the underlying `NodeSerialTransport` and `WebSerialTransport`. These transports use `DeviceConnectionTracker` and `PortConnectionTracker` to monitor the connection status of individual Modbus slaves and the physical port itself, providing detailed error types and messages. `TransportController` manages these states for all managed transports. **You can subscribe to state changes by setting handlers directly on the individual transports added to the controller.**

The module exports the `TransportController` class. It maintains its own internal state for managing transports and routing.

**Dependencies:**

- `./factory.js`: For creating underlying transport instances (NodeSerialTransport, WebSerialTransport).
- `../logger.js`: For logging.
- `../types/modbus-types.js`: For type definitions.

## Initialization

Include the module

```js
const TransportController = require('modbus-connect/transport');
```

Or in the browser:

```js
import TransportController from 'modbus-connect/transport';
```

Create an instance:

```js
const controller = new TransportController();
```

Logging and diagnostics are configured internally or via the main logger.

## Main functions

### 1. `addTransport(id, type, options, reconnectOptions?, pollingConfig?)`

Asynchronously adds a new transport to the controller and initializes its internal PollingManager.

**Parameters:**

- `id (string)`: A unique identifier for this transport within the controller.
- `type (string)`: Type ('node', 'web').
- `options (object)`: Config:
  - `For 'node':` `{ port: 'COM3', baudRate: 9600, ..., slaveIds: [1, 2] }` (SerialPort options + `slaveIds` array).
  - `For 'web':` `{ port: SerialPort instance, ..., slaveIds: [3, 4] }` (Web Serial Port instance + `slaveIds` array).
  - `slaveIds (number[], optional):` An array of `slaveId`s that this transport will handle. These are registered internally for routing.
  - `RSMode (string, optional):` 'RS485' or 'RS232'. Default is 'RS485'.
  - `fallbacks (string[], optional):` An array of transport IDs to use as fallbacks for the assigned `slaveIds` if the primary transport fails.
    **Returns:** Promise<void>
    **Errors:** Throws Error on invalid options, duplicate ID.
- `reconnectOptions (object, optional)`: `{ maxReconnectAttempts: number, reconnectInterval: number }`.
- `pollingConfig (object, optional)`: Configuration for the internal PollingManager (e.g., `{ defaultInterval: 1000, maxRetries: 3 }`).

**Example 1: Add Node.js serial transport.**

```js
async function addNodeTransport() {
  try {
    await controller.addTransport('com3', 'node', {
      port: 'COM3', // Use path for Node
      baudRate: 19200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      slaveIds: [13, 14], // Assign slave IDs 13 and 14 to this transport
      RSMode: 'RS485', // or 'RS232'. Default is 'RS485'.
    });
    console.log('Transport added to controller:', 'com3');
  } catch (err) {
    console.error('Failed to add transport:', err.message);
  }
}

addNodeTransport();
```

**Output (logs if level >= 'info'; simulation):**

```bash
[14:30:15][INFO][TransportController] Transport "com3" added {"type":"node","slaveIds":[13, 14]}
```

**Example 2: Add Web serial transport.**

```js
// In the browser, after navigator.serial.requestPort()
async function addWebTransport(port) {
  try {
    await controller.addTransport('webPort1', 'web', {
      port, // The SerialPort instance obtained via Web Serial API
      slaveIds: [15, 16], // Assign slave IDs 15 and 16 to this transport
      RSMode: 'RS485', // or 'RS232'. Default is 'RS485'.
    });
    console.log('Transport added to controller:', 'webPort1');
  } catch (err) {
    console.error('Failed to add transport:', err.message);
  }
}

// Simulation: const port = await navigator.serial.requestPort();
addWebTransport(port);
```

**Output (logs):**

```bash
[14:30:15][INFO][TransportController] Transport "webPort1" added {"type":"web","slaveIds":[15, 16]}
```

### 2. `removeTransport(id)`

Asynchronously removes a transport from the controller. Disconnects it first if connected.

**Parameters:**

- `id (string)`: The ID of the transport to remove.

**Returns:** Promise<void>

**Example:**

```js
async function removeTransport() {
  try {
    await controller.removeTransport('com3');
    console.log('Transport removed from controller:', 'com3');
  } catch (err) {
    console.error('Failed to remove transport:', err.message);
  }
}

removeTransport();
```

### 3. `connectAll()` / `connectTransport(id)`

Connects all managed transports or a specific one.

**Parameters:**

- `id (string, optional)`: The ID of the specific transport to connect.

**Returns:** Promise<void>

**Example:**

```js
async function connectAllTransports() {
  try {
    await controller.connectAll(); // Connect all added transports
    console.log('All transports connected via controller.');
  } catch (err) {
    console.error('Failed to connect transports:', err.message);
  }
}

connectAllTransports();
```

### 4. `listTransports()`

Returns an array of all managed transports with their details.

**Parameters:** None

**Returns:** TransportInfo[] - Array of transport info objects.

**Example:**

```js
const transports = controller.listTransports();
console.log('All transports:', transports);
```

### 5. `assignSlaveIdToTransport(transportId, slaveId)`

Dynamically assigns a `slaveId` to an already added and potentially connected transport. Useful if you discover a new device on an existing port.

**Parameters:**

- `transportId (string)`: The ID of the target transport.
- `slaveId (number)`: The Modbus slave ID to assign.

**Returns:** void

**Errors:** Throws Error if `transportId` is not found.

**Example:**

```js
// Assume 'com3' transport was added earlier and is connected
// Later, you discover a device with slaveId 122 is also on COM3
controller.assignSlaveIdToTransport('com3', 122);
console.log('Assigned slaveId 122 to transport com3');
// ModbusClient with slaveId 122 will now use the 'com3' transport.
```

### 6. `removeSlaveIdFromTransport(transportId, slaveId)`

Dynamically removes a `slaveId` from a transport's configuration. This clears the internal registry, routing maps, **and resets the internal connection tracker state** for that specific device. This method is essential if you plan to re-assign the same `slaveId` to the transport later (e.g., after a physical reconnection sequence) to avoid "already managing this ID" errors or connection state debounce issues.

**Parameters:**

- `transportId (string)`: The ID of the target transport
- `slaveId (number)`: The Modbus slave ID to remove

**Returns:** void

**Errors:** Logs a warning if `transportId` is not found or if the `slaveId` was not assigned to that transport, but does not throw an exception

**Example:**

```js
// Assume we need to reboot or physically reconnect the device with slaveId 13
// First, remove it from the controller logic
controller.removeSlaveIdFromTransport('com3', 13);
console.log('Removed slaveId 13 from transport com3');

// ... physical reconnection happens ...

// Now you can safely re-assign it
controller.assignSlaveIdToTransport('com3', 13);
```

### 7. `getTransportForSlave(slaveId)`

Gets the currently assigned transport for a specific `slaveId`. Used internally by `ModbusClient` if needed, but can be useful for direct interaction.

**Parameters:**

- `slaveId (number)`: The Modbus slave ID.

**Returns:** `Transport | null` - The assigned transport instance or null if not found.

**Example:**

```js
const assignedTransport = controller.getTransportForSlave(13);
if (assignedTransport) {
  console.log('Transport for slave 13:', assignedTransport.constructor.name);
} else {
  console.log('No transport assigned for slave 13');
}
```

### 8. `Device/Port State Tracking`

To track the connection state of devices or the port itself, you need to access the individual transport instance managed by the `TransportController` and set the handler on it.

**Example: Setting Device State Handler**

```js
async function addAndTrackDevice() {
  await controller.addTransport('com3', 'node', {
    port: 'COM3',
    baudRate: 9600,
    slaveIds: [1, 2],
  });

  await controller.connectAll();

  // Get the transport instance for 'com3'
  const transport = controller.getTransport('com3');
  if (transport && transport.setDeviceStateHandler) {
    // Set the handler to receive state updates for devices on this transport
    transport.setDeviceStateHandler((slaveId, connected, error) => {
      console.log(`[Transport 'com3'] Device ${slaveId} is ${connected ? 'ONLINE' : 'OFFLINE'}`);
      if (error) {
        console.log(`[Transport 'com3'] Device ${slaveId} Error: ${error.type}, ${error.message}`);
      }
    });
  }

  // Create clients using the controller
  const client1 = new ModbusClient(controller, 1, { timeout: 2000, RSMode: 'RS485' });
  await client1.connect(); // This will trigger the handler for slaveId 1
}

addAndTrackDevice();
```

**Example: Setting Port State Handler**

```js
async function addAndTrackPort() {
  await controller.addTransport('com4', 'node', {
    port: 'COM4',
    baudRate: 115200,
    slaveIds: [3],
  });

  // Get the transport instance for 'com4' *before* connecting if needed
  const transport = controller.getTransport('com4');
  if (transport && transport.setPortStateHandler) {
    // Set the handler to receive state updates for the physical port
    transport.setPortStateHandler((connected, slaveIds, error) => {
      console.log(`[Transport 'com4'] Port is ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
      console.log(`[Transport 'com4'] Affected slave IDs:`, slaveIds || []);
      if (error) {
        console.log(`[Transport 'com4'] Port Error: ${error.type}, ${error.message}`);
      }
    });
  }

  await controller.connectAll();

  // Create clients using the controller
  const client3 = new ModbusClient(controller, 3, { timeout: 2000, RSMode: 'RS485' });
  await client3.connect();
}

addAndTrackPort();
```

### 9. `writeToPort(transportId, data, readLength?, timeout?)`

Allows executing a direct write operation (or any command requiring exclusive port access) on a specific transport, leveraging the `PollingManager`'s mutex to prevent conflicts with background polling tasks. This is the safest way to send a non-polling, immediate command.

**Parameters:**

- `transportId (string)`: The ID of the transport to write to.
- `data (Uint8Array)`: The data buffer to write to the port.
- `readLength (number, optional)`: The expected length of the response data (in bytes). Defaults to `0` (no read).
- `timeout (number, optional)`: Timeout for reading the response, in milliseconds. Defaults to `3000` ms.

**Returns:** `Promise<Uint8Array>` - The received data buffer or an empty buffer if `readLength` was `0`.

**Errors:** Throws Error if the transport is not found or if the underlying transport is not considered open/connected.

**Example:**

```js
async function sendDirectCommand() {
  const transportId = 'com3';
  const dataToSend = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xcb, 0xfb]); // Example raw command
  const expectedResponseLength = 9; // Command + 2 registers * 2 bytes/reg = 5 bytes response + header/CRC (example)

  try {
    console.log(`Sending direct command to transport ${transportId}...`);

    // This call locks the transport's PollingManager, writes data, reads response, flushes, and releases lock.
    const response = await controller.writeToPort(
      transportId,
      dataToSend,
      expectedResponseLength,
      5000 // 5 seconds timeout for this specific operation
    );

    console.log('Direct write successful. Response received:', response);
  } catch (err) {
    console.error(`Failed to write directly to transport ${transportId}:`, err.message);
  }
}

sendDirectCommand();
```

> **Note on Transport State:** This method checks `info.transport.isOpen` internally. If you call this on a transport that is currently disconnecting or has an underlying error, it will likely fail, regardless of the PollingManager mutex being available. Ensure the transport is in the `'connected'` state before calling.

### 10. `getStatus(id?)`

Gets the status of a specific transport or all transports.

**Parameters:**

- `id (string, optional)`: The ID of the transport to get the status for. If not provided, returns the status of all transports.

**Returns:** TransportStatus[] - Array of transport status objects.

**Example:**

```js
const status = controller.getStatus('com3');
console.log('Transport status:', status);
```

### 11. `getActiveTransportCount()`

Returns the number of currently connected transports.

**Parameters:** None

**Returns:** number

### 12. `setLoadBalancer(strategy)`

Sets the load balancing strategy for routing requests.

**Parameters:**

- strategy (string): 'round-robin', 'sticky', 'first-available'

**Example:**

```js
controller.setLoadBalancer('round-robin');
```

### 13. `reloadTransport(id, options)`

Asynchronously reloads an existing transport with a new configuration. This is useful for changing settings like `baudRate` or even the physical `port` on the fly.
The controller will first safely disconnect the existing transport, then create a new transport instance with the provided options. If the original transport was connected, the controller will attempt to connect the new one automatically.

**Parameters:**

- `id (string)`: The unique identifier of the transport to be reloaded.
- `options (object)`: A new configuration object, identical in structure to the one used in `addTransport`.

**Returns:** `Promise<void>`

**Example:**

```js
// Initially, the transport is configured with a 9600 baudRate
await controller.addTransport('com3', 'node', {
  port: 'COM3',
  baudRate: 9600,
  slaveIds: [1],
  RSMode: 'RS485',
});
await controller.connectAll();

// ...some time later...

// Reload the same transport with a new baudRate of 19200
console.log('Reloading transport with new settings...');
await controller.reloadTransport('com3', {
  port: 'COM3',
  baudRate: 19200,
  slaveIds: [1], // Note: You must provide all required options again
  RSMode: 'RS485',
});
console.log('Transport reloaded successfully.');
```

### 14. Polling Task Management (Proxy Methods)

The `TransportController` now acts as a facade for managing polling tasks specific to each transport.

**Methods:**

- `addPollingTask(transportId, options)`: Adds a polling task to the specified transport.
- `removePollingTask(transportId, taskId)`: Removes a task.
- `updatePollingTask(transportId, taskId, options)`: Updates an existing task.
- `controlTask(transportId, taskId, action)`: Controls a specific task. Action: `'start' | 'stop' | 'pause' | 'resume'`.
- `controlPolling(transportId, action)`: Controls all tasks on the transport. Action: `'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'`.
- `getPollingStats(transportId)`: Returns statistics for all tasks on the transport.
- `executeImmediate(transportId, fn)`: Executes a function using the transport's polling mutex. This ensures the function runs atomatically, without conflicting with background polling tasks.

**Example:**

```js
// Add a periodic reading task to 'com3'
controller.addPollingTask('com3', {
  id: 'read-sensors',
  interval: 1000,
  fn: () => client.readHoldingRegisters(0, 10),
  onData: data => console.log('Data:', data),
  onError: err => console.error('Error:', err.message),
});

// Execute a manual write operation safely while polling is active
await controller.executeImmediate('com3', async () => {
  await client.writeSingleRegister(10, 123);
});

// Pause all polling on this transport (e.g. during maintenance)
controller.controlPolling('com3', 'pauseAll');
```

### 15. `destroy()`

Destroys the controller and disconnects all transports.

**Parameters:** None

**Returns:** Promise<void>

**Example:**

```js
await controller.destroy();
console.log('Controller destroyed');
```

## Full usage example

Integration with `ModbusClient`. Creating a controller, adding transports, setting state handlers, and using the controller in clients.

```js
const TransportController = require('modbus-connect/transport'); // Import TransportController
const ModbusClient = require('modbus-connect/client');
const Logger = require('modbus-connect/logger');

async function modbusExample() {
  const logger = new Logger();
  logger.enableLogger('info'); // Enable logs

  const controller = new TransportController();

  try {
    // Add Node.js transport for slave IDs 1 and 2
    await controller.addTransport('com3', 'node', {
      port: 'COM3',
      baudRate: 9600,
      slaveIds: [1, 2],
      RSMode: 'RS485',
    });

    // Add another Node.js transport for slave ID 3
    await controller.addTransport('com4', 'node', {
      port: 'COM4',
      baudRate: 115200,
      slaveIds: [3],
      RSMode: 'RS485',
    });

    // Set up state tracking for each transport *after* adding but before connecting
    const transport3 = controller.getTransport('com3');
    if (transport3 && transport3.setDeviceStateHandler) {
      transport3.setDeviceStateHandler((slaveId, connected, error) => {
        console.log(`[COM3] Device ${slaveId}: ${connected ? 'ONLINE' : 'OFFLINE'}`);
        if (error) console.error(`[COM3] Device ${slaveId} Error:`, error);
      });
    }

    const transport4 = controller.getTransport('com4');
    if (transport4 && transport4.setPortStateHandler) {
      transport4.setPortStateHandler((connected, slaveIds, error) => {
        console.log(`[COM4] Port: ${connected ? 'UP' : 'DOWN'}. Slaves affected:`, slaveIds);
        if (error) console.error(`[COM4] Port Error:`, error);
      });
    }

    // Connect all added transports
    await controller.connectAll();

    // Create clients, passing the controller instance and their specific slaveId
    const client1 = new ModbusClient(controller, 1, { timeout: 2000, RSMode: 'RS485' }); // Uses 'com3'
    const client2 = new ModbusClient(controller, 2, { timeout: 2000, RSMode: 'RS485' }); // Uses 'com3'
    const client3 = new ModbusClient(controller, 3, { timeout: 2000, RSMode: 'RS485' }); // Uses 'com4'

    await client1.connect();
    await client2.connect();
    await client3.connect();

    const registers1 = await client1.readHoldingRegisters(0, 10, { type: 'uint16' });
    console.log('Registers from slave 1:', registers1);

    const registers2 = await client2.readHoldingRegisters(0, 10, { type: 'uint16' });
    console.log('Registers from slave 2:', registers2);

    const registers3 = await client3.readHoldingRegisters(0, 10, { type: 'uint16' });
    console.log('Registers from slave 3:', registers3);

    await client1.disconnect();
    await client2.disconnect();
    await client3.disconnect();
  } catch (err) {
    console.error('Modbus error:', err.message);
  } finally {
    // Disconnect all transports managed by the controller
    await controller.disconnectAll();
  }
}

modbusExample();
```

**Expected output (snippet):**

```bash
[14:30:15][INFO][TransportController] Transport "com3" added {"type":"node","slaveIds":[1, 2]}
[14:30:15][INFO][TransportController] Transport "com4" added {"type":"node","slaveIds":[3]}
[14:30:15][INFO][NodeSerialTransport] Serial port COM3 opened
[14:30:15][INFO][NodeSerialTransport] Serial port COM4 opened
[14:30:15][INFO] Transport connected { transport: 'NodeSerialTransport' } // For client 1
[COM3] Device 1: ONLINE // Output from device state handler
[14:30:15][INFO] Transport connected { transport: 'NodeSerialTransport' } // For client 2
[COM3] Device 2: ONLINE // Output from device state handler
[14:30:15][INFO] Transport connected { transport: 'NodeSerialTransport' } // For client 3
[COM4] Port: UP. Slaves affected: [ 3 ] // Output from port state handler
[14:30:15][INFO] Response received { slaveId: 1, funcCode: 3, responseTime: 50 }
Registers from slave 1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
[14:30:15][INFO] Response received { slaveId: 2, funcCode: 3, responseTime: 48 }
Registers from slave 2: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
[14:30:15][INFO] Response received { slaveId: 3, funcCode: 3, responseTime: 60 }
Registers from slave 3: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
[14:30:16][INFO] Transport disconnected { transport: 'NodeSerialTransport' } // For client 1
[14:30:16][INFO] Transport disconnected { transport: 'NodeSerialTransport' } // For client 2
[14:30:16][INFO] Transport disconnected { transport: 'NodeSerialTransport' } // For client 3
[14:30:16][INFO][TransportController] Transport "com3" disconnected
[14:30:16][INFO][TransportController] Transport "com4" disconnected
```

> For Web: Use `type: 'web'` and provide the `SerialPort` instance obtained via `navigator.serial.requestPort()` to the `addTransport` options. The process for setting state handlers is the same.

<br>

# <span id="modbus-tcp-support">Modbus TCP Support</span>

THe library now provides full support for Modbus TCP, allowing communication over ethernet networks.

### Key Differences from RTU:

- **No CRC:** TCP uses the underlying network layer for error checking.
- **MBAP Header:** Every packet is prefixed with a 7-byte Modbus Application Protocol header.
- **Transaction ID:** Automated 16-bit counter to match requests and responses.

### Node.js TCP

Uses native `net` sockets. High performance, direct connection.

```js
await controller.addTransport('plc-1', 'node-tcp', {
  host: '192.168.1.100',
  port: 502,
  slaveIds: [1], // In TCP, this is the Unit ID
  readTimeout: 2000,
});
```

### Web TCP (Browser)

Since browsers cannot open raw TCP sockets, use the `web-tcp` transport. It connects via a WebSocket Proxy that forwards binary framers to the target PLC.

```js
await controller.addTransport('web-tcp-1', 'web-tcp', {
  url: 'ws://your-proxy-server:8080',
  slaveIds: [1],
});
```

### Using TCP Client

When creating a client for TCP, specify the `framing` option:

```js
const client = new ModbusClient(controller, 1, {
  framing: 'tcp', // Defaults to 'rtu'
  timeout: 4000,
});
```

<br>

# <span id="architecture">Architecture: Framers & Protocol</span>

The library uses a tiered architecture to separate Modbus logic from byte-level packaging:

- **Transport:** Handles raw data transmission (SerialPort, WebSerial, TCP Sockets).
- **Framer:** Handles the Application Data Unit (ADU).
  - `RtuFramer`: Adds/validates SlaveID and CRC.
  - `TcpFramer`: Manages Transaction ID and MBAP header.
- **Protocol:** Manages the communication cycle. It handles retries, flushes, and ensures a complete packet is read before returning data to the Client.
- **Client:** High-level API for your application.

<br>

# <span id="errors-types">Errors Types</span>

The errors.js module defines a hierarchy of error classes for Modbus operations. All classes inherit from the base `ModbusError (extends Error)`, allowing for easy catching in catch blocks (e.g., `catch (err) { if (err instanceof ModbusError) { ... } }`). These classes are used in **ModbusClient** (the previous module) for specific scenarios: **timeouts**, **CRC errors**, **Modbus exceptions**, etc.

**Key Features:**

- **Base Class:** ModbusError — common to all, with name = 'ModbusError'.
- **Specific Classes:** Each has a unique name and default message. ModbusExceptionError uses the EXCEPTION_CODES constants from `./constants/constants.js` to describe exceptions (e.g., 0x01 = 'Illegal Function').
- **Hierarchy:** All extend ModbusError, so instanceof **_ModbusError_** catches everything.
- **Usage:** Throw in code for custom errors or catch from the transport/client. Supports stack and message as standard Error.
- **Constants:** Depends on **_EXCEPTION_CODES_** (object { code: 'description' }).

The module exports classes. No initialization required—just import and use for throw/catch.

## Basic Error Classes

Each class has a constructor with an optional message. When throwing, the message, name, and stack (standard for Error) are displayed.

### 1. ModbusError(message)

Base class for all Modbus errors.

**Parameters:**

- `message (string, optional):` Custom message. Defaults to ''.

### 2. ModbusTimeoutError(message = 'Modbus request timed out')

Request timeout error.

### 3. ModbusCRCError(message = 'Modbus CRC check failed')

There was a CRC check error in the package.

### 4. ModbusResponseError(message = 'Invalid Modbus response')

Invalid response error (eg unexpected PDU length).

### 5. ModbusTooManyEmptyReadsError(message = 'Too many empty reads from transport')

Too many empty reads from transport (e.g., serial)

### 6. ModbusExceptionError(functionCode, exceptionCode)

Modbus exception error (response with funcCode | 0x80). Uses EXCEPTION_CODES for description.

**Parameters:**

- `functionCode (number):` Original funcCode (without 0x80).
- `exceptionCode (number):` Exception code (0x01–0xFF).

### 8. ModbusFlushError(message = 'Modbus operation interrupted by transport flush')

Error interrupting operation with transport flash (buffer clearing).

## Error Catching (General)

All classes are caught as ModbusError.

## Data Validation Errors

### 9. ModbusInvalidAddressError(address)

Invalid Modbus slave address (must be 0-247).

**Parameters:**

- `address (number):` Invalid address value.

### 10. ModbusInvalidFunctionCodeError(functionCode)

Invalid Modbus function code.

**Parameters:**

- `functionCode (number):` Invalid function code.

### 11. ModbusInvalidQuantityError(quantity, min, max)

Invalid register/coil quantity.

**Parameters:**

- `quantity (number):` Invalid quantity.
- `min (number):` Minimum allowed.
- `max (number):` Maximum allowed.

## Modbus Exception Errors

### 12. ModbusIllegalDataAddressError(address, quantity)

Modbus exception 0x02 - Illegal Data Address.

**Parameters:**

- `address (number):` Starting address.
- `quantity (number):` Quantity requested.

### 13. ModbusIllegalDataValueError(value, expected)

Modbus exception 0x03 - Illegal Data Value.

**Parameters:**

- `value (any):` Invalid value.
- `expected (string):` Expected format.

### 14. ModbusSlaveBusyError()

Modbus exception 0x04 - Slave Device Busy.

### 15. ModbusAcknowledgeError()

Modbus exception 0x05 - Acknowledge.

### 16. ModbusSlaveDeviceFailureError()

Modbus exception 0x06 - Slave Device Failure.

## Message Format Errors

### 17. ModbusMalformedFrameError(rawData)

Malformed Modbus frame received.

**Parameters:**

- `rawData (Buffer | Uint8Array):` Raw received data.

### 18. ModbusInvalidFrameLengthError(received, expected)

Invalid frame length.

**Parameters:**

- `received (number):` Bytes received.
- `expected (number):` Expected bytes.

### 19. ModbusInvalidTransactionIdError(received, expected)

Invalid transaction ID mismatch.

**Parameters:**

- `received (number):` Received ID.
- `expected (number):` Expected ID.

### 20. ModbusUnexpectedFunctionCodeError(sent, received)

Unexpected function code in response.

**Parameters:**

- `sent (number):` Sent function code.
- `received (number):` Received function code.

## Connection Errors

### 21. ModbusConnectionRefusedError(host, port)

Connection refused by device.

**Parameters:**

- `host (string):` Target host.
- `port (number):` Target port.

### 22. ModbusConnectionTimeoutError(host, port, timeout)

Connection timeout.

**Parameters:**

- `host (string):` Target host.
- `port (number):` Target port.
- `timeout (number):` Timeout in ms.

### 23. ModbusNotConnectedError()

Operation attempted without connection.

### 24. ModbusAlreadyConnectedError()

Attempt to connect when already connected.

## Buffer & Data Errors

### 25. ModbusBufferOverflowError(size, max)

Buffer exceeds maximum size.

**Parameters:**

- `size (number):` Current size.
- `max (number):` Maximum allowed.

### 26. ModbusInsufficientDataError(received, required)

Not enough data received.

**Parameters:**

- `received (number):` Bytes received.
- `required (number):` Bytes needed.

### 27. ModbusDataConversionError(data, expectedType)

Data type conversion failure.

**Parameters:**

- `data (any):` Invalid data.
- `expectedType (string):` Expected type.

## Gateway Errors

### 28. ModbusGatewayPathUnavailableError()

Gateway path unavailable (exception 0x0A).

### 29. ModbusGatewayTargetDeviceError()

Gateway target device failed to respond (exception 0x0B).

## Polling Errors

### 30. PollingTaskAlreadyExistsError(id)

Polling task ID already registered.

**Parameters:**

- `id (string):` Task ID.

### 31. PollingTaskNotFoundError(id)

Polling task ID not found.

**Parameters:**

- `id (string):` Task ID.

<br>

# <span id="polling-manager">Polling Manager</span>

The `PollingManager` class is now **integrated directly into the** `TransportController`. You typically do not create instances of it manually. Instead, a separate manager is automatically created for each transport you add. This ensures that issues on one port (like timeouts) do not affect polling on other ports.

**Key Features:**

- **Transport Isolation:** Each transport has its own independent polling queue.
- **Concurrency Safety:** Resolves conflicts between automatic polling and manual Client requests using a shared mutex.
- **No Resource ID:** Tasks are simply added to a specific transport.

**Dependencies:**

- **async-mutex** for mutexes.
- **Logger** from ./logger for logging.

**Logging levels:** Disabled by default ('none'). Use the enable\*Logger methods to activate.

## Initialization

You **do not** need to instantiate this class manually. It is created automatically when you add a transport.
Pass the configuration in the 5th argument of `addTransport`:

```js
const TransportController = require('modbus-connect/transport');

const controller = new TransportController();

// PollingManager is initialized internally here:
await controller.addTransport(
  'my-transport',
  'node',
  { port: 'COM1', slaveIds: [1] }, // Transport config
  {}, // Reconnect config
  {
    // PollingManager config
    defaultMaxRetries: 5,
    defaultBackoffDelay: 2000,
    defaultTaskTimeout: 10000,
    logLevel: 'info',
  }
);
```

## Task management methods

| METHOD                                        | DESCRIPTION                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| addPollingTask(transportId, opts)             | Add a new polling task to a specific transport                                     |
| removePollingTask(transportId, taskId)        | Remove a task from a transport                                                     |
| updatePollingTask(transportId, taskId, opts)  | Update an existing task (removes and recreates)                                    |
| controlTask(transportId, taskId, action)      | Control a specific task (`start`, `stop`, `pause`, `resume`)                       |
| controlPolling(transportId, action)           | Control all tasks on a transport (`startAll`, `stopAll`, `pauseAll`, `resumeAll`)  |
| getPollingStats(transportId)                  | Get stats for all tasks on a transport                                             |
| getPollingQueueInfo(transportId)              | Get detailed queue information for a transport                                     |

## Adding and managing Tasks

### 1. addPollingTask(transportId, options)

Adds a new task to the specified transport queue.

**Parameters:**

- `transportId (string):` The ID of the transport.
- `options (object):` Task configuration.

```js
controller.addPollingTask('my-transport', {
  // Required parameters
  id: string,                    // Unique task ID
  interval: number,              // Polling interval in ms
  fn: Function | Function[],     // Function(s) to execute

  // Optional parameters
  priority?: number,             // Task priority (default: 0)
  name?: string,                 // Human-readable task name
  immediate?: boolean,           // Run immediately (default: true)
  maxRetries?: number,           // Retry attempts
  backoffDelay?: number,         // Retry delay
  taskTimeout?: number,          // Timeout per function

  // Callbacks (onData, onError, onStart, onStop, onFinish, etc.)
});
```

**Example 1: A simple task without a resource (independent).**

```js
// Add a task to the transport 'com3'
controller.addPollingTask('com3', {
  id: 'read-voltage',
  interval: 1000,
  fn: () => client.readHoldingRegisters(0, 2),
  onData: res => console.log('Voltage:', res),
});
```

**Output (logs if enabled; simulation):**

```bash
[14:30:15][TRACE][PollingManager] Creating TaskController { id: 'sample-task', resourceId: undefined }
[14:30:15][TRACE][TaskController] TaskController trace log
[14:30:15][DEBUG][TaskController] TaskController created { id: 'sample-task', resourceId: undefined, priority: 0, interval: 2000, maxRetries: 2, backoffDelay: 1000, taskTimeout: 3000 }
[14:30:15][WARN][TaskController] TaskController warning log
[14:30:15][ERROR][TaskController] TaskController error log
[14:30:15][INFO][PollingManager] Task added successfully { id: 'sample-task', resourceId: undefined, immediate: true }
[14:30:16][INFO][TaskController] Task started
[14:30:16][DEBUG][TaskController] Executing task once
[14:30:16][DEBUG][TaskController] Transport flushed successfully (if there is transport)
[14:30:16][INFO][TaskController] Task execution completed { success: true, resultsCount: 1 }
Data obtained: [ 'Data received' ]
[14:30:18][DEBUG][TaskController] Scheduling next run (loop)
... (repeat every 2 seconds)
```

**Validation errors:**

- If id is missing: Error: Task must have an `id`
- If a task with ID exists: Error: Polling task with id `sample-task` already exists.

### 2. updatePollingTask(transportId, taskId, newOptions)

Updates an existing task by recreating it with new options.

**Parameters:**

- **id (string):** Task ID.
  **- newOptions (object):** New options (as in addTask, without id).

**Example:**

```js
controller.updatePollingTask('com3', 'read-voltage', { interval: 5000 });
```

**Output:**

```bash
[14:30:15][INFO][PollingManager] Updating task { id: 'sample-task', newOptions: { interval: 3000, fn: [Function] } }
[14:30:15][INFO][PollingManager] Task removed { id: 'sample-task', resourceId: undefined }
[14:30:15][INFO][PollingManager] Task added successfully { id: 'sample-task', resourceId: undefined, immediate: false }
```

> If the task does not exist: Error: Polling task with id `sample-task` does not exist.

### 3. removePollingTask(transportId, taskId)

Stops and removes the task from the transport.

**Parameters:**

- id (string).

**Example:**

```js
controller.removePollingTask('com3', 'read-voltage');
```

**Output:**

```bash
[14:30:15][INFO][TaskController] Task stopped
[14:30:15][INFO][PollingManager] Task removed { id: 'sample-task', resourceId: undefined }
```

> If it doesn't exist: a warning in the logs.

## Managing Task State

### 1. controlTask(transportId, taskId, action)

Manages the state of a single task.

**Parameters:**

- `transportId (string)`
- `taskId (string)`
- `action (string):` 'start' | 'stop' | 'pause' | 'resume'

**Example:**

```js
// Pause a specific task
controller.controlTask('com3', 'read-voltage', 'pause');

// Resume it later
controller.controlTask('com3', 'read-voltage', 'resume');
```

## Bulk Operations

### 1. controlPolling(transportId, action)

Manages the state of **all** tasks on a specific transport.

**Parameters:**

- `transportId (string)`
- `action (string):` 'startAll' | 'stopAll' | 'pauseAll' | 'resumeAll'

**Example:**

```js
// Pause all polling on COM3 (e.g., before disconnecting or critical write)
controller.controlPolling('com3', 'pauseAll');

// Resume
controller.controlPolling('com3', 'resumeAll');
```

## Queues and the System

### 1. getPollingQueueInfo(transportId)

Returns information about the execution queue length and task states.

**Example:**

```js
const info = controller.getPollingQueueInfo('com3');
console.log(info);
// { queueLength: 1, tasks: [{ id: 'task1', state: {...} }] }
```

> If the queue does not exist: null.

### 2. getPollingStats(transportId)

Returns detailed statistics for all tasks on the transport.

**Example:**

```js
const stats = controller.getPollingStats('com3');
console.log(stats);
// { 'task1': { totalRuns: 10, totalErrors: 0, ... } }
```

> **Output after enabling (with addTask):** Logs from the corresponding components will become visible, as in the examples above.

## Full usage example

```js
const TransportController = require('modbus-connect/transport');
const ModbusClient = require('modbus-connect/client');

async function main() {
  const controller = new TransportController();

  // 1. Add transport (PollingManager created internally)
  await controller.addTransport(
    'com3',
    'node',
    { port: 'COM3', baudRate: 9600, slaveIds: [1] },
    {},
    { logLevel: 'debug' } // Enable polling logs here
  );

  await controller.connectAll();

  const client = new ModbusClient(controller, 1);

  // 2. Add task via Controller
  controller.addPollingTask('com3', {
    id: 'modbus-loop',
    interval: 1000,
    fn: () => client.readHoldingRegisters(0, 2),
    onData: results => console.log('Data:', results),
    onError: err => console.error('Error:', err.message),
  });

  // 3. Pause polling after 5 seconds
  setTimeout(() => {
    console.log('Pausing polling...');
    controller.controlPolling('com3', 'pauseAll');
  }, 5000);

  // 4. Check stats
  setInterval(() => {
    console.log('Stats:', controller.getPollingStats('com3'));
  }, 10000);
}

main();
```

**Expected output (snippet):**

```bash
Polling started
[14:30:15][DEBUG][PollingManager] Creating new TaskQueue { resourceId: 'slave-1' }
[14:30:15][INFO][TaskController] Task started
[14:30:15][DEBUG][TaskQueue] Task enqueued { taskId: 'modbus-poll' }
[14:30:15][DEBUG][TaskController] Executing task once
Modbus data: { registers: [1,2,3], slaveId: 1 }
[14:30:18][DEBUG][TaskQueue] Task marked as ready { taskId: 'modbus-poll' }
... (Retry)
Modbus error: Modbus error (on error, with retry)
Stats: { totalTasks: 1, totalQueues: 1, queuedTasks: 0, tasks: { modbus-poll: { totalRuns: 5, ... } } }
```

<br>

# <span id="slave-emulator">Slave Emulator</span>

The SlaveEmulator class is a Modbus device emulator (slave) that simulates slave behavior in the RTU protocol. It stores the states of coils, discrete inputs, and holding/input registers in a Map (for sparse addresses), supports address/function exceptions, infinite value changes (infinityChange), and processing of full RTU frames (handleRequest). This class is designed for testing and debugging Modbus clients without real hardware.

**Key Features:**

- **Data Storage:** Map of addresses (0–65535); default values ​​are 0/false.
- **Validation:** Addresses (0–65535), quantity (1–125/2000), values ​​(0–65535 for registers, boolean for coils).
- **Exceptions:** setException to simulate ModbusExceptionError (by funcCode+address).
- **Infinity tasks:** Automatically change values ​​by interval (random in range).
- **RTU processing:** handleRequest: CRC check, slaveAddr, funcCode; returns a Uint8Array response.
- **Logging:** Optional (loggerEnabled); uses Logger (category 'SlaveEmulator').
- **Function support:** Read/Write coils/registers (01, 02, 03, 04, 05, 06, 0F, 10); throws Illegal Function for others.

> The class is exported as SlaveEmulator. Asynchronous for connect/disconnect.

## Initialization

Include the module:

```js
const SlaveEmulator = require('modbus-connect/slave-emulator');
const Logger = require('modbus-connect/logger');
```

Create an instance:

```js
const options = {
  loggerEnabled: true, // Enable logging (default: false)
};

const emulator = new SlaveEmulator(1, options); // slaveAddress=1
```

**Output during initialization (if loggerEnabled):** No explicit output in the constructor.

**Enable\Disable logging:**

```js
emulator.enableLogger(); // Enable (if false)
emulator.disableLogger(); // Disable
```

**Connecting:**

```js
await emulator.connect();
```

**Output (logs):**

```bash
[14:30:15][INFO][SlaveEmulator] Connecting to emulator...
[14:30:15][INFO][SlaveEmulator] Connected
```

**Disabling:**

```js
await emulator.disconnect();
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] Disconnecting from emulator...
[14:30:15][INFO][SlaveEmulator] Disconnected
```

**Error in constructor:**

```js
const invalid = new SlaveEmulator(300); // >247
```

**Output:**

```bash
Error: Slave address must be a number between 0 and 247
```

## Main Methods

### 1. infinityChange({ typeRegister, register, range, interval })

Starts an infinite change of a value (random in range) over an interval.

**Parameters:**

- `typeRegister (string):` 'Holding', 'Input', 'Coil', 'Discrete'.
- `register (number):` Address (0–65535).
- `range (number[]):` [min, max] for registers; ignored for coils (random boolean).
- `interval (number):` ms (positive).

**Returns:** void.
**Errors:** Invalid params, range min>max, invalid type.

**Example:**

```js
emulator.infinityChange({
  typeRegister: 'Holding',
  register: 100,
  range: [0, 1000],
  interval: 1000,
});
// Stop
emulator.stopInfinityChange({ typeRegister: 'Holding', register: 100 });
```

**Output (logs, level >= 'info'):**

```bash
[14:30:15][INFO][SlaveEmulator] Infinity change started { typeRegister: 'Holding', register: 100, interval: 1000 }
[14:30:16][DEBUG][SlaveEmulator] Infinity change updated { typeRegister: 'Holding', register: 100, value: 456 }
[14:30:16][DEBUG][SlaveEmulator] Infinity change stopped { typeRegister: 'Holding', register: 100 }
```

### 2. stopInfinityChange({ typeRegister, register })

Stops a task based on a key.

**Parameters:**

- typeRegister (string), register (number).
  **Returns:** void.
  **Example:** See above.

### 3. setException(functionCode, address, exceptionCode)

Sets an exception for funcCode+address.

**Parameters:**

- `functionCode (number):` e.g., 3.
- `address (number):` 0–65535.
- `exceptionCode (number):` e.g., 1 (Illegal Function).
  **Returns:** void.

**Example:**

```js
emulator.setException(3, 100, 1); // Illegal Function on read addr 100
emulator.clearExceptions(); // Clear all
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] Exception set: functionCode=0x3, address=100, exceptionCode=0x1
[14:30:15][INFO][SlaveEmulator] All exceptions cleared
```

### 4. addRegisters(definitions)

Bulk adds registers from an array of objects { start, value }.

**Parameters:**

- `definitions (object):` { coils: [{start, value}], discrete: [...], holding: [...], input: [...] }.
  **Returns:** void.
  **Errors:** Invalid definitions.

**Example:**

```js
const defs = {
  holding: [
    { start: 0, value: 123 },
    { start: 1, value: 456 },
  ],
  coils: [{ start: 10, value: true }],
};
emulator.addRegisters(defs);
console.log('Holding 0:', emulator.getHoldingRegister(0)); // 123
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] Registers added successfully { coils: 1, discrete: 0, holding: 2, input: 0 }
Holding 0: 123
```

### 5. setCoil(address, value), getCoil(address)

Sets/reads coil (boolean).

**Parameters:**

- `address (number):` 0–65535.
- `value (boolean):` For set.
  **Returns:** void (set) / boolean (get, default false).
  **Errors:** Invalid address/value.

**Example:**

```js
emulator.setCoil(10, true);
console.log('Coil 10:', emulator.getCoil(10)); // true
```

**Output:**

```bash
[14:30:15][DEBUG][SlaveEmulator] Coil set { address: 10, value: true }
Coil 10: true
```

### 6. readCoils(startAddress, quantity)

Reads coils (01).

**Parameters:**

- `startAddress (number):` Start.
- `quantity (number):` 1–2000.
  **Returns:** boolean[].
  **Errors:** Invalid addr/quantity, ModbusExceptionError.

**Example:**

```js
emulator.setCoil(0, true);
emulator.setCoil(1, false);
const coils = emulator.readCoils(0, 2);
console.log('Coils:', coils); // [true, false]
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] readCoils { startAddress: 0, quantity: 2 }
Coils: [ true, false ]
```

### 7. writeSingleCoil(address, value)

Writes one coil (05).

**Parameters:**

- `address (number)`
- `value (boolean)`
  **Returns:** void.

**Example:**

```js
emulator.writeSingleCoil(10, true);
console.log('Coil 10 after write:', emulator.getCoil(10)); // true
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] writeSingleCoil { address: 10, value: true }
Coil 10 after write: true
```

### 8. writeMultipleCoils(startAddress, values)

Writes multiple coils (0F).

**Parameters:**

- `startAddress (number)`.
- `values (boolean[] | number[]):` 1–1968.
  **Returns:** void.

**Example:**

```js
emulator.writeMultipleCoils(0, [true, false, true]);
console.log('Coils 0-2:', emulator.readCoils(0, 3)); // [true, false, true]
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] writeMultipleCoils { startAddress: 0, values: [true, false, true] }
Coils 0-2: [ true, false, true ]
```

### 9. setDiscreteInput(address, value), getDiscreteInput(address)

Sets/reads discrete input (boolean).

**Parameters:** Same as coils.

**Example:**

```js
emulator.setDiscreteInput(20, true);
console.log('Discrete 20:', emulator.getDiscreteInput(20)); // true
```

**Output:**

```bash
[14:30:15][DEBUG][SlaveEmulator] Discrete Input set { address: 20, value: true }
Discrete 20: true
```

### 10. readDiscreteInputs(startAddress, quantity)

Reads discrete inputs (02).

**Parameters:** Same as readCoils.

**Example:**

```js
const inputs = emulator.readDiscreteInputs(20, 1);
console.log('Inputs:', inputs); // [true]
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] readDiscreteInputs { startAddress: 20, quantity: 1 }
Inputs: [ true ]
```

### 11. setHoldingRegister(address, value), getHoldingRegister(address)

Sets/reads the holding register (0–65535).

**Parameters:**

- `address (number)`.
- `value (number):` For set; mask & 0xFFFF.
  **Returns:** void / number (default 0).

**Example:**

```js
emulator.setHoldingRegister(100, 12345);
console.log('Holding 100:', emulator.getHoldingRegister(100)); // 12345
```

**Output:**

```bash
[14:30:15][DEBUG][SlaveEmulator] Holding Register set { address: 100, value: 12345 }
Holding 100: 12345
```

### 12. readHoldingRegisters(startAddress, quantity)

Reads holding registers (03).

**Parameters:** 1–125.

**Example:**

```js
const regs = emulator.readHoldingRegisters(100, 1);
console.log('Registers:', regs); // [12345]
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] readHoldingRegisters { startAddress: 100, quantity: 1 }
Registers: [ 12345 ]
```

### 13. writeSingleRegister(address, value)

Writes a single holding register (06).

**Parameters:** Same as setHoldingRegister.

**Example:**

```js
emulator.writeSingleRegister(100, 67890);
console.log('After write:', emulator.getHoldingRegister(100)); // 67890
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] writeSingleRegister { address: 100, value: 67890 }
After write: 67890
```

### 14. writeMultipleRegisters(startAddress, values)

Writes multiple holding registers (10).

**Parameters:**

- `startAddress (number)`.
- `values (number[]):` 1–123.

**Example:**

```js
emulator.writeMultipleRegisters(200, [100, 200]);
console.log('Registers 200-201:', emulator.readHoldingRegisters(200, 2)); // [100, 200]
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] writeMultipleRegisters { startAddress: 200, values: [100, 200] }
Registers 200-201: [ 100, 200 ]
```

### 15. setInputRegister(address, value), getInputRegister(address)

Sets/reads the input register (0–65535).

**Parameters:** Same as holding.

**Example:**

```js
emulator.setInputRegister(300, 999);
console.log('Input 300:', emulator.getInputRegister(300)); // 999
```

**Output:**

```bash
[14:30:15][DEBUG][SlaveEmulator] Input Register set { address: 300, value: 999 }
Input 300: 999
```

### 16. readInputRegisters(startAddress, quantity)

Reads input registers (04).

**Parameters:** Same as readHoldingRegisters.

**Example:**

```js
const inputs = emulator.readInputRegisters(300, 1);
console.log('Input registers:', inputs); // [999]
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] readInputRegisters { startAddress: 300, quantity: 1 }
Input registers: [ 999 ]
```

### 17. readHolding(start, quantity), readInput(start, quantity)

Direct reads (without funcCode logic).

**Parameters:** Same as read\*Registers.

**Example:**

```js
console.log('Direct holding:', emulator.readHolding(100, 1)); // [67890]
```

**Output:**

```bash
Direct holding: [ 67890 ]
```

### 18. getRegisterStats()

Statistics: Map dimensions.

**Parameters:** None.
**Returns:** { coils, discreteInputs, holdingRegisters, inputRegisters, exceptions, infinityTasks }.

**Example:**

```js
console.log(emulator.getRegisterStats()); // { coils: 2, ..., infinityTasks: 1 }
```

**Output:**

```bash
{ coils: 2, discreteInputs: 0, holdingRegisters: 3, inputRegisters: 1, exceptions: 1, infinityTasks: 1 }
```

### 19. getRegisterDump()

Dump all values ​​(Object.fromEntries).

**Parameters:** None.
**Returns:** { coils, discreteInputs, holdingRegisters, inputRegisters }.

**Example:**

```js
console.log(emulator.getRegisterDump()); // { holdingRegisters: { '100': 67890, ... } }
```

**Output:**

```bash
{ holdingRegisters: { '100': 67890, '200': 100, '201': 200 }, ... }
```

### 20. getInfinityTasks()

List of task keys.

**Parameters:** None.
**Returns:** string[] (e.g., ['Holding:100']).

**Example:**

```js
console.log(emulator.getInfinityTasks()); // ['Holding:100']
```

**Output:**

```bash
[ 'Holding:100' ]
```

### 21-23. clearAllRegisters(), clearExceptions(), clearInfinityTasks()

Clear data/exceptions/tasks.

**Parameters:** None.
**Returns:** void.

**Example:**

```js
emulator.clearAllRegisters();
console.log('Stats after clear:', emulator.getRegisterStats().holdingRegisters); // 0
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] All registers cleared
Stats after clear: 0
```

### 24. destroy()

Graceful shutdown: stop tasks, disconnect, clear all.

**Parameters:** None.
**Returns:** Promise<_void_>.

**Example:**

```js
await emulator.destroy();
console.log('Destroyed:', !emulator.connected); // true
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] Destroying SlaveEmulator
[14:30:15][INFO][SlaveEmulator] All infinity tasks cleared
[14:30:15][INFO][SlaveEmulator] Disconnecting from emulator...
[14:30:15][INFO][SlaveEmulator] Disconnected
[14:30:15][INFO][SlaveEmulator] All registers cleared
[14:30:15][INFO][SlaveEmulator] All exceptions cleared
[14:30:15][INFO][SlaveEmulator] SlaveEmulator destroyed
Destroyed: true
```

### 25. handleRequest(buffer)

Processes an RTU frame: CRC, slaveAddr, funcCode; returns the response or null.

**Parameters:**

- buffer (Uint8Array | Buffer): The complete frame.
  **Returns:** Uint8Array (response) or null (ingnore/error).
  **Errors:** ModbusExceptionError (internal).

**Example:**

```js
// Simulate a read holding reg 100 frame (qty 1): complete ADU [1, 3, 0, 100, 0, 1, CRC-low, CRC-high]
const requestBuffer = new Uint8Array([1, 3, 0, 100, 0, 1, 0xd5, 0xca]); // Example with CRC
const response = emulator.handleRequest(requestBuffer);
console.log(
  'Response hex:',
  response
    ? Array.from(response)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
    : 'null (exception)'
);
```

**Output:**

```bash
[14:30:15][INFO][SlaveEmulator] Modbus request received { slaveAddress: 1, functionCode: '0x3', data: '00640001', dataLength: 4 }
[14:30:15][INFO][SlaveEmulator] Modbus response created { response: '0103020000d5ca', length: 8 }  // Example
Response hex: 01 03 02 00 00 d5 ca
```

**If the slave is incorrect:**

```bash
[14:30:15][DEBUG][SlaveEmulator] Frame ignored - wrong slave address { targetSlave: 2, thisSlave: 1 }
null
```

**If CRC mismatch:**

```bash
[14:30:15][WARN][SlaveEmulator] CRC mismatch { received: '0x1234', calculated: '0xd5ca', frame: '010300000001ff' }
null
```

## Full usage example

### Example 1: Basic usage of SlaveEmulator

```js
const SlaveEmulator = require('modbus-connect/slave-emulator');

async function basicEmulator() {
  const emulator = new SlaveEmulator(1, { loggerEnabled: true });
  await emulator.connect();

  // Add registers
  emulator.addRegisters({
    holding: [
      { start: 0, value: 123 },
      { start: 1, value: 456 },
    ],
    coils: [{ start: 10, value: true }],
  });

  // Reading
  const regs = emulator.readHoldingRegisters(0, 2);
  console.log('Holding registers 0-1:', regs); // [123, 456]

  // Writing
  emulator.writeSingleRegister(0, 789);
  console.log('Holding 0 after write:', emulator.getHoldingRegister(0)); // 789

  // Exception
  emulator.setException(3, 1, 1); // Illegal Function on addr 1
  try {
    emulator.readHoldingRegisters(1, 1);
  } catch (err) {
    console.log('Expected exception:', err.message); // Modbus exception: function 0x3, code 0x1 (Illegal Function)
  }

  // Infinity change
  emulator.infinityChange({
    typeRegister: 'Holding',
    register: 0,
    range: [0, 100],
    interval: 1000,
  });

  // Statistics
  console.log('Stats:', emulator.getRegisterStats()); // { holdingRegisters: 2, ... }
  console.log('Dump:', JSON.stringify(emulator.getRegisterDump(), null, 2));

  await emulator.destroy();
}

basicEmulator();
```

**Expected output (snippet):**

```bash
[14:30:15][INFO][SlaveEmulator] Registers added successfully { coils: 1, ..., holding: 2 }
Holding registers 0-1: [ 123, 456 ]
[14:30:15][INFO][SlaveEmulator] writeSingleRegister { address: 0, value: 789 }
Holding 0 after write: 789
[14:30:15][INFO][SlaveEmulator] Exception set: functionCode=0x3, address=1, exceptionCode=0x1
[14:30:15][INFO][SlaveEmulator] readHoldingRegisters { startAddress: 1, quantity: 1 }
[14:30:15][WARN][SlaveEmulator] Throwing exception for function 0x3 at address 1: code 0x1
Expected exception: Modbus exception: function 0x3, code 0x1 (Illegal Function)
[14:30:15][INFO][SlaveEmulator] Infinity change started { typeRegister: 'Holding', register: 0, interval: 1000 }
[14:30:16][DEBUG][SlaveEmulator] Infinity change updated { typeRegister: 'Holding', register: 0, value: 42 }
Stats: { coils: 1, discreteInputs: 0, holdingRegisters: 2, inputRegisters: 0, exceptions: 1, infinityTasks: 1 }
Dump: { "coils": { "10": true }, "holdingRegisters": { "0": 42, "1": 456 } }
...
```

### Example 2: Integrating SlaveEmulator with PollingManager (without ModbusClient)

PollingManager can be used to periodically poll the emulator directly (custom functions that call emulator methods).

```js
const PollingManager = require('modbus-connect/polling-manager');
const SlaveEmulator = require('modbus-connect/slave-emulator');

async function pollingWithEmulator() {
  const poll = new PollingManager({ logLevel: 'info' });
  poll.enableAllLoggers('debug'); // Enable logging

  const emulator = new SlaveEmulator(1, { loggerEnabled: true });
  await emulator.connect();

  // Initialize the emulator
  emulator.addRegisters({
    holding: Array.from({ length: 10 }, (_, i) => ({ start: i, value: i * 100 })),
  });

  // Custom polling function: Reads registers from the emulator
  const pollFn = async () => {
    const regs = emulator.readHoldingRegisters(0, 5);
    console.log('Polled registers:', regs); // [0, 100, 200, 300, 400]
    return regs; // Returns for onData
  };

  // Add task to PollingManager
  poll.addTask({
    id: 'emulator-poll',
    interval: 2000,
    fn: pollFn,
    onData: data => console.log('Received from emulator:', data),
    onError: err => console.error('Polling error:', err.message),
    immediate: true,
    maxRetries: 3,
  });

  // Launch
  poll.startAllTasks();

  // Stop after 10 seconds
  setTimeout(async () => {
    pm.stopAllTasks();
    await emulator.destroy();
    pm.clearAll();
  }, 10000);
}

pollingWithEmulator();
```

**Expected output (snippet):**

```bash
[14:30:15][INFO][SlaveEmulator] Registers added successfully { coils: 0, ..., holding: 10 }
[14:30:15][INFO][PollingManager] Task added successfully { id: 'emulator-poll', resourceId: undefined, immediate: true }
[14:30:15][INFO][TaskController] Task started
[14:30:15][INFO][TaskController] Task execution completed { success: true, resultsCount: 1 }
Received from emulator: [ 0, 100, 200, 300, 400 ]
Polled registers: [ 0, 100, 200, 300, 400 ]
[14:30:17][INFO][TaskController] Task execution completed { success: true, resultsCount: 1 }
... (each 2 seconds)
[14:30:25][INFO][PollingManager] Stopping all tasks
[14:30:25][INFO][TaskController] Task stopped
[14:30:25][INFO][SlaveEmulator] Destroying SlaveEmulator
...
```

### Example 3: Simulating RTU communication with an emulator (without an external client)

```js
const SlaveEmulator = require('modbus-connect/slave-emulator');

async function rtuSimulation() {
  const emulator = new SlaveEmulator(1, { loggerEnabled: true });
  await emulator.connect();

  // Set data
  emulator.setHoldingRegister(40001, 1234); // Addr 1 (Modbus offset)

  // Simulate a full RTU request: Read Holding Registers addr 1, qty 1
  // Frame: [slave=1, func=3, addrHi=0, addrLo=1, qtyHi=0, qtyLo=1, CRC-low, CRC-high]
  // CRC for [01 03 00 01 00 01] = 0xE4 0x0C (example; calculate manually or use a utility)
  const requestFrame = new Uint8Array([1, 3, 0, 1, 0, 1, 0xe4, 0x0c]); // Insert the real CRC
  const responseFrame = emulator.handleRequest(requestFrame);

  if (responseFrame) {
    console.log(
      'Response frame hex:',
      Array.from(responseFrame)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
    ); // 01 03 02 04 d2 e4 0c (example: byteCount=2, value=1234=0x04D2)
  } else {
    console.log('No response (e.g., CRC mismatch or wrong slave)');
  }

  await emulator.destroy();
}

rtuSimulation();
```

**Expected output (snippet):**

```bash
[14:30:15][INFO][SlaveEmulator] Modbus request received { slaveAddress: 1, functionCode: '0x3', data: '010001', dataLength: 4 }
[14:30:15][INFO][SlaveEmulator] Modbus response created { response: '01030204d2e40c', length: 8 }
Response frame hex: 01 03 02 04 d2 e4 0c
```

<br>

# <span id="logger">Logger</span>

The Logger class is an advanced logger for Node.js, designed for logging messages with various levels of detail, context support (e.g., for Modbus devices with slaveId, funcCode, etc.), formatting, filtering, highlighting, buffering, and statistics. It uses ANSI colors for console output (if enabled) and supports asynchronous output.

**Logging levels (in order of increasing criticality):**

- `trace` — Detailed debugging
- `debug` — debugging
- `info` — information messages
- `warn` — warning messages
- `error` — error messages

> By default, the level is `info`, colors are on, buffering is disabled.

## Initialization

Connect the module to your project:

```js
const Logger = require('modbus-connect/logger');
const logger = new Logger();
```

> The logger is ready to use. All methods are asynchronous (except for configuration ones), so use **await** or **.then()** as needed.

## Basic logging methods

The logger provides methods for each level: `trace()`, `debug()`, `info()`, `warn()`, `error()`. Each method takes a variable number of arguments (...args), where

- The last argument (if it is an object) is interpreted as **context** (e.g. **{ slaveId: 1, funcCode: 3, exceptionCode: 1 }**).
- The remaining arguments are messages (strings, objects, errors, etc.).

**Example of basic logging:**

```js
await logger.info('Connecting to a device');
await logger.error('Error reading', new Error('Timeout'));
```

**Example with context:**

```js
const context = { slaveId: 1, funcCode: 3, address: 100, quantity: 10, responseTime: 50 };
await logger.debug('Reading registers', context);
```

Output (with colors if enabled):

```bash
[14:30:15][INFO][S:1][F:03/ReadHoldingRegisters][A:100][Q:10][RT:50ms] Reading registers {"slaveId":1,"funcCode":3,"address":100,"quantity":10,"responseTime":50}
```

- `slaveId` — ID device (Modbus Slave ID).
- `funcCode` — Function code (displayed as hex, named from FUNCTION_CODES).
- `exceptionCode` — Exception code (named from EXCEPTION_CODES).
- Other fields: **address**, **quantity**, **responseTime**.

> For errors (Error), a stack trace is automatically added.

## Formatting logs

The log format is configured using the array of fields in `setLogFormat()`. Available fields:

- `timestamp` — time (HH:MM:SS)
- `level` — level [LEVEL]
- `logger` — name logger (if specified)
- `slaveId` — [S:ID]
- `funcCode` — [F:0xXX/Name]
- `exceptionCode` — [E:XX/Name] (only if present)
- `address` — [A:XXX]
- `quantity` — [Q:XX]
- `responseTime` — [RT:XXms]

**Format setting example:**

```js
logger.setLogFormat(['timestamp', 'level', 'slaveId', 'funcCode', 'message']);
```

**Custom Formatters:** Specify a function to format the field.

```js
logger.setCustomFormatter('slaveId', id => `[Device-${id}]`);
logger.setCustomFormatter('responseTime', time => `[Latency: ${time}ms]`);

// Now slaveId will be displayed as [Device-1]
```

## Managing logging levels

- `setLevel(level) `— Set the global level (e.g. 'debug' to show trace/debug/info).
- `getLevel()` — Get current level.
- `setLevelFor(category, level)` — Set the level for the category (logger).
- `pauseCategory(category)` / `resumeCategory(category) `— Temporarily disable/enable a category.

**Example:**

```js
logger.setLevel('debug'); // Show debug and above
logger.setLevelFor('modbus-reader', 'warn'); // For the 'modbus-reader' category - only warn/error

const modbusLogger = logger.createLogger('modbus-reader');
await modbusLogger.info('This won't work'); // Level info < warn
await modbusLogger.warn('Warning!'); // Will be displayed
```

## Log grouping

- `group()` / `groupCollapsed()` — Start group (collapsed).
- `groupEnd()` — Finish group.

> Adds indentation for nesting.

**Example:**

```js
logger.group();
await logger.info('Step 1');
logger.group();
await logger.debug('Substep 1.1');
logger.groupEnd();
await logger.info('Step 2');
logger.groupEnd();
```

Output with indents:

```bash
[INFO] Step 1
  [DEBUG] Substep 1.1
[INFO] Step 2
```

## Filters and Muting

- `mute({ slaveId, funcCode, exceptionCode })` — Exclude logs with the specified values.
- `unmute({ slaveId, funcCode, exceptionCode })` — Unmute.
- `highlight({ slaveId, funcCode, exceptionCode })` — Highlight (red background for exceptionCode).
- `clearHighlights()` — Clear the backlight.

**Example:**

```js
logger.mute({ slaveId: 2 }); // Do not log slaveId=2
logger.highlight({ exceptionCode: 1 }); // Highlight IllegalFunction exceptions

await logger.error('Error', { slaveId: 1, exceptionCode: 1 }); // It will be displayed with backlighting.
await logger.info('OK', { slaveId: 2 }); // Will not be displayed
logger.unmute({ slaveId: 2 });
```

## Global context and transport

- `setGlobalContext(ctx)` — Set the global object (added to all logs).
- `addGlobalContext(ctx)` — Add to the global.
- `setTransportType(type)` — Set the transport type (added to the global transport).

**Example:**

```js
logger.setGlobalContext({ env: 'production' });
logger.setTransportType('tcp');
await logger.info('Messages'); // You are logging {"env":"production","transport":"tcp"}
```

## Buffering and Limits

- `setBuffering(true)` — Enable buffering (at least in the code, the output is asynchronous, a buffer for checking).
- `setFlushInterval(ms)` — Flush interval (default 300ms).
- `setRateLimit(ms)` — Rate limit (default 100 ms, to avoid errors/warnings).
- `flush()` — Flush the buffer (empty, since output is immediate).
- `InspectBuffer()` — Display the buffer's buffer.

**Example:**

```js
logger.setBuffering(true);
await logger.info('Buffer');
logger.inspectBuffer(); // Displays the buffer
```

## Watching and statistics

- `watch(callback)` — Set a callback for each log: callback({ level, args, context }).
- `clearWatch()` — Clear.
- `summary()` — Display statistics (counters, by subordinate Id/funcCode/ExceptionCode).

**Example:**

```js
let count = 0;
logger.watch(({ level }) => {
  if (level === 'error') count++;
});
await logger.error('Test');
console.log(count); // 1

logger.summary(); // Print full statistics
```

## Creating child loggers

`createLogger(name)` — Create a logger with the category name (watches all settings).

**Example:**

```js
const appLogger = logger.createLogger('app');
const dbLogger = logger.createLogger('database');

await appLogger.info('Application startup');
await dbLogger.error('DB error', { slaveId: 5 });
logger.setLevelFor('database', 'error'); // Only DB errors
```

> The child logger has the same methods: tracing, debugging, etc., plus setLevel, pause, and resume.

## Enabling/Disabling

- `enable()`/`disable()` — Global.
- `isEnabled()` — View status.
- `disableColors()` — Disable color.

**Example:**

```js
logger.disable(); // Disable all
await logger.info('Will not be output');
logger.enable();
```

## Full usage example

```js
const ModbusClient = require('modbus-connect/client');
const TransportController = require('modbus-connect/transport');
const Logger = require('modbus-connect/logger');
const PollingManager = require('modbus-connect/polling-manager');

const logger = new Logger();

// Setting global logger settings
logger.setLevel('info');
logger.setLogFormat(['timestamp', 'level', 'logger']);
logger.setCustomFormatter('logger', value => {
  return value ? `[${value}]` : '';
});

const testLogger = logger.createLogger('test-node.js');
const poll = new PollingManager({ logLevel: 'info' });

async function main() {
  const controller = new TransportController();
  await controller.addTransport('com3', 'node', {
    port: 'COM3',
    baudRate: 9600,
    parity: 'none',
    dataBits: 8,
    stopBits: 1,
  });

  const client = new ModbusClient(controller, 13, {
    timeout: 1000,
    crcAlgorithm: 'crc16Modbus',
    retryCount: 3,
    retryDelay: 300,
  });

  await client.connect();

  poll.addTask({
    id: 'modbus-loop',
    resourceId: 'asd',
    interval: 1000,
    immediate: true,
    fn: [
      () => client.readHoldingRegisters(0, 2, { type: 'uint16' }),
      () => client.readInputRegisters(0, 4, { type: 'uint16' }),
    ],
    onData: results => {
      testLogger.info('Data received:', results);
    },
    onError: (error, index, attempt) => {
      testLogger.error(`Error in fn[${index}], attempt ${attempt}`, { error: error.message });
    },
    onStart: () => testLogger.info('Polling started'),
    onStop: () => testLogger.info('Polling stopped'),
    maxRetries: 3,
    backoffDelay: 300,
    taskTimeout: 2000,
  });

  poll.startTask('modbus-loop');
}

main().catch(err => {
  testLogger.error('Fatal error in main', { error: err.message });
});
```

**Output (logs):**

```bash
[10:18:37][INFO][NodeSerialTransport] Serial port COM3 opened
[10:18:37][INFO][test-node.js] Polling started
[10:18:38][INFO][test-node.js] Data received: {"0":[4866,25629],"1":[4866,25629,1986,0]}
[10:18:39][INFO][test-node.js] Data received: {"0":[4866,25629],"1":[4866,25629,1986,0]}
... etc.
```

<br>

# <span id="utils">Utuls</span>

The `utils/utils.js` module provides a set of helper utilities for working with Uint8Array and number/byte conversions in the context of Modbus (or other protocols). Functions include array concatenation, Uint16 conversion (Big/Little Endian), slicing, type checking, allocation, hex representation, and simple byte conversions. The utilities are optimized for low-level buffer management (e.g., in **_packet-builder.js_** or **_ModbusClient_**).

**Key Features:**

- **Uint8Array Focus:** All functions work with Uint8Array for efficiency (Typed Arrays).
- **Endianness:** Supports Big Endian (BE, the Modbus standard) and Little Endian (LE).
- **Validation:** Simple checks (isUint8Array) with errors.
- **Performance:** Uses native methods (subarray, set, fill) without copies where possible.
- **Errors:** Error for invalid arguments (e.g., in toHex).

The module exports functions. No initialization required—just import.

<br>

# <span id="utils-crc">Utils CRC</span>

**All types of CRC calculations**

| Name              | Polynomial                | Initial Value (init)       | Reflection (RefIn/RefOut)  | Final XOR          | CRC Size    | Result Byte Order       | Notes                              |
| ----------------- | ------------------------- | -------------------------- | -------------------------- | ------------------ | ----------- | ----------------------- | ---------------------------------- |
| `crc16Modbus`     | 0x8005 (reflected 0xA001) | 0xFFFF                     | Yes (reflected)            | None               | 16 bits     | Little-endian           | Standard Modbus RTU CRC16          |
| `crc16CcittFalse` | 0x1021                    | 0xFFFF                     | No                         | None               | 16 bits     | Big-endian              | CRC-16-CCITT-FALSE                 |
|                   |                           |                            |                            |                    |             |                         |                                    |
| crc32             | 0x04C11DB7                | 0xFFFFFFFF                 | Yes (reflected)            | XOR 0xFFFFFFFF     | 32 bits     | Little-endian           | Standard CRC32                     |
| crc8              | 0x07                      | 0x00                       | No                         | None               | 8 bits      | 1 byte                  | CRC-8 without reflection           |
| crc1              | 0x01                      | 0x00                       | No                         | None               | 1 bit       | 1 bit                   | Simple CRC-1                       |
| crc8_1wire        | 0x31 (reflected 0x8C)     | 0x00                       | Yes (reflected)            | None               | 8 bits      | 1 byte                  | CRC-8 for 1-Wire protocol          |
| crc8_dvbs2        | 0xD5                      | 0x00                       | No                         | None               | 8 bits      | 1 byte                  | CRC-8 DVB-S2                       |
| crc16_kermit      | 0x1021 (reflected 0x8408) | 0x0000                     | Yes (reflected)            | None               | 16 bits     | Little-endian           | CRC-16 Kermit                      |
| crc16_xmodem      | 0x1021                    | 0x0000                     | No                         | None               | 16 bits     | Big-endian              | CRC-16 XModem                      |
| crc24             | 0x864CFB                  | 0xB704CE                   | No                         | None               | 24 bits     | Big-endian (3 bytes)    | CRC-24 (Bluetooth, OpenPGP)        |
| crc32mpeg         | 0x04C11DB7                | 0xFFFFFFFF                 | No                         | None               | 32 bits     | Big-endian              | CRC-32 MPEG-2                      |
| crcjam            | 0x04C11DB7                | 0xFFFFFFFF                 | Yes (reflected)            | None               | 32 bits     | Little-endian           | CRC-32 JAM (no final XOR)          |

The `utils/crc.js` module provides a set of functions for calculating various Cyclic Redundancy Check (CRC) algorithms—checksums for detecting data errors. These functions work with Uint8Arrays (byte arrays) and return a Uint8Array with CRC bytes (big-endian or little-endian, depending on the algorithm). Popular options are supported: **_CRC-16 (Modbus, CCITT)_**, **_CRC-32_**, **_CRC-8_**, **_CRC-1_**, **_CRC-24_**, and specialized ones (**_1-Wire_**, **_DVB-S2_**, **_Kermit_**, **_XModem_**, **_MPEG-2_**, **_JAM_**).

**Key Features:**

- **Precomputed Table:** For Modbus CRC-16, a table (CRC16_TABLE) is used for speed.
- **Endianness:** Most are big-endian (most significant byte first), CRC-32 are little-endian.
- **Parameters:** All functions accept a Uint8Array; init, polynomial, reflection/XOR are built-in (see JSDoc).
- **Performance:** Loops on bits (8 iterations per byte); the Modbus table speeds things up.
- **Usage:** In packet-builder.js for Modbus RTU; extensible for other protocols.

The module exports functions. No initialization required—just import. No dependencies (self-contained).

<br>

# <span id="plugin-system">Plugin System</span>

The plugin system allows you to extend the functionality of `ModbusClient` without altering the library's core code. You can add support for proprietary commands, specific data types, and custom CRC algorithms by creating plugins directly in your project.

### How It Works

You create a class that implements the `IModbusPlugin` interface and pass its constructor to the `ModbusClient` options. The client will automatically instantiate and register it.

### Step 1: Creating a Plugin

First, create a plugin file in your project (e.g., `plugins/my-plugin.js`). Your plugin class must implement the `IModbusPlugin` interface.

```js
// my-project/plugins/my-plugin.js

/**
 * A plugin to handle proprietary functions for Energia-9 devices.
 * @implements {import('modbus-connect').IModbusPlugin}
 */
class MyPlugin {
  // 1. A unique name for your plugin
  name = 'my-archive-plugin';

  // 2. Define custom functions
  customFunctionCodes = {
    /**
     * A friendly name to call this function by.
     */
    readDailyArchive: {
      /**
       * Builds the request PDU.
       * @param {Date} date - The date for which to request the archive.
       * @returns {Uint8Array} The request PDU.
       */
      buildRequest: date => {
        const pdu = new Uint8Array(4);
        pdu = 0x6a; // Proprietary function code
        pdu = date.getFullYear() - 2000;
        pdu = date.getMonth() + 1;
        pdu = date.getDate();
        return pdu;
      },
      /**
       * Parses the response PDU from the device.
       * @param {Uint8Array} responsePdu - The response PDU.
       * @returns {object[]} An array of parsed archive records.
       */
      parseResponse: responsePdu => {
        if (responsePdu !== 0x6a) {
          throw new Error('Plugin Error: Invalid function code in response');
        }
        const recordCount = responsePdu;
        // ... add your detailed binary data parsing logic here ...
        console.log(`Parsing ${recordCount} records...`);
        return [{ hour: 0, minute: 0, consumption: 12.34 }]; // Placeholder
      },
    },
  };

  // 3. (Optional) Define custom register types
  customRegisterTypes = {
    'special-string': registers => {
      // Custom logic to convert an array of numbers (registers) into a special string format
      let str = '';
      for (const reg of registers) {
        const high = (reg >> 8) & 0xff;
        const low = reg & 0xff;
        if (low !== 0) str += String.fromCharCode(low);
        if (high !== 0) str += String.fromCharCode(high);
      }
      return [str];
    },
  };
}

module.exports = { MyPlugin };
```

### Step 2: Using the Plugin

In your main application file, import your plugin and pass it to the `ModbusClient` constructor.

```js
const ModbusClient = require('modbus-connect/client');
const TransportController = require('modbus-connect/transport');
const { MyPlugin } = require('./plugins/my-plugin.js'); // Import your plugin

async function main() {
  const controller = new TransportController();
  await controller.addTransport('com3', 'node', { port: 'COM3', baudRate: 9600 });
  await controller.connectAll();

  // Pass the plugin class in the options
  const client = new ModbusClient(controller, 1, {
    plugins: [MyPlugin],
  });

  try {
    // Now you can call your custom function by its friendly name
    const records = await client.executeCustomFunction('readDailyArchive', new Date());
    console.log('Archive records:', records);

    // And use your custom data type
    const specialString = await client.readHoldingRegisters(100, 5, { type: 'special-string' });
    console.log('Special string:', specialString);
  } catch (err) {
    console.error('Failed to execute custom function:', err);
  } finally {
    await controller.disconnectAll();
  }
}

main();
```

### Plugin Capabilities

A plugin can provide three types of extensions:

- `customFunctionCodes`: Adds new methods callable via `client.executeCustomFunction()`.
- `customRegisterTypes`: Adds new string identifiers for the `type` option in `readHoldingRegisters` and `readInputRegisters`.
- `customCrcAlgorithms`: Adds new CRC calculation functions, which can be selected via the `crcAlgorithm` option in the client constructor.

> Note: Custom functions now automatically work over both RTU and TCP. The ModbusProtocol layer ensures your proprietary PDU is wrapped in the correct ADU (CRC or MBAP) depending on the transport.

<br>

# <span id="tips-for-use">Tips for use</span>

- For Node.js, the `serialport` package is required (`npm install serialport`).
- For browser usage, HTTPS and Web Serial API support are required (**Google Chrome** or **Edge** or **Opera**).

<br>

# <span id="expansion">Expansion</span>

The recommended way to add proprietary or non-standard functionality is by creating a plugin. See the [Plugin System](#plugin-system) section for a detailed guide.

<br>

# <span id="changelog">CHANGELOG</span>

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

### 2.8.10 (2025-12-05)

- **Fixed:** Critical deadlock in `PollingManager`. Removed `mutex.acquire()` from the internal queue processing loop to prevent tasks and the queue from blocking each other, which previously caused "Task timed out" errors.
- **Fixed:** Improved stability for RS-485 buses with multiple devices. Added a 30ms inter-frame delay between polling tasks to respect bus turnaround times and prevent packet collisions.
- **Fixed:** Optimized error recovery. The system now recovers immediately instead of hanging for extended periods when a device fails or times out.
- **Added:** Mechanisms to support pausing and resuming polling for specific ports/devices. This allows for collision-free "heavy" operations (like initialization or writing registers) by temporarily silencing the polling queue.
- **Improved:** `TaskController` now handles timeouts and retries more gracefully, preventing a single failing device from blocking the entire polling queue for other devices on the same port.

### 2.7.26 (2025-12-04)

- Added a method to `Transport Controller` that allows you to send your custom requests to the port directly

### 2.7.25 (2025-12-02)

- Fixed import for `SlaveEmulator` module

### 2.7.22 (2025-11-28)

- Disabled **DEBUG** logging of `pollingManager` in `TransportController`

### 2.7.21 (2025-11-25)

- **Major Architecture Change:** `PollingManager` is now integrated directly into `TransportController`. Each transport has its own isolated polling queue.
- **Breaking Change:** Removed `resourceId` from polling tasks. Tasks are now assigned to a specific transport ID.
- **API Update:** Added methods `addPollingTask`, `removePollingTask`, `controlPolling` to `TransportController`.
- **Fix:** Resolved deadlocks between polling tasks and manual client requests by implementing shared mutex logic.
- **Fix:** Removed `TransportInfo` unused import in client.
- **Improvement:** `ModbusClient` manual requests now automatically pause the polling queue for thread safety.

### 2.6.9 (2025-11-22)

- **Fixed** a bug in the `polling-manager` module that caused an extra function call in each cycle of the `addTask` method, in the `fn([])` part

### 2.6.8 (2025-11-18)

- **Removed** special functions for the SGM130
- **Added** a [plugin system](#plugin-system) (for custom functions)
- **Added** a importing library types (check [Basic Usage](#basic-usage))
