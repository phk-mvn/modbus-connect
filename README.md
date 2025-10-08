# Modbus Connect (Node.js/Web Serial API)

Modbus Connect is a cross-platform library for Modbus RTU communication in both Node.js and modern browsers (via the Web Serial API). It enables robust, easy interaction with industrial devices over serial ports.

## Navigation through documentation
- [Library Structure](#library-structure)
- [Features](#features)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Modbus Client](#modbus-client)
- [Node Serial Transport](#node-serial-transport)
- [WEB Serial Transport](#web-serial-transport)
- [Factory transport's](#factory-transports)
- [Errors Types](#errors-types)
- [Polling Manager](#polling-manager)
- [Slave Emulator](#slave-emulator)
- [Logger](#logger)
- [Diagnostics](#diagnostics)
- [Utils](#utils)
- [Utils CRC](#utils-crc)
- [Packet Building](#packet-building)
- [Notes](#notes)
- [Tips for use](#tips-for-use)
- [Expansion](#expansion)
- [CHANGELOG](#changelog)

<br>

# <span id="library-structure">Library Structure</span>
- **function-codes/** — PDU implementations for all Modbus functions (register/bit read/write, special functions).
- **transport/** — Transport adapters (Node.js SerialPort, Web Serial API).
- **utils/** — Utilities: CRC, diagnostics, and helpers.
- **polling-manager.js:** A tool for continuously polling a device at a specified interval
- **client.js:** Main `ModbusClient` class for Modbus RTU devices.
- **constants.js:** Protocol constants (function codes, errors, etc.).
- **errors.js:** Error classes for robust exception handling, including `ModbusFlushError`.
- **logger.js:** Event logging utilities.
- **packet-builder.js:** ADU packet construction/parsing (with CRC).

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
// Main Modbus client
import ModbusClient from 'modbus-connect/client';

// Polling manager for scheduled tasks
import PollingManager from 'modbus-connect/polling-manager';

// Transport factory for creating connections
import { createTransport } from 'modbus-connect/transport';

// Logger for diagnostics and debugging
import Logger from 'modbus-connect/logger';

// Slave emulator for testing
import SlaveEmulator from 'modbus-connect/slave-emulator';
```

### Creating Transports
Transports are the underlying communication layers. The library provides a factory function to simplify their creation across different environments.
**Node.js Serial Port:**
```js
const transport = await createTransport('node', {
	port: '/dev/ttyUSB', // or 'COM' on Windows
	baudRate: 19200,
	dataBits: 8,
	stopBits: 1,
	parity: 'none',
	readTimeout: 2000,
	writeTimeout: 1000,
	maxBufferSize: 8192,
	reconnectInterval: 5000,
	maxReconnectAttempts: 10
});
```
**Web Serial API port:**
```js
// Function to request a SerialPort instance, typically called from a user gesture
// or stored from an initial user selection.
const getSerialPort = async () => {
  // In a real application, you might store the port object after the first user selection
  // and return it here, or request a new one if needed.
  // Example for initial request (requires user gesture):
  // const port = await navigator.serial.requestPort();
  // Store port for future use...
  // return port;
  // Example returning a previously stored/stale port (less robust for reconnection):
  // return storedSerialPortInstance;
  // Example forcing a new request (requires user gesture, best for manual reconnection):
  const port = await navigator.serial.requestPort();
  // Update stored reference if needed
  // storedSerialPortInstance = port;
  return port;
};

const transport = await createTransport('web', {
  port: getSerialPort, // Recommended for robustness
  // OR, for simpler cases (less robust reconnection):
  // port: serialPortInstance, // Directly pass a SerialPort object
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  // Optional reconnection parameters for WebSerialTransport
  reconnectInterval: 3000, // ms
  maxReconnectAttempts: 5, // Set to Infinity for continuous attempts (use with caution)
  maxEmptyReadsBeforeReconnect: 10 // Triggers reconnect if data stops flowing
});
```

To set the `read/write` speed parameters, it is necessary to specify parameters such as `writeTimeout` and `readTimeout` during initialization. Example:

```js
const transport = await createTransport('node', {
    writeTimeout: 500,  // your value
    readTimeout: 500    // your value
})
```

> If you do not specify values ​​for `readTimeout/writeTimeout` during initialization, the default parameter will be used - 1000 ms for both values

### Creating a Client
```js
const client = new ModbusClient(transport, slaveId = 1, options = {})
```

- `transport` — transport object (see below)
- `slaveId` —  device address (1..247)
- `options` — `{ timeout, retryCount, retryDelay }`

### Connecting and Communicating

```js
try {
  await client.connect();
  
  console.log('Connected to device');
  
  // Reading holding registers
  const registers = await client.readHoldingRegisters(0, 10); // Start at address 0, read 10 registers
  console.log('Registers:', registers);

  // Writing a single register
  await client.writeSingleRegister(5, 1234); // Write 1234 to register 5
} catch (error) {
  console.error('Communication error:', error.message);
} finally {
  await client.disconnect();
}
```
### Work via RS485

In order to work via RS485, you first need to connect the COM port.
```js
const transport = await createTransport('node', {
    port: 'COM3',
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    writeTimeout: 500,
    readTimeout: 500
})
```

Then, if you have several devices connected via RS485 in series, you need to create a `ModbusClient` for each one.
```js
const device_1 = new ModbusClient(transport, 38, { timeout: 1000 });
const device_2 = new ModbusClient(transport, 51, { timeout: 1000 });
```

Then do whatever you need - read Holding/Input registers, write registers, but for each device separately. Example:
```js
try {
    await transport.connect();

    const registers_1 = await device_1.readHoldingRegisters(0, 10);
    console.log('Registers 1:', registers_1);

    const registers_2 = await device_2.readHoldingRegisters(0, 10);
    console.log('Registers 2:', registers_2);
} catch (error) {
    console.error('Communication error:', error.message);
} finally {
    await device_1.disconnect();
    await device_2.disconnect();
}
```

<br>

# <span id="modbus-client">Modbus Client</span>
The ModbusClient class is a client for working with Modbus devices (RTU/TCP, etc.) via the transport layer. It supports standard Modbus functions (reading/writing registers and coils), SGM130-specific functions (device comments, files, reboot, controller time), and integration with the logger from **Logger**. The client uses a **mutex** for synchronization, error retry, **diagnostics**, and **CRC checking**.

Key Features:
- Transport: Requires a transport instance (e.g., WebSerialTransport or NodeSerialTransport) that implements `connect()`, `disconnect()`, `write()`, `read()`, and `flush()`.
- Retry and Timeouts: Automatic retry (up to retryCount), retryDelay delay, default timeout of 2000ms.
- **Logging:** Integration with Logger (default **'error'** level). Context support (slaveId, funcCode).
- **Data Conversion:** Automatic conversion of registers to types (`uint16`, `float`, `string`, etc.), with byte/word swap support.
- **Errors:** Special classes (`ModbusTimeoutError`, `ModbusCRCError`, `ModbusExceptionError`, etc.).
- **CRC:** Support for various algorithms (`crc16Modbus` by default).
- **Echo:** Optional echo check for serial (for debugging).

**Dependencies:**
- async-mutex for synchronization.
- Functions from ./function-codes/* for building/parsing PDUs.
- Logger, Diagnostics, packet-builder, utils, errors, crc.

**Logging levels:** Defaults to 'error'. Enable enableLogger() for more details.

## Initialization

Include the module:
```js
const ModbusClient = require('modbus-connect/client');
const { createTransport } = require('modbus-connect/transport');
```

Create an instance:
```js
const transport = await createTransport('node', {
	port: 'COM3',
	baudRate: 9600,
	parity: 'none',
	dataBits: 8,
	stopBits: 1,
});
const options = {
    timeout: 3000,          // Timeout (default 2000ms)
    retryCount: 2,          // Number of retry attempts (default 0)
    retryDelay: 200,        // Retry delay (default 100ms)
    diagnostics: true,      // Collection of diagnostic data (true or false)
    echoEnabled: true,      // Echo check (default false)
    crcAlgorithm: 'crc16Modbus' // CRC (default)
};

const client = new ModbusClient(transport, 1, options); // slaveId=1
```

***Initialization output (if logging is enabled):*** *No explicit output in the constructor. Logging is enabled by methods.*

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

**Settings slaveId:**
```js
client.setSlaveId(5);
```

If the ID is invalid: Error: Invalid slave ID. Must be a number between 0 and 247

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

Internally, _setAutoLoggerContext(funcCode) updates { slaveId, transport } + funcCode.

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
### Custom Function (for SGM 130)
| HEX  | Name                 |
| :--: | -------------------- |
| 0x14 | Read Device Comment  |
| 0x15 | Write Device Comment |
| 0x52 | Read File Length     |
| 0x55 | Open File            |
| 0x57 | Close File           |
| 0x5C | Restart Controller   |
| 0x6E | Get Controller Time  |
| 0x6F | Set Controller Time  |
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
- `options.type (string, opt):` 'uint16', 'int16', 'uint32', 'float', 'string', 'hex', 'bool', 'bcd', etc. (see _convertRegisters).

**Example 1: Basic reading of uint16.**
```js
const registers = await client.readHoldingRegisters(100, 2);
console.log(registers); // [1234, 5678] (array of numbers)
```

**Log output (if level >= 'debug'):**
```bash
[14:30:15][DEBUG] Attempt #1 — sending request { slaveId: 1, funcCode: 3 }
[14:30:15][DEBUG] Packet written to transport { bytes: 8, slaveId: 1, funcCode: 3 }
[14:30:15][DEBUG] Echo verified successfully { slaveId: 1, funcCode: 3 } (если echoEnabled)
[14:30:15][DEBUG] Received chunk: { bytes: 9, total: 9 }
[14:30:15][INFO] Response received { slaveId: 1, funcCode: 3, responseTime: 50 }
```

**Example 2: Reading as a float (2 регистра = 1 float).**
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
const response = await client.writeSingleCoil(10, 0xFF00); // Enable
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

## Special functions for SGM130

### 1. readDeviceComment(channel, timeout)
Reading comment (function 0x14). channel: 0-15.

**Example:**
```js
const comment = await client.readDeviceComment(0);
console.log(comment); // { channel: 0, comment: 'Device info' }
```

### 2. writeDeviceComment(comment, timeout)
Write a comment (function 0x15).

**Exmaple:**
```js
const response = await client.writeDeviceComment('New comment');
console.log(response); // { channel: 0, length: 11 }
```

### 3. readFileLength(timeout)
Read file length (0x52).

**Example:**
```js
const length = await client.readFileLength();
console.log(length); // { fileLength: 1024 }
```

### 4. openFile(filename, timeout)
Opening a file (0x55).

**Example:**
```js
const handle = await client.openFile('config.txt');
console.log(handle); // { fileHandle: 1 }
```

### 5. closeFile(timeout)
Closing a file (0x57). Ignores the lack of a response, flushes the transport.

**Example:**
```js
const success = await client.closeFile();
console.log(success); // true
```

### 6. restartController(timeout)
Restarting (0x5C). Ignores the response.

**Example:**
```js
await client.restartController(); // Нет возврата, или { status: true }
```

### 7. getControllerTime(timeout)
Reads the time (0x6E). Returns a Date or object.

**Example:**
```js
const time = await client.getControllerTime();
console.log(time); // { datetime: new Date('2025-10-07T12:00:00') }
```

### 8. setControllerTime(datetime, timeout)
Sets the time (0x6F). datetime: Date.

**Example:**
```js
const now = new Date();
const response = await client.setControllerTime(now);
console.log(response); // { status: 0 }
```

## Internal methods (для расширения)

- `_toHex(buffer):` Buffer to a hex string. Used in logs.
- `_getExpectedResponseLength(pdu):` Expected response length for the PDU.
- `_readPacket(timeout, requestPdu):` Read a packet
- `_sendRequest(pdu, timeout, ignoreNoResponse):` Basic sending method with retry, echo, and diagnostics.
- `_convertRegisters(registers, type):` Register conversion (supports 16/32/64-bit, float, string, BCD, hex, bool, binary with swaps: _sw, _sb, _le, and combinations).

**Conversion example with swap:**
```js
// В readHoldingRegisters options: { type: 'float_sw' } — word swap для float.
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
const { createTransport } = require('modbus-connect/transport');

async function main() {
    const transport = await createTransport('node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
    });
    const client = new ModbusClient(transport, 1, { timeout: 1000, retryCount: 1 });

    client.enableLogger('info'); // Enable logs

    try {
        await client.connect();

        // Read registers
        const regs = await client.readHoldingRegisters(0, 10, { type: 'uint16' });
        console.log('Registers:', regs);

        // Write
        await client.writeSingleRegister(0, 1234);

        // SGM130: time
        const time = await client.getControllerTime();
        console.log('Controller time:', time);

        // Closeing
        await client.disconnect();
    } catch (err) {
        console.error('Modbus error:', err);
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

# <span id="node-serial-transport">Node Serial Transport</span>
The NodeSerialTransport class implements a transport layer for Modbus (or other protocols) based on the serialport library in Node.js. It is designed for server applications that need to connect to serial ports (RS-232/USB-serial). The class supports ***asynchronous operations*** (`connect()`, `disconnect()`, `write()`, `read()`, `flush()`), ***automatic reconnection on errors***, ***read buffering***, ***timeouts***, and ***logger*** integration. It uses a `Mutex` for operation synchronization.

**Key Features:**
- **SerialPort:** Requires serialport installed (npm install serialport).
- **Reconnect:** Automatic reconnection with an interval (default 3000ms), max retries (Infinity), error counter.
- **Buffering:** 'data' events are accumulated in the readBuffer (max 4096 bytes, truncates old ones).
- **Errors:** Integration with ModbusError (TimeoutError, FlushError, etc.).
- **Logging:** Uses Logger (default level 'info', format ['timestamp', 'level', 'logger']).
- **Promises:** connect() returns a Promise, waits for a successful connection/reconnection.

The class is exported as { NodeSerialTransport }. Works in Node.js.

**Dependencies:**

- `serialport:` For the port.
- `async-mutex:` Mutex.
- `../../logger.js:` Logger.
- `../../utils/utils.js:` concatUint8Arrays, sliceUint8Array, allocUint8Array, isUint8Array.
- `../../errors.js:` ModbusError and subclasses.

## Initialization

Include the module:
```js
const { NodeSerialTransport } = require('./transport/node-transports/node-serialport');
```

Create an instance:
```js
const options = {
    baudRate: 19200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    readTimeout: 2000,
    writeTimeout: 1000,
    maxBufferSize: 8192,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
};

const transport = new NodeSerialTransport('/dev/ttyUSB0', options);
```

**Initialization output (logs if level >= 'info'; simulation):** No explicit output in the constructor.

**Connection:**
```js
await transport.connect();
```

**Output (logs):**
```bash
[14:30:15][INFO][NodeSerialTransport] Serial port /dev/ttyUSB0 opened
```

**Disconnectiong:**
```js
await transport.disconnect();
```

**Output:**
```bash
[14:30:15][INFO][NodeSerialTransport] Serial port /dev/ttyUSB0 closed
```

## Main Methods

All methods are asynchronous. They use a Mutex to serialize operations.
## 1. connect()
Connects to the port: creates/opens a SerialPort, adds handlers ('data', 'error', 'close'), starts buffering. Automatically reconnects on errors.

**Parameters:** None.
**Returns:** Promise<_void_> (waits for a successful connection).
**Errors:** ModbusTimeoutError, Error('Max reconnect attempts...').

**Example:**
```js
try {
    await transport.connect();
    console.log('Connected:', transport.isOpen); // true
} catch (err) {
    console.error('Connect failed:', err.message);
}
```

**Output (logs):**
```bash
[14:30:15][INFO][NodeSerialTransport] Serial port /dev/ttyUSB0 opened
Connected: true
```

**On reconnect (error + auto):**
```bash
[14:30:15][ERROR][NodeSerialTransport] Serial port /dev/ttyUSB0 error: Some error
[14:30:15][INFO][NodeSerialTransport] Scheduling reconnect to /dev/ttyUSB0 in 3000 ms (attempt 1) due to: Some error
[14:30:18][INFO][NodeSerialTransport] Reconnect attempt 1 successful
```

## 2. disconnect()
Disconnecting: closes the port Removes handlers, stops reconnection.

**Parameters:** None.
**Returns:** Promise<_void_>.

**Example:**
```js
await transport.disconnect();
console.log('Disconnected:', !transport.isOpen); // true
```

**Output:**
```bash
[14:30:15][INFO][NodeSerialTransport] Serial port /dev/ttyUSB0 closed
Disconnected: true
```

## write(buffer)
Writes a Uint8Array to the port with drain (waits for sending).

**Parameters:**
- `buffer (Uint8Array):` Data.
**Returns:** Promise<_void_>.
**Errors:** Error('Port is closed'), serialport errors.

**Example:**
```js
const data = new Uint8Array([0x01, 0x03, 0x00]);
await transport.write(data);
console.log('Written:', data.length, 'bytes');
```

**Output (logs):**
```bash
[14:30:15][TRACE][NodeSerialTransport] Read 5 bytes from /dev/ttyUSB0  // Нет явного лога write, но trace для read
Written: 5 bytes
```

## 3. read(length, timeout = options.readTimeout)
Reads length bytes from the buffer with a timeout (poll every 10ms).

**Parameters:**
- `length (number):` Number of bytes.
- `timeout (number, optional):` Timeout.
**Returns:** Promise<_Uint8Array_>.
**Errors:** ModbusTimeoutError, ModbusFlushError, Error('Port is closed').

**Example:**
```js
const received = await transport.read(5, 2000);
console.log('Read hex:', Array.from(received).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00 00 01
```

**Output (logs):**
```bash
[14:30:15][TRACE][NodeSerialTransport] Read 5 bytes from /dev/ttyUSB0
Read hex: 01 03 00 00 01
```

**On timeout:**
```bash
[14:30:15][ERROR][NodeSerialTransport] Read timeout on /dev/ttyUSB0
Error: Read timeout
```

## 4. flush()
Clears the readBuffer and resets the state. Blocks read/write (FlushError).

**Parameters:** None.
**Returns:** Promise<_void_>.

**Example:**
```js
await transport.flush();
console.log('Buffer flushed, length:', transport.readBuffer.length); // 0
```

**Output (logs):**
```bash
[14:30:15][INFO][NodeSerialTransport] Flushing NodeSerial transport buffer
[14:30:15][INFO][NodeSerialTransport] NodeSerial read buffer flushed
[14:30:15][INFO][NodeSerialTransport] NodeSerial transport flush completed
Buffer flushed, length: 0
```

## 5. destroy()
Destroys the transport: disconnects, clears, and disconnects reconnection.

**Parameters:** None.
**Returns:** void (synchronous).

**Example:**
```js
transport.destroy();
console.log('Destroyed:', !transport.isOpen); // true
```

**Output (logs):**
```bash
[14:30:15][INFO][NodeSerialTransport] Port /dev/ttyUSB0 destroyed
Destroyed: true
```

<br>

# <span id="web-serial-transport">WEB Serial Transport</span>
The WebSerialTransport class implements a transport layer for Modbus (or other protocols) based on the Web Serial API (browser serial port). It is designed for web applications that require connection to serial devices (e.g., USB-to-Serial adapters). The class supports ***asynchronous operations*** (`connect()`, `disconnect()`, `write()`, `read()`, `flush()`), ***automatic reconnection on errors***, ***read buffering***, ***timeouts***, and ***logger*** integration. It uses a `Mutex` to synchronize operations.

**Key Features:**
- **Web Serial API:** Requires HTTPS and a user gesture (navigator.serial.requestPort()).
- **Reconnect:** Automatic reconnection with an interval (default 3000ms), maximum attempts (Infinity), empty read counter (max 10 before reconnection).
- **Buffering:** Background reading (read loop), readBuffer buffer for data accumulation.
- **Errors:** Integration with ModbusError (TimeoutError, FlushError, etc.).
- **Logging:** Uses Logger (default level 'info', format ['timestamp', 'level', 'logger']).

The class is exported as { WebSerialTransport }. Requires a browser with Web Serial support (Chrome/Edge 89+).

**Dependencies:**
- `../../logger.js:` Logger.
- `../../utils/utils.js:` allocUint8Array.
- `async-mutex:` Mutex.
- `../../errors.js:` ModbusError and subclasses.

## Initialization

Include the module
```js
import { WebSerialTransport } from './transport/web-transports/web-serialport.js'; // Path
// Or in Node (for tests): const { WebSerialTransport } = require('./transport/web-transports/web-serialport');
```

Create an instance:
```js
const port = async () => {
    const newPort = await navigator.serial.requestPort({ filters: [] });
    return newPort;
};

// Options port
const options = {
    baudRate: 19200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    readTimeout: 2000,
    writeTimeout: 1000,
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
    maxEmptyReadsBeforeReconnect: 5
};

const transport = new WebSerialTransport(port, options);
```

**Output on initialization (logs if level >= 'info'; simulation):** No explicit output in the constructor. Logs are activated upon connect.

**Connection:**
```js
await transport.connect();
```

**Output (logs):**
```bash
[14:30:15][INFO][WebSerialTransport] WebSerial port opened successfully with new instance
```

**Disconnecting:**
```js
await transport.disconnect();
```

**Output:**
```bash
[14:30:15][INFO][WebSerialTransport] Disconnecting WebSerial transport...
[14:30:15][INFO][WebSerialTransport] WebSerial transport disconnected successfully
```

**Error in constructor:**
```js
const invalid = new WebSerialTransport('not a function'); // Not a function
```

**Output:**
```bash
Error: A port factory function must be provided to WebSerialTransport
```

## Main Methods

All methods are asynchronous. Use a Mutex to serialize operations.

### 1. connect()
Connects to the port: opens, sets up a reader/writer, starts a read loop. Automatically reconnects on errors.

**Parameters:** None.
**Returns:** Promise<_void_>.
**Errors:** ModbusTimeoutError, ModbusTooManyEmptyReadsError, etc.

**Example:**
```js
try {
    await transport.connect();
    console.log('Connected:', transport.isOpen); // true
} catch (err) {
    console.error('Connect failed:', err.message);
}
```

**Output (logs):**
```bash
[14:30:15][DEBUG][WebSerialTransport] Requesting new SerialPort instance from factory...
[14:30:15][DEBUG][WebSerialTransport] New SerialPort instance acquired.
[14:30:15][DEBUG][WebSerialTransport] Starting read loop
[14:30:15][INFO][WebSerialTransport] WebSerial port opened successfully with new instance
Connected: true
```

**When reconnecting (error + auto):**
```bash
[14:30:15][WARN][WebSerialTransport] Connection loss detected: Error: Some error
[14:30:15][INFO][WebSerialTransport] Auto-reconnect enabled, starting reconnect process...
[14:30:15][INFO][WebSerialTransport] Scheduling reconnect to WebSerial port in 3000 ms (attempt 1) due to: Some error
[14:30:18][INFO][WebSerialTransport] Reconnect attempt 1 successful
```

### 2. disconnect()
Disconnecting: closes the port, cleans up resources, stops reconnecting.

**Parameters:** None.
**Returns:** Promise<_void_>.

**Example:**
```js
await transport.disconnect();
console.log('Disconnected:', !transport.isOpen); // true
```

**Output:**
```bash
[14:30:15][INFO][WebSerialTransport] Disconnecting WebSerial transport...
[14:30:15][DEBUG][WebSerialTransport] Closing port...
[14:30:15][DEBUG][WebSerialTransport] Port closed successfully.
[14:30:15][INFO][WebSerialTransport] WebSerial transport disconnected successfully
Disconnected: true
```

### 3. write(buffer)
Writes a Uint8Array to the port with a timeout volume. Throws FlushError on flush.

**Parameters:**
- `buffer(Uint8Array):` Data to write.
**Returns:** Promise<_void_>.
**Errors:** ModbusTimeoutError, ModbusFlushError.

**Example:**
```js
const data = new Uint8Array([0x01, 0x03, 0x00]);
await transport.write(data);
console.log('Written:', data.length, 'bytes');
```

**Output (logs):**
```bash
[14:30:15][DEBUG][WebSerialTransport] Wrote 5 bytes to WebSerial port
Written: 5 bytes
```

**On timeout:**
```bash
[14:30:15][WARN][WebSerialTransport] Write timeout on WebSerial port
Error: Write timeout
```

### 4. read(length, timeout = options.readTimeout)
Reads length bytes from the timeout buffer. Waits for the buffer to accumulate.

**Parameters:**
- `length (number):` Number of bytes.
- `timeout (number, optional):` Timeout.
**Returns:** Promise<_Uint8Array_>.
**Errors:** ModbusTimeoutError, ModbusFlushError.

**Example:**
```js
const received = await transport.read(5, 2000);
console.log('Read hex:', Array.from(received).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00 00 01
```

**Output (logs):**
```bash
[14:30:15][DEBUG][WebSerialTransport] Read 5 bytes from WebSerial port
Read hex: 01 03 00 00 01
```

**On timeout:**
```bash
[14:30:15][WARN][WebSerialTransport] Read timeout on WebSerial port
Error: Read timeout
```

### 5. flush()
Clears readBuffer and resets counters. Blocks write/read (FlushError).

**Parameters:** None.
**Returns:** Promise<_void_>.

**Example:**
```js
await transport.flush();
console.log('Buffer flushed, length:', transport.readBuffer.length); // 0
```

**Output (logs):**
```bash
[14:30:15][DEBUG][WebSerialTransport] Flushing WebSerial transport buffer
[14:30:15][DEBUG][WebSerialTransport] WebSerial read buffer flushed
[14:30:15][DEBUG][WebSerialTransport] WebSerial transport flush completed
Buffer flushed, length: 0
```

### 5. destroy()
Destroys the transport: disconnects, clears, disconnects reconnect.

**Parameters:** None.
**Returns:** void (synchronous).

**Example:**
```js
transport.destroy();
console.log('Destroyed:', !transport.isOpen); // true
```

**Output (logs):**
```bash
[14:30:15][INFO][WebSerialTransport] Destroying WebSerial transport...
[14:30:15][DEBUG][WebSerialTransport] Error closing port during destroy: ... (if error)
Destroyed: true
```

<br>

# <span id="factory-transports">Factory Transport's</span>
The` transport/factory.js` module is a factory for creating Modbus transport instances (serial or TCP) depending on the environment (Node.js or Web). The createTransport function asynchronously returns a Transport object implementing the interface (connect(), disconnect(), write(), read(), flush()). This allows for abstracting low-level access (***SerialPort*** for Node, ***Web Serial API*** for the browser).

**Key Features:**
- **Transport Types:**
	- `node:` Node.js serial (uses ***serialport***).
	- `web`: Web serial (uses ***Web Serial API***).
- **Options:** Passed to the transport constructor (e.g., baudRate for serial).
- **Logging:** Integration with Logger (from '../logger.js'); sets the transport to the context. Logs at the 'error' level by default.
- **Validation:** Checks for the presence of port/path; throws Error on errors.
- **Reconnect:** For 'web', uses portFactory to reuse the port (recommended for robust reconnects).

The module exports { createTransport }. No state—just call the function.

**Dependencies:**
- `../logger.js:` For logging.
- `./node-transports/node-serialport.js:` NodeSerialTransport.
- `./web-transports/web-serialport.js:` WebSerialTransport.

## Initialization

Include the module
```js
const { createTransport } = require('modbus-connect/transport');
```

Or in the browser:
```js
import { createTransport } from 'modbus-connect/transport';
```

The function is ready to use. Enable logging if needed:
```js
const Logger = require('modbus-connect/logger');
const logger = new Logger();
logger.enableLogger('debug'); // For details
```

## Main functions

### 1. createTransport(type, options = {})
Asynchronously creates a transport. Returns a Promise<_Transport_>

**Parameters:**
- `type (string):` Type ('node', 'web'; others - error).
- `options (object, opt):` Config:
- `For node:` { port: '/dev/ttyUSB0', baudRate: 9600, ... } (SerialPort options).
- `For web:` { port: SerialPort instance } (or portFactory: async () => SerialPort for reconnects).
**Returns:** Promise<_Transport_> - an instance (NodeSerialTransport or WebSerialTransport).
**Errors:**
- Error: Missing "port" (or "path") option for node transport.
- Error: Missing "port" option for web transport.
- Error: Unknown transport type: ${type}.
- Logged in Logger: Failed to create transport of type "${type}": ${err.message}.

**Example 1: Node.js serial transport.**
```js
async function createNodeSerial() {
    try {
        const transport = await createTransport('node', {
            port: '/dev/ttyUSB0',
            baudRate: 19200,
            dataBits: 8,
            stopBits: 1,
            parity: 'none'
        });
        console.log('Created transport:', transport.constructor.name); // NodeSerialTransport
        return transport;
    } catch (err) {
        console.error('Failed:', err.message);
    }
}

createNodeSerial();
```

**Output (logs if level >= 'debug'; simulation):**
```bash
[14:30:15][DEBUG][factory] Creating NodeSerialTransport with port /dev/ttyUSB0
[14:30:15][INFO] Transport created { type: 'node' }  // if logs are in the transport
Created transport: NodeSerialTransport
```

**Example 2: Web serial transport (with port instance).**
```js
// In the browser, after navigator.serial.requestPort()
async function createWebSerial(port) {
    try {
        const transport = await createTransport('web', { port });
        console.log('Created transport:', transport.constructor.name); // WebSerialTransport
        return transport;
    } catch (err) {
        console.error('Failed:', err.message);
    }
}

// Simulation: const port = await navigator.serial.requestPort();
createWebSerial(port);
```

**Output (logs):**
```bash
[14:30:15][DEBUG][factory] WebSerialTransport portFactory: Returning provided port instance
[14:30:15][DEBUG][factory] Creating WebSerialTransport with provided port
[14:30:15][DEBUG][factory] WebSerialTransport portFactory: Port seems to be in use, trying to close...
[14:30:15][DEBUG][factory] WebSerialTransport portFactory: Existing port closed
Created transport: WebSerialTransport
```

**Example 3: Error - unknown type.**
```js
try {
    await createTransport('invalid');
} catch (err) {
    console.log('Error:', err.message);
}
```

**output:**
```bash
[14:30:15][ERROR][factory] Failed to create transport of type "invalid": Unknown transport type: invalid
Error: Unknown transport type: invalid
```

**Example 4: Error - missing port.**
```js
try {
    await createTransport('node', {}); // No port
} catch (err) {
    console.log('Error:', err.message);
}
```

**Output:**
```bash
[14:30:15][ERROR][factory] Failed to create transport of type "node": Missing "port" (or "path") option for node transport
Error: Missing "port" (or "path") option for node transport
```

## Full usage example

Integration with ModbusClient (from the previous module). Creating a transport and using it in the client.
```js
const { createTransport } = require('modbus-connect/transport');
const { ModbusClient } = require('modbus-connect/client');
const Logger = require('modbus-connect/logger');

async function modbusExample() {
    const logger = new Logger();
    logger.enableLogger('info'); // Enable logs

    try {
        // Example Node.js
        const transport = await createTransport('node', {
            port: '/dev/ttyUSB0',
            baudRate: 9600
        });

        const client = new ModbusClient(transport, 1, { timeout: 2000 });
        await client.connect();

        const registers = await client.readHoldingRegisters(0, 10);
        console.log('Registers:', registers);

        await client.disconnect();
    } catch (err) {
        console.error('Modbus error:', err.message);
    }
}

modbusExample();
```

**Expected output (snippet):**
```bash
[14:30:15][INFO][factory] Transport created implicitly { type: 'node' }
[14:30:15][INFO] Transport connected { transport: 'NodeSerialTransport' }
[14:30:15][INFO] Response received { slaveId: 1, funcCode: 3, responseTime: 50 }
Registers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
[14:30:16][INFO] Transport disconnected { transport: 'NodeSerialTransport' }
```

>For Web: Replace with 'web' and use navigator.serial.requestPort() for the port.

<br>

# <span id="errors-types">Errors Types</span>
The errors.js module defines a hierarchy of error classes for Modbus operations. All classes inherit from the base `ModbusError (extends Error)`, allowing for easy catching in catch blocks (e.g., `catch (err) { if (err instanceof ModbusError) { ... } }`). These classes are used in **ModbusClient** (the previous module) for specific scenarios: **timeouts**, **CRC errors**, **Modbus exceptions**, etc.

**Key Features:**
- **Base Class:** ModbusError — common to all, with name = 'ModbusError'.
- **Specific Classes:** Each has a unique name and default message. ModbusExceptionError uses the EXCEPTION_CODES constants from `./constants/constants.js` to describe exceptions (e.g., 0x01 = 'Illegal Function').
- **Hierarchy:** All extend ModbusError, so instanceof ***ModbusError*** catches everything.
- **Usage:** Throw in code for custom errors or catch from the transport/client. Supports stack and message as standard Error.
- **Constants:** Depends on ***EXCEPTION_CODES*** (object { code: 'description' }).

The module exports classes. No initialization required—just import and use for throw/catch.

**Dependencies:**
- `./constants/constants.js:` EXCEPTION_CODES for ModbusExceptionError.

## Initialization

Include the module
```js
const {
  ModbusError,
  ModbusTimeoutError,
  ModbusCRCError,
  ModbusResponseError,
  ModbusTooManyEmptyReadsError,
  ModbusExceptionError,
  ModbusFlushError
} = require('./errors.js');
```

No constructor or state—the classes are ready to use. Import ***EXCEPTION_CODES*** separately if needed.

## Basic Error Classes
Each class has a constructor with an optional message. When throwing, the message, name, and stack (standard for Error) are displayed.

### 1. ModbusError(message)
Base class for all Modbus errors.

**Parameters:**
- `message (string, optional):` Custom message. Defaults to ''.

**Example:**
```js
try {
    throw new ModbusError('Custom Modbus failure');
} catch (err) {
    console.log('Error name:', err.name);      // ModbusError
    console.log('Message:', err.message);      // Custom Modbus failure
    console.log('Stack:', err.stack);          // Stack trace
}
```

**Output:**
```bash
Error name: ModbusError
Message: Custom Modbus failure
Stack: Error: Custom Modbus failure
    at ... (path/to/file:line:col)
    ...
```

### 2. ModbusTimeoutError(message = 'Modbus request timed out')
Request timeout error.

**Example:**
```js
try {
    throw new ModbusTimeoutError('Read operation timed out after 5s');
} catch (err) {
    console.log('Name:', err.name);            // ModbusTimeoutError
    console.log('Message:', err.message);      // Read operation timed out after 5s
}
```

**Output:**
```bash
Name: ModbusTimeoutError
Message: Read operation timed out after 5s
```

### 3. ModbusCRCError(message = 'Modbus CRC check failed')
There was a CRC check error in the package.

**Example:**
```js
try {
    throw new ModbusCRCError('CRC mismatch in response packet');
} catch (err) {
    console.log('Name:', err.name);            // ModbusCRCError
    console.log('Message:', err.message);      // CRC mismatch in response packet
}
```

**Output:**
```bash
Name: ModbusCRCError
Message: CRC mismatch in response packet
```

### 4. ModbusResponseError(message = 'Invalid Modbus response')
Invalid response error (eg unexpected PDU length).

**Example:**
```bash
try {
    throw new ModbusResponseError('Unexpected PDU length: 10 bytes');
} catch (err) {
    console.log('Name:', err.name);            // ModbusResponseError
    console.log('Message:', err.message);      // Unexpected PDU length: 10 bytes
}
```

**Output:**
```bash
Name: ModbusResponseError
Message: Unexpected PDU length: 10 bytes
```

### 5. ModbusTooManyEmptyReadsError(message = 'Too many empty reads from transport')
Too many empty reads from transport (e.g., serial)

**Example:**
```js
try {
    throw new ModbusTooManyEmptyReadsError('5 consecutive empty reads');
} catch (err) {
    console.log('Name:', err.name);            // ModbusTooManyEmptyReadsError
    console.log('Message:', err.message);      // 5 consecutive empty reads
}
```

**Output:**
```bash
Name: ModbusTooManyEmptyReadsError
Message: 5 consecutive empty reads
```

### 6. ModbusExceptionError(functionCode, exceptionCode)
Modbus exception error (response with funcCode | 0x80). Uses EXCEPTION_CODES for description.

**Parameters:**
- `functionCode (number):` Original funcCode (without 0x80).
- `exceptionCode (number):` Exception code (0x01–0xFF).

**Example 1: Basic (Illegal Function, code 0x01 for func 0x03).**
```js
try {
    throw new ModbusExceptionError(0x03, 0x01);
} catch (err) {
    console.log('Name:', err.name);            // ModbusExceptionError
    console.log('Message:', err.message);      // Modbus exception: function 0x3, code 0x1 (Illegal Function)
    console.log('functionCode:', err.functionCode); // 3
    console.log('exceptionCode:', err.exceptionCode); // 1
}
```

**Output:**
```bash
Name: ModbusExceptionError
Message: Modbus exception: function 0x3, code 0x1 (Illegal Function)
functionCode: 3
exceptionCode: 1
```

**Example 2: Unknown code (fallback 'Unknown Exception').**
```js
try {
    throw new ModbusExceptionError(0x06, 0xFF);
} catch (err) {
    console.log('Message:', err.message);      // Modbus exception: function 0x6, code 0xff (Unknown Exception)
}
```

**Output:**
```bash
Message: Modbus exception: function 0x6, code 0xff (Unknown Exception)
```

### 8. ModbusFlushError(message = 'Modbus operation interrupted by transport flush')
Error interrupting operation with transport flash (buffer clearing).

**Example:**
```js
try {
    throw new ModbusFlushError('Flush during read registers');
} catch (err) {
    console.log('Name:', err.name);            // ModbusFlushError
    console.log('Message:', err.message);      // Flush during read registers
}
```

**Output:**
```bash
Name: ModbusFlushError
Message: Flush during read registers
```

## Error Catching (General)
All classes are caught as ModbusError.

**Example:**
```js
try {
    // Симуляция Modbus-операции
    throw new ModbusTimeoutError();
} catch (err) {
    if (err instanceof ModbusError) {
        console.log('Modbus error caught:', err.name);
    } else {
        console.log('Other error:', err.message);
    }
}
```

**Output:**
```bash
Modbus error caught: ModbusTimeoutError
```

## Full usage example
Integration with ModbusClient (from the previous module). Simulating throw/catch in the client context.

```js
const { ModbusClient } = require('./client.js');
const {
  ModbusTimeoutError,
  ModbusCRCError,
  ModbusExceptionError
} = require('./errors.js');
const { createTransport } = require('./transport/factory.js');

async function exampleUsage() {
    const transport = await createTransport('node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
    });
    const client = new ModbusClient(transport, 1);

    try {
        await client.connect();

        // Simulation: Throwing errors in the method
        try {
            // Simulate a timeout
            throw new ModbusTimeoutError('Request to slave 1 timed out');
        } catch (readErr) {
            if (readErr instanceof ModbusTimeoutError) {
                console.log('Handled timeout:', readErr.message);
            }
            throw readErr; // Forwarding further
        }

        // Simulate a CRC
        try {
            throw new ModbusCRCError('Bad CRC from device');
        } catch (crcErr) {
            console.log('CRC error:', crcErr.name, crcErr.message);
        }

        // Simulate an exception
        try {
            throw new ModbusExceptionError(0x03, 0x02); // Illegal Address
        } catch (excErr) {
            console.log('Exception details:', {
                func: excErr.functionCode,
                code: excErr.exceptionCode,
                msg: excErr.message
            });
        }

    } catch (err) {
        if (err instanceof ModbusError) {
            console.error('Global Modbus error:', err.name, err.message);
        }
    } finally {
        await client.disconnect();
    }
}

exampleUsage();
```

**Expected output:**
```bash
Handled timeout: Modbus request timed out  // Из первого catch
CRC error: ModbusCRCError Modbus CRC check failed  // Или кастом
Exception details: { func: 3, code: 2, msg: 'Modbus exception: function 0x3, code 0x2 (Illegal Data Address)' }
Global Modbus error: ModbusTimeoutError Request to slave 1 timed out  // Forgotten
```

<br>

# <span id="polling-manager">Polling Manager</span>
The PollingManager class is an advanced manager for managing periodic tasks (polling tasks) in Node.js. It is designed for scenarios where functions need to be executed on a schedule (at intervals), with support for resource queues (to avoid concurrent access to the same resource, such as a Modbus device), error retries, timeouts, pause/resume, statistics, and integration with the Logger (from the previous module).

**Key Features:**
- **Resource Queues:** Tasks bound to the same resourceId (e.g., device ID) are executed sequentially through TaskQueue (internal class) to avoid conflicts.
- **Retries:** Automatic retry with exponential backoff, up to maxRetries.
- **Timeouts:** Each function in a task can have a timeout.
- **Callbacks:** Support for various events (onStart, onError, onData, etc.).
- **Logging:** Integration with Logger, with the ability to enable/disable it per component (PollingManager, TaskQueue, TaskController).
- **Statistics:** Counters for runs, errors, successes, etc.
- **Multitasking:** Support for multiple functions in a single task (fn array).

**Inner classes:**
- **TaskQueue:** Manages a task queue for a single resourceId. Ensures sequencing using a Mutex.
- **TaskController:** Single-task controller. Manages the execution loop, retry, and callbacks.

**Dependencies:**
- **async-mutex** for mutexes.
- **Logger** from ./logger for logging.

**Logging levels:** Disabled by default ('none'). Use the enable*Logger methods to activate.

## Initialization

Include the module:
```js
const PollingManager = require('modbus-connect/polling-manager');
```

Create an instance with configuration (optional):
```js
const config = {
    defaultMaxRetries: 5,      // Max attempts (default 3)
    defaultBackoffDelay: 2000, // Backoff delay (default 1000ms)
    defaultTaskTimeout: 10000, // Task timeout (default 5000ms)
    logLevel: 'info'           // Global level (not used diractly)
};

const poll = new PollingManager(config);
```

**Initialization output (if logging is enabled):**
```bash
[14:30:15][TRACE][TaskController] TaskController trace log
[14:30:15][DEBUG][TaskController] TaskController created { id: undefined, resourceId: undefined, priority: 0, interval: undefined, maxRetries: 3, backoffDelay: 1000, taskTimeout: 5000 }
[14:30:15][WARN][TaskController] TaskController warning log
[14:30:15][ERROR][TaskController] TaskController error log
[14:30:15][TRACE][PollingManager] PollingManager trace log
[14:30:15][DEBUG][PollingManager] PollingManager debug log
[14:30:15][INFO][PollingManager] PollingManager initialized { config: { defaultMaxRetries: 5, defaultBackoffDelay: 2000, defaultTaskTimeout: 10000, logLevel: 'info' } }
[14:30:15][WARN][PollingManager] PollingManager warning log
[14:30:15][ERROR][PollingManager] PollingManager error log
```

- **Logs** from constructors are generated internally, but are not output until enabled.
- `flush()` is called automatically in the constructor.

## Task management methods

| METHOD                    | DESCRIPTION                                      |
| ------------------------- | ------------------------------------------------ |
| addTask(config)           | Add and start a new polling task                 |
| startTask(id)             | Start a task                                     |
| stopTask(id)              | Stop a task                                      |
| pauseTask(id)             | Pause execution                                  |
| resumeTask(id)            | Resume execution                                 |
| restartTask(id)           | Restart a task                                   |
| removeTask(id)            | Remove a task                                    |
| updateTask(id, opts)      | Update a task (removes and recreates)            |
| setTaskInterval(id, ms)   | Dynamically update the task's polling interval   |
| clearAll()                | Stops and removes all registered tasks           |
| restartAllTasks()         | Restart all tasks                                |
| pauseAllTasks()           | Pause all tasks                                  |
| resumeAllTasks()          | Resume all tasks                                 |
| startAllTasks()           | Start all tasks                                  |
| stopAllTasks()            | Stop all tasks                                   |
| getAllTaskStats()         | Get stats for all tasks                          |
| getQueueInfo(resourceId)  | Get detailed queue information                   |
| getSystemStats()          | Get comprehensive system statistics              |
## Status and Checks
| METHOD             | DESCRIPTION                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| isTaskRunning(id)  | Returns true if the task is running                                    |
| isTaskPaused(id)   | Returns true if the task is paused                                     |
| getTaskState(id)   | Returns detailed state info: { stopped, paused, running, inProgress }  |
| getTaskStats(id)   | Returns detailed statistics for the task                               |
| hasTask(id)        | Checks if task exists                                                  |
| getTaskIds()       | Returns list of all task IDs                                           |
## Adding and managing Tasks

### 1. addTask(options)
Adds a new task. Validates options. If resourceId is specified, adds it to the queue. If immediate: true, runs it immediately.

**Parameters:**
```js
poll.addTask({
  // Required parameters
  id: string,                    // Unique task ID (required)
  interval: number,              // Polling interval in milliseconds (required)
  fn: Function | Function[],     // One or multiple async functions to execute (required)
  
  // Optional parameters
  resourceId?: string,           // Resource identifier for queue management
  priority?: number,             // Task priority (default: 0)
  name?: string,                 // Human-readable task name
  immediate?: boolean,           // Run immediately on add (default: false)
  maxRetries?: number,           // Retry attempts per function (default: 3)
  backoffDelay?: number,         // Retry delay base in ms (default: 1000)
  taskTimeout?: number,          // Timeout per function call in ms (default: 5000)
  
  // Lifecycle callbacks
  onData?: Function,             // Called with results on success: (results)
  onError?: Function,            // Called on error: (error, fnIndex, attempt)
  onStart?: Function,            // Called when the task starts
  onStop?: Function,             // Called when the task stops
  onFinish?: Function,           // Called when all functions complete: (success, results)
  onBeforeEach?: Function,       // Called before each execution cycle
  onRetry?: Function,            // Called on retry: (error, fnIndex, attempt)
  onSuccess?: Function,          // Called on successful execution
  onFailure?: Function,          // Called on failed execution
  shouldRun?: Function           // Conditional execution: () => boolean
});
```

**Example 1: A simple task without a resource (independent).**
```js
function sampleFn() {
    return new Promise((resolve) => {
        setTimeout(() => resolve('Data received'), 100);
    });
}

const options = {
    id: 'sample-task',
    interval: 2000,
    fn: sampleFn,
    onData: (results) => console.log('Data received:', results),
    immediate: true,
    maxRetries: 2,
    taskTimeout: 3000
};

poll.addTask(options);
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
[14:30:16][DEBUG][TaskController] Transport flushed successfully (если есть transport)
[14:30:16][INFO][TaskController] Task execution completed { success: true, resultsCount: 1 }
Получены данные: [ 'Data received' ]
[14:30:18][DEBUG][TaskController] Scheduling next run (loop)
... (повтор каждые 2с)
```

**Example 2: Task With a resource and an `fn` array, with an error (simulating a retry).**
```js
function fn1() {
    return new Promise((resolve, reject) => setTimeout(() => reject(new Error('ERROR 1')), 100));
}

function fn2() {
    return new Promise((resolve) => setTimeout(() => resolve('OK 2'), 100));
}

const options2 = {
    id: 'modbus-task',
    resourceId: 'device-1',
    interval: 5000,
    fn: [fn1, fn2],
    onError: (err, idx, retry) => console.log(`ERROR in fn${idx}, attempt ${retry}: ${err.message}`),
    onData: (results) => console.log('Results:', results),
    immediate: true
};

poll.addTask(options2);
```

**Output (if `fn1` failed, `fn2` succeeded after retry):**
```bash
[14:30:15][TRACE][PollingManager] Creating TaskController { id: 'modbus-task', resourceId: 'device-1' }
[14:30:15][DEBUG][PollingManager] Creating new TaskQueue { resourceId: 'device-1' }
[14:30:15][TRACE][TaskQueue] TaskQueue trace log
[14:30:15][DEBUG][TaskQueue] TaskQueue created
[14:30:15][WARN][TaskQueue] TaskQueue warning log
[14:30:15][ERROR][TaskQueue] TaskQueue error log
[14:30:15][INFO][PollingManager] Task added successfully { id: 'modbus-task', resourceId: 'device-1', immediate: true }
[14:30:15][DEBUG][TaskQueue] Task enqueued { taskId: 'modbus-task' }
[14:30:15][DEBUG][TaskQueue] Acquiring mutex for task processing
[14:30:15][DEBUG][TaskQueue] Processing task { taskId: 'modbus-task' }
[14:30:15][INFO][TaskController] Task started
[14:30:15][DEBUG][TaskController] Executing task once
[14:30:15][DEBUG][TaskQueue] Task executed successfully { taskId: 'modbus-task' }
Error in fn0, attempt 1: ERROR 1
[14:30:15][DEBUG][TaskController] Retrying fn[0] with delay { delay: 1000, retryCount: 1 }
[14:30:16][DEBUG][TaskController] Retrying fn[0] with delay { delay: 2000, retryCount: 2 } (else 2 retry)
[14:30:16][WARN][TaskController] Max retries exhausted for fn[0] { fnIndex: 0, retryCount: 3, error: 'ERROR 1' }
[14:30:16][INFO][TaskController] Task execution completed { success: true, resultsCount: 2 } (fn2 success)
Results: [ null, 'OK 2' ]
[14:30:21][DEBUG][TaskQueue] Task marked as ready { taskId: 'modbus-task' }
... (next loop in 5 seconds)
```

**Validation errors:**
- If id is missing: Error: Task must have an `id`
- If a task with ID exists: Error: Polling task with id `sample-task` already exists.

### 2. updateTask(id, newOptions)
Updates a task: removes the old one and adds a new one with the same ID.

**Parameters:**
- **id (string):** Task ID.
**- newOptions (object):** New options (as in addTask, without id).

**Example:**
```js
poll.updateTask('sample-task', { interval: 3000, fn: newFn });
```

**Output:**
```bash
[14:30:15][INFO][PollingManager] Updating task { id: 'sample-task', newOptions: { interval: 3000, fn: [Function] } }
[14:30:15][INFO][PollingManager] Task removed { id: 'sample-task', resourceId: undefined }
[14:30:15][INFO][PollingManager] Task added successfully { id: 'sample-task', resourceId: undefined, immediate: false }
```

>If the task does not exist: Error: Polling task with id `sample-task` does not exist.

### 3. removeTask(id)
Deletes the task, stops it, and removes it from the queue.

**Parameters:**
- id (string).

**Example:**
```js
poll.removeTask('sample-task');
```

**Output:**
```bash
[14:30:15][INFO][TaskController] Task stopped
[14:30:15][INFO][PollingManager] Task removed { id: 'sample-task', resourceId: undefined }
```

>If it doesn't exist: a warning in the logs.

## Managing Task State

### 1. restartTask(id), startTask(id), stopTask(id), pauseTask(id), resumeTask(id)

- `restartTask(id):` Stop and restarts.
- `startTask(id):` Starts (if stopped).
- `stopTask(id):` Stops.
- `pauseTask(id):` Pauses (does not stop the loop).
- `resumeTask(id):` Resumes after a pause.

**Example (sequential):**
```js
poll.addTask({ id: 'test-task', interval: 1000, fn: () => Promise.resolve('test') });
poll.startTask('test-task');  // Launch
setTimeout(() => poll.pauseTask('test-task'), 2000);  // Pause after 2с
setTimeout(() => poll.resumeTask('test-task'), 4000); // Resume
setTimeout(() => poll.stopTask('test-task'), 6000);   // Stop
setTimeout(() => poll.restartTask('test-task'), 8000); // Restart
```

**Output (snippets):**
```bash
[14:30:15][INFO][TaskController] Task started
[14:30:17][INFO][TaskController] Task paused
[14:30:19][INFO][TaskController] Task resumed
[14:30:19][DEBUG][TaskController] Scheduling next run (queued)
[14:30:21][INFO][TaskController] Task stopped
[14:30:23][INFO][TaskController] Task stopped
[14:30:23][INFO][TaskController] Task started
```

### 2. setTaskInterval(id, interval)
Updates the interval.

**Example:**
```js
poll.setTaskInterval('test-task', 5000);
```

**Output:**
```bash
[14:30:15][INFO][TaskController] Interval updated { interval: 5000 }
```

### 3. isTaskRunning(id), isTaskPaused(id)
Return boolean.

**Example:**
```js
console.log(poll.isTaskRunning('test-task')); // true (if running)
console.log(poll.isTaskPaused('test-task'));  // false
```

>No console output, only return values.

### 4. getTaskState(id)
Returns `{ stopped: boolean, paused: boolean, running: boolean, inProgress: boolean }`.

**Example:**
```js
console.log(poll.getTaskState('test-task'));
// { stopped: false, paused: false, running: true, inProgress: false }
```

### 5. getTaskStats(id)
Returns statistics: `{ totalRuns, totalErrors, lastError, lastResult, lastRunTime, retries, successes, failures }`.
```js
const stats = pollingManager.getTaskStats('read-sensors');
// Returns:
{
  totalRuns: 45,           // Total execution attempts
  totalErrors: 3,          // Total errors encountered
  lastError: Error,        // Last error object (if any)
  lastResult: [...],       // Last successful result
  lastRunTime: 1234567890, // Timestamp of last execution
  retries: 7,              // Total retry attempts
  successes: 42,           // Successful executions
  failures: 3              // Failed executions
}
```

**Example (after multiple runs):**
```js
console.log(poll.getTaskStats('test-task'));
// { totalRuns: 3, totalErrors: 1, lastError: Error, lastResult: ['OK'], lastRunTime: 1730000000, retries: 2, successes: 2, failures: 1 }
```

### 6. hasTask(id)
Boolean: whether the task exists.

**Example:**
```js
console.log(poll.hasTask('test-task')); // true
```

### 7. getTaskIds()
Array of all task ID's.

**Example:**
```js
console.log(poll.getTaskIds()); // [ 'sample-task', 'modbus-task' ]
```

## Bulk Operations

### 1. clearAll()
Clears all tasks and queues.

**Example:**
```js
poll.clearAll();
```

**Output:**
```bash
[14:30:15][INFO][PollingManager] Clearing all tasks
[14:30:15][INFO][TaskController] Task stopped (для каждой)
[14:30:15][INFO][PollingManager] All tasks cleared
```

### 2. restartAllTasks(), startAllTasks(), stopAllTasks(), pauseAllTasks(), resumeAllTasks()
Similar to individual tasks, but for all tasks.

**Example:**
```js
poll.startAllTasks();
```

**Output:**
```bash
[14:30:15][INFO][PollingManager] Starting all tasks
[14:30:15][INFO][TaskController] Task started (для каждой)
[14:30:15][INFO][PollingManager] All tasks started
```

### 3. getAllTaskStats()
Object `{ [id]: stats }` for all tasks.

**Example:**
```js
console.log(poll.getAllTaskStats());
// { 'sample-task': { totalRuns: 1, ... }, 'modbus-task': { ... } }
```

## Queues and the System

### 1. getQueueInfo(resourceId)
Queue info: `{ resourceId, queueLength, tasks: [{ id, state }] }`.

**Example:**
```js
console.log(poll.getQueueInfo('device-1'));
// { resourceId: 'device-1', queueLength: 1, tasks: [ { id: 'modbus-task', state: { stopped: false, ... } } ] }
```

>If the queue does not exist: null.

### 2. getSystemStats()
Global statistics: `{ totalTasks, totalQueues, queuedTasks, tasks: { [id]: stats } }`.

**Example:**
```js
console.log(poll.getSystemStats());
// { totalTasks: 2, totalQueues: 1, queuedTasks: 1, tasks: { 'sample-task': {...}, ... } }
```

## Logging Controls
All methods disable logging by default ('none'). Enable it as needed.

### 1. enablePollingManagerLogger(level = 'info'), disablePollingManagerLogger()
For the main PollingManager logger.

**Example:**
```js
poll.enablePollingManagerLogger('debug');
```

>Now PollingManager logs will be output at debug level and higher.

### 2. enableTaskQueueLoggers(level), disableTaskQueueLoggers()
For all queues.

**Example:**
```js
poll.enableTaskQueueLoggers('warn');
```

### 3. enableTaskControllerLoggers(level), disableTaskControllerLoggers()
For all task controllers.

**Example:**
```js
poll.enableTaskControllerLoggers('info');
```

### 4. enableTaskQueueLogger(resourceId, level), disableTaskQueueLogger(resourceId)
For a specific queue.

**Example:**
```js
poll.enableTaskQueueLogger('device-1', 'debug');
```

### 5. enableTaskControllerLogger(taskId, level), disableTaskControllerLogger(taskId)
For a specific task.

**Example:**
```js
poll.enableTaskControllerLogger('sample-task', 'trace');
```

### 6. enableAllLoggers(level), disableAllLoggers()
Enables/disables all.

**Example:**
```js
poll.enableAllLoggers('info');
```

### 7. setLogLevelForAll(level)
Sets the same level for all.

**Example:**
```js
poll.setLogLevelForAll('error');
```

> **Output after enabling (with addTask):** Logs from the corresponding components will become visible, as in the examples above.

## Full usage example
```js
const PollingManager = require('modbus-connect/polling-manager');

const poll = new PollingManager({ defaultMaxRetries: 2 });

// Enable logging
poll.enableAllLoggers('debug');

// Modbus function (simulation)
async function readModbus(slaveId) {
    // Simulate an error sometimes
    if (Math.random() > 0.7) throw new Error('Modbus error');
    return { registers: [1, 2, 3], slaveId };
}

// ADd a task
poll.addTask({
    id: 'modbus-poll',
    resourceId: 'slave-1',
    interval: 3000,
    fn: () => readModbus(1),
    onData: (data) => console.log('Modbus data:', data),
    onError: (err) => console.error('Modbus error:', err.message),
    onStart: () => console.log('Polling started'),
    immediate: true
});

// Update after 10 seconds
setTimeout(() => {
    poll.updateTask('modbus-poll', { interval: 5000 });
}, 10000);

// Statistics
setInterval(() => {
    console.log('Stats:', poll.getSystemStats());
}, 15000);

// Cleanup on exit
process.on('SIGINT', () => {
    poll.clearAll();
    process.exit(0);
});
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

>The class is exported as SlaveEmulator. Asynchronous for connect/disconnect.

## Initialization

Include the module:
```js
const SlaveEmulator = require('modbus-connect/slave-emulator');
const Logger = require('modbus-connect/logger');
```

Create an instance:
```js
const options = {
    loggerEnabled: true  // Enable logging (default: false)
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
emulator.infinityChange({ typeRegister: 'Holding', register: 100, range: [0, 1000], interval: 1000 });
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
    holding: [{ start: 0, value: 123 }, { start: 1, value: 456 }],
    coils: [{ start: 10, value: true }]
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

**Parameters:** Same as read*Registers.

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
const requestBuffer = new Uint8Array([1, 3, 0, 100, 0, 1, 0xD5, 0xCA]); // Example with CRC
const response = emulator.handleRequest(requestBuffer);
console.log('Response hex:', response ? Array.from(response).map(b => b.toString(16).padStart(2, '0')).join(' ') : 'null (exception)');
```

**Output:**
```bash
[14:30:15][INFO][SlaveEmulator] Modbus request received { slaveAddress: 1, functionCode: '0x3', data: '00640001', dataLength: 4 }
[14:30:15][INFO][SlaveEmulator] Modbus response created { response: '0103020000d5ca', length: 8 }  // Пример
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
        holding: [{ start: 0, value: 123 }, { start: 1, value: 456 }],
        coils: [{ start: 10, value: true }]
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
    emulator.infinityChange({ typeRegister: 'Holding', register: 0, range: [0, 100], interval: 1000 });

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
        holding: Array.from({ length: 10 }, (_, i) => ({ start: i, value: i * 100 }))
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
        onData: (data) => console.log('Received from emulator:', data),
        onError: (err) => console.error('Polling error:', err.message),
        immediate: true,
        maxRetries: 3
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
... (каждые 2с)
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
    const requestFrame = new Uint8Array([1, 3, 0, 1, 0, 1, 0xE4, 0x0C]); // Insert the real CRC
    const responseFrame = emulator.handleRequest(requestFrame);

    if (responseFrame) {
        console.log('Response frame hex:', Array.from(responseFrame).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 02 04 d2 e4 0c (example: byteCount=2, value=1234=0x04D2)
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

>By default, the level is `info`, colors are on, buffering is disabled.

## Initialization

Connect the module to your project:
```js
const Logger = require('modbus-connect/logger');
const logger = new Logger();
```

>The logger is ready to use. All methods are asynchronous (except for configuration ones), so use **await** or **.then()** as needed.

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
[14:30:15][INFO][S:1][F:03/ReadHoldingRegisters][A:100][Q:10][RT:50ms] Чтение регистров {"slaveId":1,"funcCode":3,"address":100,"quantity":10,"responseTime":50}
```

- `slaveId` — ID device (Modbus Slave ID).
- `funcCode` — Function code (displayed as hex, named from FUNCTION_CODES).
- `exceptionCode` — Exception code (named from EXCEPTION_CODES).
- Other fields: **address**, **quantity**, **responseTime**.

>For errors (Error), a stack trace is automatically added.

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
logger.setCustomFormatter('slaveId', (id) => `[Device-${id}]`);
logger.setCustomFormatter('responseTime', (time) => `[Latency: ${time}ms]`);

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
  
>Adds indentation for nesting.

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
logger.watch(({ level }) => { if (level === 'error') count++; });
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

>The child logger has the same methods: tracing, debugging, etc., plus setLevel, pause, and resume.

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
const { createTransport } = require('modbus-connect/transport');
const Logger = require('modbus-connect/logger');
const PollingManager = require('modbusc-connect/polling-manager');

const logger = new Logger();

// Setting global logger settings
logger.setLevel('info');
// Setting the log format: timestamp, level, logger
logger.setLogFormat(['timestamp', 'level', 'logger']);
// Setting a custom formatter for the logger
logger.setCustomFormatter('logger', (value) => {
    return value ? `[${value}]` : '';
});

// Create a named logger and save a reference to it
const testLogger = logger.createLogger('test-node.js');
const poll = new PollingManager({ logLevel: 'info' });

async function main() {
    const transport = await createTransport('node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
    });
    const client = new ModbusClient(transport, 13, {

        timeout: 1000,

        crcAlgorithm: 'crc16Modbus',

        retryCount: 3,

        retryDelay: 300,

    });

    await client.connect();

    poll.addTask({
        id: 'modbus-loop',
        resourceId: "asd",
        interval: 1000,
        immediate: true,
        fn: [
            () => client.readHoldingRegisters(0, 2, { type: 'uint16' }),
            () => client.readInputRegisters(0, 4, { type: 'uint16' })
        ],
        onData: (results) => {
            testLogger.info('Data received:', results);
        },
        onError: (error, index, attempt) => {
            testLogger.error(`Error in fn[${index}], attempt ${attempt}`, { error: error.message });
        },
        onStart: () => testLogger.info('Polling started'),
        onStop: () => testLogger.info('Polling stopped'),
        maxRetries: 3,
        backoffDelay: 300,
        taskTimeout: 2000
    });

    poll.startTask('modbus-loop')
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

# <span id="diagnostics">Diagnostics</span>
The Diagnostics class is designed to collect and analyze Modbus communication statistics: request counters, success/error counters, response time, retry counters, exception counters, data volume counters, etc. It integrates with the logger (Logger from '../logger.js') to notify about problems (e.g., high error rates). The class supports multiple slaveIds, threshold notifications (errorRateThreshold, notificationThreshold), health analysis (analyze()), and serialization to JSON/table.

**Key Features:**
- **Counters:** `totalRequests`, `errors`, `timeouts`, `CRC`, `exceptions` (from breakdown to ***EXCEPTION_CODES***).
- **Metrics:** `Avg`/`min`/`max` response time, requests/sec, error rate (%).
- **Notifications:** Auto-log a warning when thresholds are exceeded (e.g., >10% errors).
- **Functions:** recordRequest, recordError, recordSuccess, etc.; mergeWith for aggregation.
- **Logging:** Category 'Diagnostics' (default level 'none'; format ['timestamp', 'level', 'logger']).
- **Constants:** Uses ***FUNCTION_CODES***/***EXCEPTION_CODES*** from '../constants/constants'.

The class is exported as { Diagnostics }. Ideal for production monitoring (e.g., with PollingManager).

**Dependencies:**
- `../constants/constants`: ***FUNCTION_CODES***, ***EXCEPTION_CODES***.
- `../logger`: For logging.

## Initialization

**Reset statistics:**
```js
client.diagnostics.reset(); // Full reset
client.diagnostics.resetStats(['errors', 'retries']); // Partial
```

## Main Methods

Consolidated table of methods from the Diagnostics class

| Method                                                       | Description                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| constructor(options)                                         |  Initializes a diagnostics instance with optional settings like error thresholds and slave IDs.                                       |
| reset()                                                      |  Resets all statistics and counters to their initial state. Use this to start a fresh collection of data.                             |
| resetStats(metrics)                                          |  Resets a specific subset of statistics. Accepts an array of strings (e.g., ['errors', 'responseTimes']) to reset only those metrics. |
| destroy()                                                    | Destroys the diagnostics instance and clears resources, including pausing the logger.                                                 |
| recordRequest(slaveId, funcCode)                             | Records a new request event, incrementing the total request counter and tracking the timestamp.                                       |
| recordRetry(attempts, slaveId, funcCode)                     | Logs retry attempts, adding to the total retry count.                                                                                 |
| recordRetrySuccess(slaveId, funcCode)                        | Records a successful operation after a retry.                                                                                         |
| recordFunctionCall(funcCode, slaveId)                        | Tracks the frequency of each Modbus function code call.                                                                               |
| recordSuccess(responseTimeMs, slaveId, funcCode)             | Logs a successful response, updating response time metrics (last, min, max, average).                                                 |
| recordError(error, options)                                  | Records an error, classifying it (e.g., timeout, CRC, Modbus exception), and tracks the error message.                                |
| recordDataSent(byteLength, slaveId, funcCode)                | Records the number of bytes sent in a request.                                                                                        |
| recordDataReceived(byteLength, slaveId, funcCode)            | Records the number of bytes received in a response.                                                                                   |
| getStats()                                                   | Returns a comprehensive JSON object containing all collected statistics. This is the primary method for accessing all data.           |
| printStats()                                                 | Prints a human-readable, formatted report of all statistics directly to the console via the logger.                                   |
| analyze()                                                    | Analyzes the current statistics and returns an object containing warnings if any metrics exceed their predefined thresholds.          |
| serialize()                                                  | Returns a JSON string representation of all statistics.                                                                               |
| toTable()                                                    | Converts the statistics into an array of objects for tabular presentation.                                                            |
| mergeWith(other)                                             | Combines the statistics from another Diagnostics instance into the current one.                                                       |
### 1. reset()
Reset all counters.

**Parameters:** None.
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordError(new Error('Test'));
console.log('Errors before reset:', result.errorResponses); // 1
client.diagnostics.reset();
console.log('Errors after reset:', result.errorResponses); // 0
```

**Output:**
```bash
Errors before reset: 1
Errors after reset: 0
```

### 2. resetStats(metrics = [])
Resets specific metrics.

**Parameters:**
- metrics (string[], опц.): ['errors', 'retries', 'responseTimes'], etc. (all — full reset).
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.resetStats(['errors']);
console.log('Errors reset:', result.errorResponses); // 0
```

**Output:**
```bash
Errors reset: 0
```

### 3. destroy()
Resets and disables the logger.

**Parameters:** None.
**Returns:** void.

**Example:**
```js
client.diagnostics.destroy();
console.log('Destroyed; logger level:', client.diagnostics.logger.getLevel()); // 'none'
```

**Output:**
```bash
Destroyed; logger level: none
```

### 4. recordRequest(slaveId, funcCode)
Records a request.

**Parameters:**
- `slaveId (number, optional):` Slave ID.
- `funcCode (number, optional):` Function code.
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordRequest(1, 0x03);
console.log('Total requests:', result.totalRequests); // 1
```

**Output (logs, else level >= 'trace'):**
```bash
[14:30:15][TRACE][Diagnostics] Request sent { slaveId: 1, funcCode: 3 }
Total requests: 1
```

### 5. recordRetry(attempts, slaveId, funcCode)
Records the retry.

**Parameters:**
- **attempts** (number): Number of attempts.
- **slaveId** (number, optional).
- **funcCode** (number, optional).
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordRetry(2, 1, 0x03);
console.log('Total retries:', result.totalRetries); // 2
```

**Output (logs, level >= 'debug'):**
```bash
[14:30:15][DEBUG][Diagnostics] Retry attempt #2 { slaveId: 1, funcCode: 3 }
Total retries: 2
```

### 6. recordRetrySuccess(slaveId, funcCode)
Records a successful retry.

**Parameters:**
- slaveId (number, optional).
- funcCode (number, optional).
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordRetrySuccess(1, 0x03);
console.log('Retry successes:', result.totalRetrySuccesses); // 1
```

**Output (logs):**
```bash
[14:30:15][DEBUG][Diagnostics] Retry successful { slaveId: 1, funcCode: 3 }
Retry successes: 1
```

### 7. recordFunctionCall(funcCode, slaveId)
Records a function call.

**Parameters:**
- funcCode (number): Required.
- slaveId (number, optional).
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordFunctionCall(0x03, 1);
console.log('Function calls:', result.functionCallCounts); // { '3': 1 }
```

**Output (logs):**
```bash
[14:30:15][TRACE][Diagnostics] Function called { slaveId: 1, funcCode: 3, funcName: 'ReadHoldingRegisters' }
Function calls: { '3': 1 }
```

### 8. recordSuccess(responseTimeMs, slaveId, funcCode)
Records success.

**Parameters:**
- responseTimeMs (number): Response time.
- slaveId (number, optional).
- funcCode (number, optional).
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordSuccess(50, 1, 0x03);
console.log('Successes:', result.successfulResponses); // 1
console.log('Avg time:', result.averageResponseTime); // 50
```
**Output:**

```bash
Successes: 1
Avg time: 50
```

### 9. recordError(error, options = {})
Records an error; classifies it (timeout, crc, etc.), and notifies when a threshold is met.

**Parameters:**
- error (Error): Required. - options (object, opt.): { code: 'timeout', responseTimeMs: 100, exceptionCode: 1, slaveId: 1, funcCode: 3 }.
**Returns:** void.

**Example 1: Basic error.**
```js
const result = client.diagnostics.recordError(new Error('Timeout'), { code: 'timeout', responseTimeMs: 2000 });
console.log('Errors:', result.errorResponses); // 1
console.log('Timeouts:', result.timeouts); // 1
```

**Output (logs):**
```bash
[14:30:15][ERROR][Diagnostics] Timeout { slaveId: 1, funcCode: undefined, exceptionCode: undefined, responseTime: 2000 }
Errors: 1
Timeouts: 1
```

**Example 2: Modbus exception.**
```js
const result = client.diagnostics.recordError(new ModbusExceptionError(0x03, 0x01), { exceptionCode: 1 });
console.log('Modbus exceptions:', result.modbusExceptions); // 1
console.log('Exception codes:', result.exceptionCodeCounts); // { '1': 1 }
```

**Output:**
```bash
[14:30:15][ERROR][Diagnostics] Modbus exception: function 0x3, code 0x1 (Illegal Function) { slaveId: 1, funcCode: undefined, exceptionCode: 1, responseTime: 0 }
Modbus exceptions: 1
Exception codes: { '1': 1 }
```

**Notification (at threshold):**
```bash
[14:30:15][WARN][Diagnostics] Excessive errors detected { slaveId: '1', errorCount: 11, errorRate: '15.38', lastError: 'Timeout', logger: 'Diagnostics' }
```

### 10. recordDataSent(byteLength, slaveId, funcCode)
Records the sent bytes.

**Parameters:**
- byteLength (number): Volume.
- slaveId (number, optional).
- funcCode (number, optional).
**Returns:** void.

**Example:**
```js
const result = client.diagnostics.recordDataSent(8, 1, 0x03);
console.log('Data sent:', result.totalDataSent); // 8
```

**Output (logs):**
```bash
[14:30:15][TRACE][Diagnostics] Data sent: 8 bytes { slaveId: 1, funcCode: 3 }
Data sent: 8
```

### 11. recordDataReceived(byteLength, slaveId, funcCode)
Records received bytes.

**Parameters:** Same as recordDataSent.

**Example:**
```js
const result = client.diagnostics.recordDataReceived(9, 1, 0x03);
console.log('Data received:', result.totalDataReceived); // 9
```

**Output:**
```bash
[14:30:15][TRACE][Diagnostics] Data received: 9 bytes { slaveId: 1, funcCode: 3 }
Data received: 9
```

### 12. get averageResponseTime()
Getter: Average time (incl. errors).

**Example:**
```js
client.diagnostics.recordSuccess(50);
client.diagnostics.recordSuccess(100);
console.log('Avg success time:', client.diagnostics.averageResponseTime); // 75
```

**Output:**
```bash
Avg success time: 75
```

### 13. get averageResponseTimeAll()
Getter: Average time (incl. errors).

**Example:**
```js
const result = diag.recordError(new Error('Test'), { responseTimeMs: 2000 });
console.log('Avg all time:', result.averageResponseTimeAll); // 2000 (if there was an error)
```

**Output:**
```bash
Avg all time: 2000
```

### 14. get errorRate()
Getter: % errors.

**Example:**
```js
client.diagnostics.recordRequest();
client.diagnostics.recordError(new Error('Test'));
console.log('Error rate:', client.diagnostics.errorRate); // 100
```

**Output:**
```bash
Error rate: 100
```

### 15. get requestsPerSecond()
Getter: Requests/sec (historical).

**Example:**
```js
client.diagnostics.recordRequest(); // Multiple calls
setTimeout(() => {
    console.log('RPS:', client.diagnostics.requestsPerSecond); // ~1 (depending on time)
}, 1000);
```

**Output:**
```bash
RPS: 1
```

### 16. get uptimeSeconds()
Getter: Uptime (sec).

**Example:**
```js
// After 5 seconds
console.log('Uptime:', client.diagnostics.uptimeSeconds); // 5
```

**Output:**
```bash
Uptime: 5
```

### 17. analyze()
Analyzes and returns warnings.

**Parameters:** None.
**Returns:** { warnings: string[], isHealthy: boolean, stats: object }.

**Example:**
```js
client.diagnostics.recordError(new Error('Test'), { responseTimeMs: 2000 }); // >1000ms
const analysis = diag.analyze();
console.log('Healthy:', analysis.isHealthy); // false
console.log('Warnings:', analysis.warnings); // ['High max response time: 2000ms']
```

**Output:**
```bash
Healthy: false
Warnings: ['High max response time: 2000ms']
```

### 18. getStats()
Returns an object with all statistics.

**Parameters:** None.
**Returns:** object (uptimeSeconds, totalRequests, errorRate, etc., with function names from ***FUNCTION_CODES***).

**Example:**
```js
console.log(JSON.stringify(client.diagnostics.getStats(), null, 2));
```

**Output (snippet):**
```json
{
  "uptimeSeconds": 10,
  "totalRequests": 1,
  "successfulResponses": 0,
  "errorResponses": 1,
  "errorRate": 100,
  "functionCallCounts": {
    "3/ReadHoldingRegisters": 1
  },
  "exceptionCodeCounts": {
    "1/Illegal Function": 1
  },
  ...
}
```

### 19. printStats()
Prints formatted statistics to the logs.

**Parameters:** None.
**Returns:** void.

**Example:**
```js
client.diagnostics.printStats();
```

**Output (logs):**
```bash
[14:30:15][INFO][Diagnostics] === Modbus Diagnostics ===
[14:30:15][INFO][Diagnostics] Slave IDs: 1
[14:30:15][INFO][Diagnostics] Uptime: 10 seconds
[14:30:15][INFO][Diagnostics] Total Requests: 1
[14:30:15][INFO][Diagnostics] Successful Responses: 0
[14:30:15][INFO][Diagnostics] Error Responses: 1 (Rate: 100.00%)
...
[14:30:15][INFO][Diagnostics] ========================
```

### 20. serialize()
Returns a JSON string of statistics.

**Parameters:** None.
**Returns:** string.

**Example:**
```js
console.log(client.diagnostics.serialize());
```

**Output:**
```json
{
  "uptimeSeconds": 10,
  ...
}
```

### 21. toTable()
Returns an array of { metric: string, value: any } for tables.

**Parameters:** None.
**Returns:** array.

**Example:**
```js
console.table(client.diagnostics.toTable());
```

**Output (console table):**
```bash
┌─────────┬─────────────┬───────┐
│ (index) │ metric      │ value │
├─────────┼─────────────┼───────┤
│ 0       │  uptime...  │ 10    │
│ 1       │  total...   │ 1     │
...
```

### 22. mergeWith(other)
Merges statistics from another Diagnostics.

**Parameters:**
- other (Diagnostics): The object to merge.
**Returns:** void.

**Example:**
```js
const diag2 = new Diagnostics({ slaveId: 2 });
diag2.recordRequest();
diag.mergeWith(diag2);
console.log('Total requests after merge:', diag.totalRequests); // 1 (if 0)
console.log('Slave IDs:', diag.slaveIds); // [1, 2]
```

**Output (logs):**
```bash
[14:30:15][INFO][Diagnostics] Merged diagnostics { slaveIds: [2] }
Total requests after merge: 1
Slave IDs: [1, 2]
```

<br>

# <span id="utils">Utuls</span>
The `utils/utils.js` module provides a set of helper utilities for working with Uint8Array and number/byte conversions in the context of Modbus (or other protocols). Functions include array concatenation, Uint16 conversion (Big/Little Endian), slicing, type checking, allocation, hex representation, and simple byte conversions. The utilities are optimized for low-level buffer management (e.g., in ***packet-builder.js*** or ***ModbusClient***).

**Key Features:**
- **Uint8Array Focus:** All functions work with Uint8Array for efficiency (Typed Arrays).
- **Endianness:** Supports Big Endian (BE, the Modbus standard) and Little Endian (LE).
- **Validation:** Simple checks (isUint8Array) with errors.
- **Performance:** Uses native methods (subarray, set, fill) without copies where possible.
- **Errors:** Error for invalid arguments (e.g., in toHex).

The module exports functions. No initialization required—just import.

## Initialization

Include the module
```js
const {
    fromBytes,
    concatUint8Arrays,
    uint16ToBytesBE,
    bytesToUint16BE,
    sliceUint8Array,
    isUint8Array,
    allocUint8Array,
    toHex,
    toBytesLE,
    fromBytesLE
} = require('./utils/utils.js');
```

>Functions are ready to use. No dependencies.

## Basic Functions

### 1. fromBytes(...bytes)
Creates a Uint8Array from a variable number of bytes (numbers 0–255).

**Parameters:**
- `...bytes (number...):` Bytes as arguments.
**Returns:** Uint8Array.

**Example:**
```js
const bytes = fromBytes(0x01, 0x03, 0x00);
console.log('Bytes array:', Array.from(bytes)); // [1, 3, 0]
console.log('Hex:', bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00
```

**Output:**
```bash
Bytes array: [1, 3, 0]
Hex: 01 03 00
```

### 2. concatUint8Arrays(arrays)
Concatenates two Uint8Arrays into one.

**Paramameters:**
- arrays (Uint8Array[]): Array of arrays.
**Returns:** Uint8Array.

**Example:**
```js
const arr1 = new Uint8Array([0x01, 0x03]);
const arr2 = new Uint8Array([0x00, 0x00]);
const combined = concatUint8Arrays([arr1, arr2]);
console.log('Combined hex:', Array.from(combined).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00 00
```

**Output:**
```bash
Combined hex: 01 03 00 00
```

### 3. uint16ToBytesBE(value)
Converts uint16 to a Uint8Array (Big Endian: most significant byte first).

**Parameters:**
- value (number): 16-bit number (0–65535).
**Returns:** Uint8Array[2].

**Example:**
```js
const bytes = uint16ToBytesBE(0x0103); // 259 in dec
console.log('BE bytes:', Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03
```

**Output:**
```bash
BE bytes: 01 03
```

### 4. bytesToUint16BE(buf, offset = 0)
Converts Uint8Array[2] (Big Endian) to uint16.

**Parameters:**
- `buf (Uint8Array):` Buffer.
- `offset (number, optional):` Offset (default 0).
**Returns:** number.

**Example:**
```js
const buf = new Uint8Array([0x01, 0x03, 0x00]);
const value = bytesToUint16BE(buf, 0);
console.log('Uint16 BE:', value); // 259 (0x0103)
```

**Output:**
```bash
Uint16 BE: 259
```

### 5. sliceUint8Array(arr, start, end)
Slices a Uint8Array (subarray - view, not a copy).

**Parameters:**
- `arr (Uint8Array): `Original array.
- `start (number):` Start.
- `end (number, optional):` End (inclusive? No, exclusive like slice).
**Returns:** Uint8Array (view).

**Example:**
```js
const full = new Uint8Array([0x01, 0x03, 0x00, 0x01]);
const sliced = sliceUint8Array(full, 1, 3);
console.log('Sliced hex:', Array.from(sliced).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 03 00
console.log('Original modified:', Array.from(full).map(b => b.toString(16).padStart(2, '0')).join(' ')); // Changes to sliced ​​will affect full
sliced[0] = 0xFF; // Modify
console.log('After mod hex:', Array.from(full).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 ff 00 01
```

**Output:**
```bash
Sliced hex: 03 00
Original modified: 01 ff 00 01
After mod hex: 01 ff 00 01
```

### 6. isUint8Array(obj)
Checks if an object is a Uint8Array.

**Parameters:**
- `obj (any):` The object to check.
**Returns:** boolean.

**Example:**
```js
const arr = new Uint8Array([1, 2]);
console.log(isUint8Array(arr)); // true
console.log(isUint8Array([1, 2])); // false
```

**Output:**
```bash
true
false
```

### 7. allocUint8Array(size, fill = 0)
Creates a Uint8Array of the specified size, filled with a value.

**Parameters:**
- `size (number):` Size.
- `fill (number, optional):` Value (0–255, default 0).
**Returns:** Uint8Array.

**Example:**
```js
const arr = allocUint8Array(4, 0xFF);
console.log('Filled hex:', Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(' ')); // ff ff ff ff
```

**Output:**
```bash
Filled hex: ff ff ff ff
```

### 8. toHex(uint8arr)
Converts a Uint8Array to a hex string (without spaces).

**Parameters:**
- uint8arr (Uint8Array): Array.
**Returns:** string.
**Errors:** Error: Argument must be a Uint8Array.

**Example:**
```js
const arr = new Uint8Array([0x01, 0x03, 0x00]);
console.log('Hex string:', toHex(arr)); // 010300
```

**Output:**
```bash
Hex string: 010300
```

**Error example:**
```js
try {
    toHex([1, 3]); // Not a Uint8Array
} catch (err) {
    console.log(err.message);
}
```

**Output:**
```bash
Argument must be a Uint8Array
```

### 9. toBytesLE(value, byteLength = 2)
Converts a number to a Uint8Array (Little Endian: least significant byte first).

**Parameters:**
- `value (number):` Number.
- `byteLength (number, optional):` Length (default 2 for uint16).
**Returns:** Uint8Array.

**Example:**
```js
const bytes = toBytesLE(0x0103, 2); // 259
console.log('LE bytes hex:', Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 03 01
```

**Output:**
```bash
LE bytes hex: 03 01
```

### 10. fromBytesLE(lo, hi)
Converts two bytes (LE: lo=low, hi=high) to a number.

**Parameters:**
- `lo (number):` Low byte.
- `hi (number):` High byte.
**Returns:** number.

**Example:**
```js
const value = fromBytesLE(0x03, 0x01); // LE: 03 01 = 0x0103
console.log('From LE:', value); // 259
```

**Output:**
```bash
From LE: 259
```

## Full usage example

Integration with ***packet-builder.js*** and ***crc.js*** (previous modules). Building a Modbus packet using utilities.
```js
const {
    fromBytes,
    concatUint8Arrays,
    uint16ToBytesBE,
    bytesToUint16BE,
    sliceUint8Array,
    isUint8Array,
    allocUint8Array,
    toHex,
    toBytesLE,
    fromBytesLE
} = require('./utils/utils.js');
const { buildPacket, parsePacket } = require('../packet-builder.js');
const { crc16Modbus } = require('./crc.js');

// PDU: Read Holding Registers (func 0x03, addr 0x0000, qty 0x0001)
const func = fromBytes(0x03);
const addr = uint16ToBytesBE(0x0000);
const qty = uint16ToBytesBE(0x0001);
const pdu = concatUint8Arrays([func, addr, qty]);
console.log('PDU hex:', toHex(pdu)); // 0300000001

// Build packet
const packet = buildPacket(1, pdu, crc16Modbus);
console.log('Full packet hex:', toHex(packet)); // 010300000001d5ca

// Parse
const { slaveAddress, pdu: parsedPdu } = parsePacket(packet, crc16Modbus);
console.log('Parsed slave:', slaveAddress); // 1
console.log('Parsed PDU hex:', toHex(parsedPdu)); // 0300000001

// LE example
const leBytes = toBytesLE(0x0001, 2); // qty in LE
console.log('LE qty hex:', toHex(leBytes)); // 0100
const fromLe = fromBytesLE(leBytes[0], leBytes[1]);
console.log('Back to num:', fromLe); // 1

// Alloc and slice
const buf = allocUint8Array(10, 0x00);
buf.set(pdu, 0);
const sliced = sliceUint8Array(buf, 0, 5);
console.log('Sliced hex:', toHex(sliced)); // 0300000001

// Type check
console.log('Is Uint8Array:', isUint8Array(sliced)); // true
```

**Expected output:**
```bash
PDU hex: 0300000001
Full packet hex: 010300000001d5ca
Parsed slave: 1
Parsed PDU hex: 0300000001
LE qty hex: 0100
Back to num: 1
Sliced hex: 0300000001
Is Uint8Array: true
```

<br>

# <span id="utils-crc">Utils CRC</span>

**All types of CRC calculations**

| Name              | Polynomial                | Initial Value (init)             | Reflection (RefIn/RefOut)  | Final XOR          | CRC Size    | Result Byte Order       | Notes                              |
| ----------------- | ------------------------- | -------------------------------- | -------------------------- | ------------------ | ----------- | ----------------------- | ---------------------------------- |
| `crc16Modbus`     | 0x8005 (reflected 0xA001) | 0xFFFF                           | Yes (reflected)            | None               | 16 bits     | Little-endian           | Standard Modbus RTU CRC16          |
| `crc16CcittFalse` | 0x1021                    | 0xFFFF                           | No                         | None               | 16 bits     | Big-endian              | CRC-16-CCITT-FALSE                 |
|                   |                           |                                  |                            |                    |             |                         |                                    |
| crc32             | 0x04C11DB7                | 0xFFFFFFFF                       | Yes (reflected)            | XOR 0xFFFFFFFF     | 32 bits     | Little-endian           | Standard CRC32                     |
| crc8              | 0x07                      | 0x00                             | No                         | None               | 8 bits      | 1 byte                  | CRC-8 without reflection           |
| crc1              | 0x01                      | 0x00                             | No                         | None               | 1 bit       | 1 bit                   | Simple CRC-1                       |
| crc8_1wire        | 0x31 (reflected 0x8C)     | 0x00                             | Yes (reflected)            | None               | 8 bits      | 1 byte                  | CRC-8 for 1-Wire protocol          |
| crc8_dvbs2        | 0xD5                      | 0x00                             | No                         | None               | 8 bits      | 1 byte                  | CRC-8 DVB-S2                       |
| crc16_kermit      | 0x1021 (reflected 0x8408) | 0x0000                           | Yes (reflected)            | None               | 16 bits     | Little-endian           | CRC-16 Kermit                      |
| crc16_xmodem      | 0x1021                    | 0x0000                           | No                         | None               | 16 bits     | Big-endian              | CRC-16 XModem                      |
| crc24             | 0x864CFB                  | 0xB704CE                         | No                         | None               | 24 bits     | Big-endian (3 bytes)    | CRC-24 (Bluetooth, OpenPGP)        |
| crc32mpeg         | 0x04C11DB7                | 0xFFFFFFFF                       | No                         | None               | 32 bits     | Big-endian              | CRC-32 MPEG-2                      |
| crcjam            | 0x04C11DB7                | 0xFFFFFFFF                       | Yes (reflected)            | None               | 32 bits     | Little-endian           | CRC-32 JAM (no final XOR)          |


The `utils/crc.js` module provides a set of functions for calculating various Cyclic Redundancy Check (CRC) algorithms—checksums for detecting data errors. These functions work with Uint8Arrays (byte arrays) and return a Uint8Array with CRC bytes (big-endian or little-endian, depending on the algorithm). Popular options are supported: ***CRC-16 (Modbus, CCITT)***, ***CRC-32***, ***CRC-8***, ***CRC-1***, ***CRC-24***, and specialized ones (***1-Wire***, ***DVB-S2***, ***Kermit***, ***XModem***, ***MPEG-2***, ***JAM***).

**Key Features:**
- **Precomputed Table:** For Modbus CRC-16, a table (CRC16_TABLE) is used for speed.
- **Endianness:** Most are big-endian (most significant byte first), CRC-32 are little-endian.
- **Parameters:** All functions accept a Uint8Array; init, polynomial, reflection/XOR are built-in (see JSDoc).
- **Performance:** Loops on bits (8 iterations per byte); the Modbus table speeds things up.
- **Usage:** In packet-builder.js for Modbus RTU; extensible for other protocols.

The module exports functions. No initialization required—just import. No dependencies (self-contained).

## Initialization

Include the module
```js
const {
  crc16Modbus,
  crc16CcittFalse,
  crc32,
  crc8,
  crc1,
  crc8_1wire,
  crc8_dvbs2,
  crc16_kermit,
  crc16_xmodem,
  crc24,
  crc32mpeg,
  crcjam
} = require('./utils/crc.js'); // Путь к файлу crc.js
```

>The functions are ready to use. The CRC16_TABLE table is initialized automatically in the IIFE.

## Main Functions
Each function accepts a buffer (Uint8Array) and returns a Uint8Array with the CRC bytes. No errors—valid input is assumed.

### 1. crc16Modbus(buffer)
CRC-16 Modbus (poly 0xA001, init 0xFFFF, no reflection). Standard for Modbus RTU.

**Parameters:**
- `buffer (Uint8Array):` Data for calculation.
**Returns:** Uint8Array[2] — big-endian CRC (low/high? No: [low, high] calculated).

**Example:**
```js
const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]); // ADU example without CRC
const crc = crc16Modbus(data);
console.log('CRC (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // d5 ca
```

**Output:**
```bash
CRC (hex): d5 ca
```

### 2. crc16CcittFalse(buffer)
CRC-16 CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection). Big-endian.

**Example:**
```js
const crc = crc16CcittFalse(data);
console.log('CCITT CRC (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 31 c3 (example)
```

**Output:**
```bash
CCITT CRC (hex): 31 c3
```

### 3. crc32(buffer)
CRC-32 (poly 0x04C11DB7, init 0xFFFFFFFF, reflection, final XOR 0xFFFFFFFF). Little-endian.

**Example:**
```js
const crc = crc32(data);
console.log('CRC32 (hex, LE):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // cb 1e 4d 5a (пример)
```

**Output:**
```bash
CRC32 (hex, LE): cb 1e 4d 5a
```

### 4. crc8(buffer)
CRC-8 (poly 0x07, init 0x00, no reflection). Big-endian (1 bytes).

**Example:**
```js
const crc = crc8(data);
console.log('CRC8 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // f4
```

**Output:**
```bash
CRC8 (hex): f4
```

### 5. crc1(buffer)
CRC-1 (poly 0x01, init 0x00) - simple parity (XOR of all bits).

**Example:**
```js
const crc = crc1(data);
console.log('CRC1 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 00 or 01
```

**Output:**
```bash
CRC1 (hex): 01  // If odd number of 1-bits
```

### 6. crc8_1wire(buffer)
CRC-8 1-Wire (poly 0x31, init 0x00, reflection). Big-endian.

**Example:**
```js
const crc = crc8_1wire(data);
console.log('1-Wire CRC8 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 9a
```

**Output:**
```bash
1-Wire CRC8 (hex): 9a
```

### 7. crc8_dvbs2(buffer)
CRC-8 DVB-S2 (poly 0xD5, init 0x00, no reflection). Big-endian.

**Example:**
```js
const crc = crc8_dvbs2(data);
console.log('DVB-S2 CRC8 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 62
```

**Output:**
```bash
DVB-S2 CRC8 (hex): 62
```

### 8. crc16_kermit(buffer)
CRC-16 Kermit (poly 0x1021, init 0x0000, reflection). Big-endian.

**Example:**
```js
const crc = crc16_kermit(data);
console.log('Kermit CRC16 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 21 89
```

**Output:**
```bash
Kermit CRC16 (hex): 21 89
```

### 9. crc16_xmodem(buffer)
CRC-16 XModem (poly 0x1021, init 0x0000, no reflection). Big-endian.

**Example:**
```js
const crc = crc16_xmodem(data);
console.log('XModem CRC16 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 31 00
```

**Output:**
```bash
XModem CRC16 (hex): 31 00
```

### 10. crc24(buffer)
CRC-24 (poly 0x864CFB, init 0xB704CE). Big-endian (3 bytes).

**Example:**
```js
const crc = crc24(data);
console.log('CRC24 (hex):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 00 21 89
```

**Output:**
```bash
CRC24 (hex): 00 21 89
```

### 11. crc32mpeg(buffer)
CRC-32 MPEG-2 (poly 0x04C11DB7, init 0xFFFFFFFF, no reflection, no final XOR). Big-endian? (code: >>>24 first, so big-endian).

**Example:**
```js
const crc = crc32mpeg(data);
console.log('MPEG CRC32 (hex, BE):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 34 5a 4d 1e
```

**Output:**
```bash
MPEG CRC32 (hex, BE): 34 5a 4d 1e
```

### 12. crcjam(buffer)
CRC-JAM (like CRC-32, but without final XOR). Little-endian.

**Example:**
```js
const crc = crcjam(data);
console.log('JAM CRC32 (hex, LE):', Array.from(crc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 5a 4d 1e cb
```

**Output:**
```bash
JAM CRC32 (hex, LE): 5a 4d 1e cb
```

## Full usage example

Integration with packet-builder.js (previous module). Modbus packet CRC calculation and verification.
```js
const { crc16Modbus, crc32, crc8 } = require('./utils/crc.js');
const { buildPacket, parsePacket } = require('../packet-builder.js');

// Sample data
const buffer = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x01]); // ADU without CRC

// Modbus CRC-16
const modbusCrc = crc16Modbus(buffer);
console.log('Modbus CRC:', Array.from(modbusCrc).map(b => b.toString(16).padStart(2, '0')).join(' ')); // d5 ca

// Full package
const packet = buildPacket(1, new Uint8Array([0x03, 0x00, 0x00, 0x00, 0x01]), crc16Modbus);
console.log('Full packet (hex):', Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00 00 00 01 d5 ca

// Parse and check
const { slaveAddress, pdu } = parsePacket(packet, crc16Modbus);
console.log('Parsed:', { slaveAddress, pdu: Array.from(pdu).map(b => b.toString(16).padStart(2, '0')).join(' ') }); // { slaveAddress: 1, pdu: '03 00 00 00 01' }

// Other CRCs for the same data
const c32 = crc32(buffer);
console.log('CRC32 (LE hex):', Array.from(c32).map(b => b.toString(16).padStart(2, '0')).join(' ')); // cb 1e 4d 5a

const c8 = crc8(buffer);
console.log('CRC8 (hex):', Array.from(c8).map(b => b.toString(16).padStart(2, '0')).join(' ')); // f4
```

**Expected output:**
```bash
Modbus CRC: d5 ca
Full packet (hex): 01 03 00 00 00 01 d5 ca
Parsed: { slaveAddress: 1, pdu: '03 00 00 00 01' }
CRC32 (LE hex): cb 1e 4d 5a
CRC8 (hex): f4
```

<br>

# <span id="packet-builder">Packet Building</span>
The packet-builder.js module provides utilities for building and parsing Modbus RTU (Application Data Unit) packets. It works with the Protocol Data Unit (PDU)—the payload without the slave address and CRC—and forms a full ADU with the slave address and CRC appended. The module integrates with the CRC functions from ./utils/crc.js and utilities from **./utils/utils.js** (`isUint8Array`, `concatUint8Arrays`, `toHex`, `sliceUint8Array`).

**Key Features:**
- **Build:** Appends the slaveAddress and CRC to the PDU.
- **Parse:** Extracts the slaveAddress and PDU from the ADU and checks the CRC. If the CRC does not match, an error is thrown.
- **CRC:** Defaults to crc16Modbus, but any function can be passed (from crc.js).
- **Errors:** Error for a short packet or CRC mismatch (with hex details).
- **Validation:** Validates a Uint8Array for a PDU and packet.

>The module exports two functions: buildPacket and parsePacket. No initialization required—just import and use.

**Dependencies:**
- `./utils/crc.js:` CRC functions (crc16Modbus, etc.).
- `./utils/utils.js:` Utilities for working with Uint8Array.

## Initialization

Include the module:
```js
const { buildPacket, parsePacket } = require('./packet-builder.js');
const crcFns = require('./utils/crc.js');
```

>No constructor - functions are ready to use. Importing hex logging utilities is recommended.
## Main functions

### 1. buildPacket(slaveAddress, pdu, crcFn = crcFns.crc16Modbus)
Generates a complete Modbus RTU ADU packet: `[slaveAddress]` + `PDU` + `CRC (2 bytes)`.

**Parameters:**
- `slaveAddress (number):` Slave address (0–247).
- `pdu (Uint8Array):` PDU (function + data, without slave/CRC).
- `crcFn (Function, optional):` CRC function (returns Uint8Array[2]). Defaults to crc16Modbus.

**Returns:** Uint8Array — the complete ADU.
**Errors:** Error: PDU must be a Uint8Array (if pdu is not a Uint8Array).

**Example 1: Basic packet construction for reading registers (PDU for func 0x03, address 0, quantity 1).**
```js
const pdu = new Uint8Array([0x03, 0x00, 0x00, 0x00, 0x01]); // Func 3: Read 1 holding reg at addr 0
const packet = buildPacket(1, pdu); // slave=1

console.log('PDU (hex):', Array.from(pdu).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 03 00 00 00 01
console.log('Full ADU (hex):', Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00 00 00 01 D5 CA (CRC зависит от данных)
```

**Output:**
```bash
PDU (hex): 03 00 00 00 01
Full ADU (hex): 01 03 00 00 00 01 d5 ca
```

- Length: 8 bytes (1 slave + 5 PDUs + 2 CRCs).
- CRC calculated for [01 03 00 00 00 01].

**Example 2: With custom CRC (crc16CcittFalse).**
```js
const customCrc = crcFns.crc16CcittFalse;
const packet2 = buildPacket(5, pdu, customCrc);

console.log('Full ADU with custom CRC (hex):', Array.from(packet2).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 01 03 00 00 00 01 XX YY (другой CRC)
```

**Output:**
```bash
Full ADU with custom CRC (hex): 01 03 00 00 00 01 12 34  // Примерный, зависит от crc16CcittFalse
```

**Example 3: Validation error.**
```js
const invalidPdu = [0x03, 0x00]; // not a Uint8Array
try {
    buildPacket(1, invalidPdu);
} catch (err) {
    console.log(err.message);
}
```

**Output:**
```bash
PDU must be a Uint8Array
```

### 2. parsePacket(packet, crcFn)
Parses an ADU packet: checks length (>=4), extracts slaveAddress and PDU, checks CRC.

**Parameters:**
- `packet (Uint8Array):` Full ADU.
- `crcFn (Function, optional):` CRC function. Defaults to crc16Modbus.

**Returns:** `{ slaveAddress: number, pdu: Uint8Array }`.
**Errors:**
- Error: Invalid packet: too short (length <4).
- Error: CRC mismatch: received XX YY, calculated AB CD (CRC mismatch, with hex).

**Example 1: Basic parsing of a valid packet.**
```js
const { utils } = require('./utils/utils.js'); // For toHex, if needed
const pdu = new Uint8Array([0x03, 0x00, 0x00, 0x00, 0x01]);
const packet = buildPacket(1, pdu); // From the previous example

const { slaveAddress, pdu: parsedPdu } = parsePacket(packet);

console.log('Slave Address:', slaveAddress); // 1
console.log('Parsed PDU (hex):', Array.from(parsedPdu).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 03 00 00 00 01
```

**Output:**
```bash
Slave Address: 1
Parsed PDU (hex): 03 00 00 00 01
```

- CRC checked automatically.

**Example 2: Parsing with a custom CRC.**
```js
const customCrc = crcFns.crc16CcittFalse;
const packetCustom = buildPacket(1, pdu, customCrc);
const { slaveAddress: sa2, pdu: pdu2 } = parsePacket(packetCustom, customCrc);

console.log('Slave Address (custom):', sa2); // 1
console.log('Parsed PDU (custom):', Array.from(pdu2).map(b => b.toString(16).padStart(2, '0')).join(' ')); // 03 00 00 00 00 01
```

**Output:**
```bash
Slave Address (custom): 1
Parsed PDU (custom): 03 00 00 00 01
```

**Example 3: Error - short packet.**
```js
const shortPacket = new Uint8Array([0x01, 0x03]); // <4 bytes
try {
    parsePacket(shortPacket);
} catch (err) {
    console.log(err.message);
}
```

**Output:**
```bash
Invalid packet: too short
```

**Example 4: Error - CRC mismatch (changing a byte).**
```js
const tamperedPacket = new Uint8Array(packet); // Copy
tamperedPacket[1] = 0x04; // Change funcCode to invalid

try {
    parsePacket(tamperedPacket);
} catch (err) {
    console.log(err.message);
    console.log('Received CRC:', Array.from(sliceUint8Array(tamperedPacket, -2)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('Calculated CRC:', Array.from(crcFns.crc16Modbus(sliceUint8Array(tamperedPacket, 0, -2))).map(b => b.toString(16).padStart(2, '0')).join(' '));
}
```

**Output:**
```bash
CRC mismatch: received d5 ca, calculated 12 34  // Примерные значения
Received CRC: d5 ca
Calculated CRC: 12 34
```

**Example 5: Parsing with default CRC (if not passed).**
```js
const { slaveAddress: sa3, pdu: pdu3 } = parsePacket(packet); // Without crcFn

console.log('Default CRC parse success:', sa3 === 1); // true
```

**Output:**
```bash
Default CRC parse success: true
```

## Helper function (internal)

### 1. arraysEqual(a, b)
Compares two Uint8Arrays byte by byte. Used in parsePacket for CRC.

**Parameters:**
- a, b (Uint8Array).
**Returns:** boolean.

**Example:**
```js
const arr1 = new Uint8Array([1, 2, 3]);
const arr2 = new Uint8Array([1, 2, 3]);
const arr3 = new Uint8Array([1, 2, 4]);

console.log(arraysEqual(arr1, arr2)); // true
console.log(arraysEqual(arr1, arr3)); // false
```

**Output:**
```bash
true
false
```

>Not exported, but can be used for testing.

## Complete usage example

Integration with ModbusClient (from the previous module). Simulation of the full cycle: build -> send (simulation) -> parse.
```js
const { buildPacket, parsePacket } = require('./packet-builder');
const crcFns = require('./utils/crc.js');

// Simulate a PDU for write single register (func 0x06, addr 100, value 1234)
const pdu = new Uint8Array([0x06, 0x00, 0x64, 0x04, 0xD2]); // 100=0x0064, 1234=0x04D2

// Build
const slaveId = 1;
const packet = buildPacket(slaveId, pdu);
console.log('Built packet (hex):', Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Simulate sending/receiving (in reality — transport.write/read)
const receivedPacket = packet; // Ideal case, no noise

// Parse
try {
    const { slaveAddress, pdu: receivedPdu } = parsePacket(receivedPacket);
    console.log('Parsed slaveAddress:', slaveAddress);
    console.log('Parsed PDU (hex):', Array.from(receivedPdu).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    if (slaveAddress === slaveId && arraysEqual(receivedPdu, pdu)) {
        console.log('Packet integrity: OK');
    }
} catch (err) {
    console.error('Parse error:', err.message);
}

// Test with CRC error
const faultyPacket = new Uint8Array(packet);
faultyPacket[faultyPacket.length - 1] = 0xFF; // Change CRC
try {
    parsePacket(faultyPacket);
} catch (err) {
    console.log('Expected CRC error:', err.message);
}
```

**Expected output:**
```bash
Built packet (hex): 01 06 00 64 04 d2 xx yy  // xx yy — CRC
Parsed slaveAddress: 1
Parsed PDU (hex): 06 00 64 04 d2
Packet integrity: OK
Expected CRC error: CRC mismatch: received xx ff, calculated xx yy
```

<br>

# <span id="notes">Notes</span>
- Each `fn[i]` is handled independently; one failing does not stop others.
- `onData(results)` is called only if all functions succeed, with `results[i]` matching `fn[i]`.
- Retries (`maxRetries`) are applied per function, with delay `delay = backoffDelay × attempt`.
- `taskTimeout` applies individually to each function call.
- `onError(error, index, attempt)` fires on each failed attempt.
- Use `getTaskState(id)` for detailed insight into task lifecycle.
- Suitable for advanced diagnostic loops, sensor polling, background watchdogs, or telemetry logging.
- `PollingManager` handles transport `flush()` and `ModbusFlushError` internally for smotther operation.

<br>

# <span id="tips-for-use">Tips for use</span>
- For Node.js, the `serialport` package is required (`npm install serialport`).
- For browser usage, HTTPS and Web Serial API support are required (**Google Chrome** or **Edge** or **Opera**).

<br>

# <span id="expansion">Expansion</span>
You can add your own Modbus functions by implementing a pair of `build...Request` and `parse...Response` functions in the `function-codes/` folder, then importing them into the ModbusClient in `modbus/client.js`

<br>

# <span id="changelog">CHANGELOG</span>
### 2.0.7 (2025-10-08)
- The logger is now represented in the Logger video class.
- Loggers in `PollingManager`, `ModbusClient`, and `SlaveEmulator` are disabled by default.
- Methods have been added to enable loggers in `PollingManager`, `ModbusClient`, and `SlaveEmulator`.
- The library documentation has been completely revised.

### 2.0.2 (2025-10-03)
- Fixed `file opening` function for **SGM130**
- Fixed `file closing` function for **SGM130**
- Fixed **autoreconnect** for `WebSerialTransport` and `NodeSerialTransport`
 > **TCP/IP connection capability is being tested and improved**

### **2.0.1 (2025-9-29)**
> **TCP/IP connectivity is expected to be added in the next version.**
- Added full Github support  

### **1.9.2 (2025-8-16)**
- SlaveEmulator updated:
  - **Full validation** - All input parameters are checked for correctness
  - **Improved error** handling - Structured errors with context
  - **Better logging** - More informative messages with context
  - **Performance optimization** - Separation of logic into specialized methods
  - **Diagnostic methods** - Methods for monitoring the state
  - **Graceful shutdown** - Proper resource cleanup
  - **Security** - Overflow and invalid data checks
  - **Modbus standards support** - Protocol restrictions compliance

- PollingManager updated:
  - **Improved Validation** - Added full validation of input parameters with detailed error messages
  - **Better State Management** - Moved global collection to PollingManager class for better encapsulation
  - **Performance Optimization** - Added "processing" flag to prevent duplication of processing queue.
  - **Improved error handling** - structured errors with logging and context
  - **Configuration** - Added support for configuration with default settings
  - **Diagnostic methods** - Added methods for getting information about the system state
  - **Improved logging** - Contextual logging with different levels of detail
  - **Security** - Checks for existence of objects before use

### **1.9.1 (2025-8-15)**
- Added `async-mutex` to `connect()` method for `ModbusClient`, as this method is critical in the sequence of operations on the COM port
- Improved [logger](#logger)
- Improved [Diagnostics](#diagnostics-and-error-handling)

### **1.9.0 (2025-8-13)**
- Implemented `async-mutex` in `PollingManager`, which stabilizes work via Web Serial API