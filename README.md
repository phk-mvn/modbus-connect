# Modbus Connect (Node.js/Web Serial API)

Modbus Connect is a cross-platform library for Modbus RTU communication in both Node.js and modern browsers (via the Web Serial API). It enables robust, easy interaction with industrial devices over serial ports.

## Navigating through documentation
- [Library Structure](#library-structure)
- [Basic Usage](#basic-usage)
- [Work via RS485](#work-via-rs485)
- [Summary type data](#type-data)
- [Main Classes and Methods](#main-classes-and-methods)
- [Modbus Functions](#modbus-functions)
- [Packet building & Parsing](#packet-building-and-parsing)
- [Diagnostics & Error Handling](#diagnostics-and-error-handling)
- [Logger](#logger)
- [Utilities](#utilities)
- [CRC](#crc)
- [Error Handling](#error-handling)
- [Polling Manager](#polling-manager)
- [Slave Emulator](#slave-emulator)
- [Tips for use](#tips-for-use)
- [Expansion](#expansion)
- [CHANGELOG](#changelog)
---

<br>

## 1. 📁 <span id="library-structure">Library Structure</span>
- **function-codes/** — PDU implementations for all Modbus functions (register/bit read/write, special functions).
- **transport/** — Transport adapters (Node.js SerialPort, Web Serial API), auto-detection helpers.
- **utils/** — Utilities: CRC, diagnostics, and helpers.
- **polling-manager.js** - A tool for continuously polling a device at a specified interval
- **client.js** — Main `ModbusClient` class for Modbus RTU devices.
- **constants.js** — Protocol constants (function codes, errors, etc.).
- **errors.js** — Error classes for robust exception handling, including `ModbusFlushError`.
- **logger.js** — Event logging utilities.
- **packet-builder.js** — ADU packet construction/parsing (with CRC).

<br>

## Features
- Supports Modbus RTU over serial ports (Node.js) and Web Serial API (Browser).
- Automatic reconnection mechanisms (primarily in transport layer).
- Robust error handling with specific Modbus exception types.
- Integrated polling manager for scheduled data acquisition.
- Built-in logging with configurable levels and categories.
- Diagnostic tools for monitoring communication performance.
- Utility functions for CRC calculation, buffer manipulation, and data conversion.
- Slave emulator for testing purposes.

## Intallation
```bash
npm install modbus-connect
```

## 2. 🚀 <span id="basic-usage">Basic Usage</span>
Please read [Important Note](#important-note) before use.

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
import logger from 'modbus-connect/logger';

// Slave emulator for testing
import SlaveEmulator from 'modbus-connect/slave-emulator';
```

### Creating transports
Transports are the underlying communication layers. The library provides a factory function to simplify their creation across different environments.
**Node.js Serial Port:**
```js
const transport = await createTransport('node', {
  port: '/dev/ttyUSB0', // or 'COM3' on Windows
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
});
```
**Web Serial (Recommended with `port` for robust reconnection):**
For reliable reconnection, especially after physical device disconnection, it's highly recommended to use a `port` function. This allows the transport to request a fresh `SerialPort` instance when needed.
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
    writeTimeout: 500,  // your value
    readTimeout: 500    // your value
})
```
> If you do not specify values ​​for `readTimeout/writeTimeout` during initialization, the default parameter will be used - 1000 ms for both values

### Creating a Client
```js
const client = new ModbusClient(transport, slaveId = 1, options = {})
```

- `transport` — transport object (see below)
- `slaveId` —  device address (1..247)
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

### <span id="work-via-rs485">Work via RS485</span>
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


### Hadnling Reconnection
**Automatic Reconnection:**
The `WebSerialTransport` and `NodeSerialTransport` now include built-in automatic reconnection logic. This handles scenarios like temporary cable glitches or device resets. You can configure this behavior using options like `reconnectInterval` and maxReconnectAttempts when creating the transport.

**Manual Reconnection (Web environment)**
Due to browser security policies, automatic reconnection cannot always call `navigator.serial.requestPort()` if the physical device is disconnected and reconnected. In such cases, or if automatic reconnection fails, a manual reconnection initiated by a user action is required.
```js
// Example function to be called by a UI button click (user gesture)
async function handleManualReconnect() {
  try {
    // Ensure any previous connection is cleanly closed
    if (client && transport) {
       try {
          await client.disconnect(); // This calls transport.disconnect()
       } catch (e) {
          console.warn("Error disconnecting previous connection:", e.message);
       }
    }

    // Create a new transport using a port that requests a port via user gesture
    const newTransport = await createTransport('web', {
      port: async () => {
         // This call is now valid because it's within a user gesture handler
         const new_port = await navigator.serial.requestPort();
         // Update any stored reference
         // storedSerialPortInstance = port;
         return new_port;
      },
      baudRate: 9600, // Use same settings as before
      // ... other settings
      maxReconnectAttempts: 0 // Disable auto-reconnect in new transport if desired
    });

    // Create a new client
    const newClient = new ModbusClient(newTransport, 1); // Use correct slave ID

    // Connect
    await newClient.connect();
    console.log('Manually reconnected!');
  } catch (err) {
    console.error("Manual reconnection failed:", err.message);
    // Handle user cancellation or other errors
  }
}
```

### 🧾 <span id="type-data">Summary type data</span>
| Type            | Size (regs) | DataView Method      | Endian / Swap         | Notes                                          |
| --------------- | ----------- | -------------------- | --------------------- | ---------------------------------------------- |
| `uint16`        | 1           | `getUint16`          | Big Endian            | No changes                                     |
| `int16`         | 1           | `getInt16`           | Big Endian            |                                                |
| `uint32`        | 2           | `getUint32`          | Big Endian            | Standard 32-bit read                           |
| `int32`         | 2           | `getInt32`           | Big Endian            |                                                |
| `float`         | 2           | `getFloat32`         | Big Endian            | IEEE 754 single precision float                |
| `uint32_le`     | 2           | `getUint32`          | Little Endian         |                                                |
| `int32_le`      | 2           | `getInt32`           | Little Endian         |                                                |
| `float_le`      | 2           | `getFloat32`         | Little Endian         |                                                |
| `uint32_sw`     | 2           | `getUint32`          | Word Swap             | Swap words (e.g., 0xAABBCCDD → 0xCCDDAABB)     |
| `int32_sw`      | 2           | `getInt32`           | Word Swap             |                                                |
| `float_sw`      | 2           | `getFloat32`         | Word Swap             |                                                |
| `uint32_sb`     | 2           | `getUint32`          | Byte Swap             | Swap bytes (e.g., 0xAABBCCDD → 0xBBAADDCC)     |
| `int32_sb`      | 2           | `getInt32`           | Byte Swap             |                                                |
| `float_sb`      | 2           | `getFloat32`         | Byte Swap             |                                                |
| `uint32_sbw`    | 2           | `getUint32`          | Byte + Word Swap      | Swap bytes and words (0xAABBCCDD → 0xDDCCBBAA) |
| `int32_sbw`     | 2           | `getInt32`           | Byte + Word Swap      |                                                |
| `float_sbw`     | 2           | `getFloat32`         | Byte + Word Swap      |                                                |
| `uint32_le_sw`  | 2           | `getUint32`          | LE + Word Swap        | Little Endian with Word Swap                   |
| `int32_le_sw`   | 2           | `getInt32`           | LE + Word Swap        |                                                |
| `float_le_sw`   | 2           | `getFloat32`         | LE + Word Swap        |                                                |
| `uint32_le_sb`  | 2           | `getUint32`          | LE + Byte Swap        | Little Endian with Byte Swap                   |
| `int32_le_sb`   | 2           | `getInt32`           | LE + Byte Swap        |                                                |
| `float_le_sb`   | 2           | `getFloat32`         | LE + Byte Swap        |                                                |
| `uint32_le_sbw` | 2           | `getUint32`          | LE + Byte + Word Swap | Little Endian with Byte + Word Swap            |
| `int32_le_sbw`  | 2           | `getInt32`           | LE + Byte + Word Swap |                                                |
| `float_le_sbw`  | 2           | `getFloat32`         | LE + Byte + Word Swap |                                                |
| `uint64`        | 4           | `getUint32` + BigInt | Big Endian            | Combined BigInt from high and low parts        |
| `int64`         | 4           | `getUint32` + BigInt | Big Endian            | Signed BigInt                                  |
| `double`        | 4           | `getFloat64`         | Big Endian            | IEEE 754 double precision float                |
| `uint64_le`     | 4           | `getUint32` + BigInt | Little Endian         |                                                |
| `int64_le`      | 4           | `getUint32` + BigInt | Little Endian         |                                                |
| `double_le`     | 4           | `getFloat64`         | Little Endian         |                                                |
| `hex`           | 1+          | —                    | —                     | Returns array of HEX strings per register      |
| `string`        | 1+          | —                    | Big Endian (Hi → Lo)  | Each 16-bit register → 2 ASCII chars           |
| `bool`          | 1+          | —                    | —                     | 0 → false, nonzero → true                      |
| `binary`        | 1+          | —                    | —                     | Each register converted to 16 boolean bits     |
| `bcd`           | 1+          | —                    | —                     | BCD decoding from registers                    |

### 📌 Expanded Usage Examples:
| Example usage       | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `type: 'uint16'`    | Reads registers as unsigned 16-bit integers (default no byte swapping)      |
| `type: 'int16'`     | Reads registers as signed 16-bit integers                                   |
| `type: 'uint32'`    | Reads every 2 registers as unsigned 32-bit big-endian integers              |
| `type: 'int32'`     | Reads every 2 registers as signed 32-bit big-endian integers                |
| `type: 'float'`     | Reads every 2 registers as 32-bit IEEE 754 floats (big-endian)              |
| `type: 'uint32_le'` | Reads every 2 registers as unsigned 32-bit little-endian integers           |
| `type: 'int32_le'`  | Reads every 2 registers as signed 32-bit little-endian integers             |
| `type: 'float_le'`  | Reads every 2 registers as 32-bit IEEE 754 floats (little-endian)           |
| `type: 'uint32_sw'` | Reads every 2 registers as unsigned 32-bit with word swap                   |
| `type: 'int32_sb'`  | Reads every 2 registers as signed 32-bit with byte swap                     |
| `type: 'float_sbw'` | Reads every 2 registers as float with byte+word swap                        |
| `type: 'hex'`       | Returns an array of hex strings, e.g., `["0010", "FF0A"]`                   |
| `type: 'string'`    | Converts registers to ASCII string (each register = 2 chars)                |
| `type: 'bool'`      | Returns an array of booleans, 0 = false, otherwise true                     |
| `type: 'binary'`    | Returns array of 16-bit boolean arrays per register (each bit separately)   |
| `type: 'bcd'`       | Decodes BCD-encoded numbers from registers, e.g., `0x1234` → `1234`         |
| `type: 'uint64'`    | Reads 4 registers as a combined unsigned 64-bit integer (BigInt)            |
| `type: 'int64_le'`  | Reads 4 registers as signed 64-bit little-endian integer (BigInt)           |
| `type: 'double'`    | Reads 4 registers as 64-bit IEEE 754 double precision float (big-endian)    |
| `type: 'double_le'` | Reads 4 registers as 64-bit IEEE 754 double precision float (little-endian) |



<br>

## 3. 🏗️ <span id="main-classes-and-methods">Main Classes and Methods</span>
**Methods (basic):**
- `connect()` / `disconnect()` — open/close connection
- `readHoldingRegisters(startAddress, quantity, timeout?)` — read holding registers
- `readInputRegisters(startAddress, quantity, timeout?)` — read input registers
- `writeSingleRegister(address, value, timeout?)` — write a single register
- `writeMultipleRegisters(startAddress, values, timeout?)` — write multiple registers
- `readCoils(startAddress, quantity, timeout?)` —  read discrete outputs (coils)
- `readDiscreteInputs(startAddress, quantity, timeout?)` —  read discrete inputs
- `writeSingleCoil(address, value, timeout?)` — write a single coil
- `writeMultipleCoils(startAddress, values, timeout?)` — write multiple coils
- `reportSlaveId(timeout?)` — get device identifier
- `readDeviceIdentification(slaveId, categoryId, objectId)` - read device identification
- `getDiagnostics()` — get communication statistics
- `resetDiagnostics()` — reset statistics

**Methods for SGM-130**
- `writeDeviceComment(channel, comment, timeout?)` - write comment to device channel (**SGM-130 only**)
- `readFileLength(fileName)` - get archive file length (**SGM-130 only**)
- `openFile(fileName)` - open archive file (**SGM-130 only**)
- `closeFile()` - close archive file (**SGM-130 only**)
- `restartController()` - restart controller (**SGM-130 only**)
- `getControllerTime(options = {})` - get current controller date/time (**SGM-130 only**)
- `readDeviceComment(channel, timeout?)` — get device comment (**SGM-130 only**)
- `setControllerTime(time, options = {})` - set current controller date/time (**SGM-130 only**)

<br>

## 4. 🧩 <span id="modbus-functions">Modbus Functions</span>
The `function-codes/` directory contains all standard and custom Modbus PDU builders/parsers.

**Standard Functions**
| HEX | Name |
|:---:|------|
| 0x03 | Read Holding Registers |
| 0x04 | Read Input Registers |
| 0x10 | Write Multiple Registers |
| 0x06 | Write Single Register |
| 0x01 | Read Coils |
| 0x02 | Read Discrete Inputs |
| 0x05 | Write Single Coil |
| 0x0F | Write multiple Coils |
| 0x2B | Read Device Identification |
| 0x11 | Report Slave ID |

**Custom Functions (SGM-130)**
| HEX | Name |
|:---:|------|
| 0x14 | Read Device Comment |
| 0x15 | Write Device Comment |
| 0x52 | Read File Length |
| 0x55 | Open File |
| 0x57 | Close File |
| 0x5C | Restart Controller |
| 0x6E | Get Controller Time |
| 0x6F | Set Controller Time |

### Each file exports two functions:

- `build...Request(...)` — builds a PDU request
- `parse...Response(pdu)` — parses the response

### Example: manual PDU building
```js
const { buildReadHoldingRegistersRequest } = require('./function-codes/read-holding-registers.js');
const pdu = buildReadHoldingRegistersRequest(0, 2);
```

<br>

## 5. 📦 <span id="packet-building-and-parsing">Packet Building & Parsing</span>

**packet-builder.js**
- **buildPacket(slaveAddress, pdu)** — Adds slaveId and CRC, returns ADU
- **parsePacket(packet)** — Verifies CRC, returns { slaveAddress, pdu }

**Example:**
```js
const { buildPacket, parsePacket } = require('./packet-builder.js');
const adu = buildPacket(1, pdu);
const { slaveAddress, pdu: respPdu } = parsePacket(adu);
```

<br>

## 6. 📊 <span id="diagnostics-and-error-handling">Diagnostics & Error Handling</span>
- **diagnostics.js** — The `Diagnostics` class collects detailed statistics on Modbus communication, including requests, errors, response times, and data transfer volumes.
- **errors.js** — The module defines several custom error classes for specific Modbus communication issues:
  - `ModbusTimeoutError`
  - `ModbusCRCError`
  - `ModbusResponseError`
  - `ModbusTooManyEmptyReadsError`
  - `ModbusExceptionError`
  - `ModbusFlushError` — Thrown when an operation is interrupted by a transport `flush()`.

Diagnostics Example:
```js
const stats = client.getStats();
console.log(stats);
```

Consolidated table of methods from the Diagnostics class
| Method | Description |
|--------|-------------|
|constructor(options)                               |  Initializes a diagnostics instance with optional settings like error thresholds and slave IDs.
|reset()                                            |  Resets all statistics and counters to their initial state. Use this to start a fresh collection of data.
|resetStats(metrics)                                |  Resets a specific subset of statistics. Accepts an array of strings (e.g., ['errors', 'responseTimes']) to reset only those metrics.
|destroy()                                          |	Destroys the diagnostics instance and clears resources, including pausing the logger.
|recordRequest(slaveId, funcCode)                   |	Records a new request event, incrementing the total request counter and tracking the timestamp.
|recordRetry(attempts, slaveId, funcCode)           |	Logs retry attempts, adding to the total retry count.
|recordRetrySuccess(slaveId, funcCode)              |	Records a successful operation after a retry.
|recordFunctionCall(funcCode, slaveId)              |	Tracks the frequency of each Modbus function code call.
|recordSuccess(responseTimeMs, slaveId, funcCode)   |	Logs a successful response, updating response time metrics (last, min, max, average).
|recordError(error, options)                        |	Records an error, classifying it (e.g., timeout, CRC, Modbus exception), and tracks the error message.
|recordDataSent(byteLength, slaveId, funcCode)      |	Records the number of bytes sent in a request.
|recordDataReceived(byteLength, slaveId, funcCode)  |	Records the number of bytes received in a response.
|getStats()                                         | Returns a comprehensive JSON object containing all collected statistics. This is the primary method for accessing all data.
|printStats()                                       | Prints a human-readable, formatted report of all statistics directly to the console via the logger.
|analyze()                                          | Analyzes the current statistics and returns an object containing warnings if any metrics exceed their predefined thresholds.
|serialize()                                        | Returns a JSON string representation of all statistics.
|toTable()                                          | Converts the statistics into an array of objects for tabular presentation.
|mergeWith(other)                                   | Combines the statistics from another Diagnostics instance into the current one.

Key Properties & Metrics Tracked:
- Performance Metrics:
  - `uptimeSeconds`: The duration since the diagnostics instance was created.
  - `averageResponseTime`: Average response time for successful requests.
  - `averageResponseTimeAll`: Average response time including both successful and failed requests.
  - `requestsPerSecond`: Real-time calculation of requests per second.
- Request & Response Counters:
  - `totalRequests`: Total number of sent requests.
  - `successfulResponses`: Total number of successful responses.
  - `errorResponses`: Total number of failed responses.
  - `totalRetries`: Total number of retry attempts.
  - `totalRetrySuccesses`: Number of requests that succeeded on a retry attempt.
  - `totalSessions`: The number of times the diagnostics were initialized (`constructor`) or reset (`reset()`).
- Error Classification:
  - `timeouts`: Count of Modbus timeout errors.
  - `crcErrors`: Count of CRC (Cyclic Redundancy Check) errors.
  - `modbusExceptions`: Count of responses with a Modbus exception code.
  - `exceptionCodeCounts`: A map showing the count for each specific Modbus exception code.
  - `lastErrors`: A list of the 10 most recent error messages.
  - `commonErrors`: A list of the top 3 most frequently occurring errors by message.
- Data Transfer:
  - `totalDataSent`: Total bytes sent to the Modbus device.
  - `totalDataReceived`: Total bytes received from the Modbus device.
- Timestamps:
  - `lastRequestTimestamp`: ISO timestamp of the last sent request.
  - `lastSuccessTimestamp`: ISO timestamp of the last successful response.
  - `lastErrorTimestamp`: ISO timestamp of the last error.

The `Diagnostics` class now provides a more comprehensive set of tools for monitoring and debugging Modbus communication, offering both real-time metrics and a detailed history of errors and activity.

<br>

## 7. 🛠 <span id="logger">Logger</span>
`logger.js` is a powerful logging utility designed for formatted console output in Modbus applications. It supports:

- **Log levels**: `trace`, `debug`, `info`, `warn`, `error`
- **Colored output**: With customizable colors for each level and exceptions
- **Nested groups**: For organizing sequential operations
- **Global and contextual data**: Including `slaveId`, `funcCode`, `exceptionCode`, `address`, `quantity`, `responseTime`
- **Output buffering**: With configurable flush intervals and rate limiting
- **Categorical loggers**: For module-specific logging
- **Filtering and highlighting**: By `slaveId`, `funcCode`, or `exceptionCode`
- **Statistics and debugging**: Via `summary` and `inspectBuffer`
- **Real-time monitoring**: Using the `watch` feature
- **Custom formatting**: For context fields like `slaveId` or `funcCode`

### 📦 Import
```js
const logger = require('modbus-connect/logger');
```

### 🔊 Basic Logging
Log messages at different levels with optional data:
```js
logger.trace('Low-level packet details');
logger.debug('Debug message');
logger.info('Informational message', [123, 456]);
logger.warn('Warning message');
logger.error('Error message', new Error('Timeout'));
```
Output example:
```bash
[06:00:00][TRACE] Low-level packet details
[06:00:00][INFO] Informational message [123, 456]
[06:00:00][ERROR] Timeout
    Error: Timeout
        at ...
```

### 📦 Logging with Context
Pass a context object as the last argument to include Modbus-specific details:
```js
logger.info('Reading registers', {
  slaveId: 1,
  funcCode: FUNCTION_CODES.READ_HOLDING_REGISTERS,
  address: 100,
  quantity: 10,
  responseTime: 42
});
logger.error('Modbus exception', {
  slaveId: 1,
  funcCode: FUNCTION_CODES.READ_HOLDING_REGISTERS,
  exceptionCode: 1
});
```
Output:
```bash
[06:00:00][INFO][S:1][F:0x03/ReadHoldingRegisters][A:100][Q:10][RT:42ms] Reading registers
[06:00:00][ERROR][S:1][F:0x03/ReadHoldingRegisters][E:1/Illegal Function] Modbus exception
```

### 🖍 Managing Log Levels
Set the global log level or check the current state:
```js
logger.setLevel('trace'); // 'trace' | 'debug' | 'info' | 'warn' | 'error'
console.log(logger.getLevel()); // => 'trace'
console.log(logger.isEnabled()); // => true
```

### 🚫 Enabling/Disabling Logger
```js
logger.disable(); // Disable all logging
logger.enable(); // Re-enable logging
```

### 🎨 Colors
Disable colored output if needed:
```js
logger.disableColors();
```

### 🧵 Log Groups
Organize logs with nested groups:
```js
logger.group();
logger.info('Start of session');
logger.group();
logger.debug('Nested operation');
logger.groupEnd();
logger.groupEnd();
```

### 🌐 Global Context
Set or extend global context for all logs:
```js
logger.setGlobalContext({ transport: 'TCP', slaveId: 1 });
logger.addGlobalContext({ device: 'SGM130' });
logger.setTransportType('RTU'); // Shortcut for transport
```

### 🔄 Output Buffering
Control buffering and flush interval:
```js
logger.setBuffering(true); // Enable buffering (default, flushes every 300ms)
logger.setBuffering(false); // Immediate output
logger.setFlushInterval(500); // Set flush interval to 500ms
logger.flush(); // Manually flush buffer
```
> *"Buffer size is capped at 1000 entries to prevent memory issues."*

### 📈 Rate Limiting
Limit log frequency to avoid console flooding:
```js
logger.setRateLimit(50); // Limit to one log every 50ms (except warn/error)
```

### 📁 Categorical Loggers
Create named loggers for module-specific logging:
```js
const transportLog = logger.createLogger('transport');
transportLog.info('Connected'); // Adds [transport] to context
transportLog.setLevel('debug'); // Set level for this logger
transportLog.pause(); // Temporarily disable
transportLog.resume(); // Re-enable
```

### 💥 Immediate Warn/Error Output
`warn` and `error` logs are always output immediately, even with buffering enabled:
```js
logger.error('Critical failure', { slaveId: 1, exceptionCode: 1 });
```

### 🔍 Filtering Logs
Mute logs based on `slaveId`, `funcCode`, or `exceptionCode`:
```js
logger.mute({ slaveId: 1, funcCode: FUNCTION_CODES.READ_COILS });
logger.info('No output', { slaveId: 1, funcCode: FUNCTION_CODES.READ_COILS });
logger.unmute({ slaveId: 1 });
```

### 🌟 Highlighting Logs
Highlight logs matching specific conditions (e.g., errors with `exceptionCode`):
```js
logger.highlight({ exceptionCode: 1 }); // Highlight Illegal Function errors
logger.error('Highlighted', { slaveId: 1, funcCode: 0x03, exceptionCode: 1 });
logger.clearHighlights(); // Clear all highlights
```
>*"Highlighted logs use a red background for visibility."*

### 👀 Real-Time Monitoring
Monitor logs in real-time with a callback:
```js
logger.watch(log => {
  if (log.context.slaveId === 1) console.log('Watched:', log.level, log.args);
});
logger.clearWatch(); // Stop watching
```

### 🧪 Inspecting Buffer
View the current buffer contents:
```js
logger.inspectBuffer();
```
Output:
```bash
=== Log Buffer Contents ===
[0] [06:00:00][INFO][S:1][F:0x03/ReadHoldingRegisters] Request sent
[1] [06:00:00][DEBUG][S:1][F:0x03/ReadHoldingRegisters] Packet sent
Buffer Size: 2/1000
==========================
```

### 📊 Viewing Statistics
Display detailed logging statistics:
```js
logger.summary();
```
Output:
```bash
=== Logger Summary ===
Trace Messages: 5
Debug Messages: 10
Info Messages: 50
Warn Messages: 3
Error Messages: 2
Total Messages: 70
By Slave ID: { "1": 50, "2": 20 }
By Function Code: {
  "3/ReadHoldingRegisters": 40,
  "6/WriteSingleRegister": 20,
  "17/ReportSlaveId": 10
}
By Exception Code: {
  "1/Illegal Function": 2
}
Buffering: Enabled (Interval: 300ms)
Rate Limit: 100ms
Buffer Size: 0/1000
Current Level: info
Categories: {"transport": "debug"}
Filters: slaveId=[], funcCode=[], exceptionCode=[]
Highlights: [{"exceptionCode": 1}]
=====================
```

### ✍️ Custom Formatters
Customize how context fields are displayed:
```js
logger.setCustomFormatter('slaveId', id => `Device${id}`);
logger.setCustomFormatter('funcCode', code => {
  const name = Object.keys(FUNCTION_CODES).find(k => FUNCTION_CODES[k] === code) || 'Unknown';
  return name;
});
logger.info('Test', { slaveId: 1, funcCode: FUNCTION_CODES.READ_HOLDING_REGISTERS });
```
Output:
```bash
[06:00:00][INFO][S:Device1][F:ReadHoldingRegisters] Test
```

### 🖌 Custom Log Format
Configure which fields appear in the log header:
```js
logger.setLogFormat(['timestamp', 'level', 'slaveId', 'funcCode']);
```

### 🧪 Usage Example
```js
const logger = require('modbus-connect/logger');

logger.setLevel('trace');
logger.setGlobalContext({ transport: 'TCP', slaveId: 1 });
logger.setLogFormat(['timestamp', 'level', 'slaveId', 'funcCode', 'exceptionCode']);
logger.setCustomFormatter('slaveId', id => `Device${id}`);

logger.group();
logger.info('Starting Modbus session');

const comm = logger.createLogger('comm');
comm.trace('Opening port COM3');

logger.highlight({ exceptionCode: EXCEPTION_CODES.IllegalFunction });
logger.error('Modbus exception', {
  slaveId: 1,
  funcCode: FUNCTION_CODES.READ_HOLDING_REGISTERS,
  exceptionCode: EXCEPTION_CODES.IllegalFunction
});

logger.watch(log => console.log('Watched:', log.level, log.args));
logger.info('Response received', { responseTime: 48 });
logger.groupEnd();

logger.summary();
```
Output:
```bash
[06:00:00][INFO][S:Device1][F:0x03/ReadHoldingRegisters] Starting Modbus session
  [06:00:00][TRACE][S:Device1][F:0x03/ReadHoldingRegisters][comm] Opening port COM3
[06:00:00][ERROR][S:Device1][F:0x03/ReadHoldingRegisters][E:1/Illegal Function] Modbus exception
[06:00:00][INFO][S:Device1][F:0x03/ReadHoldingRegisters][RT:48ms] Response received
=== Logger Summary ===
...
```

### 📌 Tips Logger
- Use `trace` for low-level debugging (e.g., packet dumps).
- Leverage `exceptionCode` in context to log Modbus errors clearly.
- Use `highlight` to focus on critical issues like `Illegal Function` errors.
- Monitor specific devices with `watch` or `mute` for selective logging.
- Check `summary` to analyze log distribution by `slaveId`, `funcCode`, or `exceptionCode`.
- Disable buffering for real-time debugging or adjust `flushInterval` for performance.
- Use short log format (`setLogFormat(['timestamp', 'level'])`) for minimal output.

<br>

## 8. 🛠 <span id="utilities">Utilities</span>
- **crc.js** — CRC implementations (Modbus, CCITT, 1-wire, DVB-S2, XModem, etc.)
- **utils.js** — Uint8Array helpers, number conversions, hex string utilities
- **diagnostics.js** - Diagnostics class collects stats (requests, errors, response times, etc.)

<br>

## 9. <span id="crc">CRC</span>
**All types of CRC calculations**

| Name             | Polynomial  | Initial Value (init)      | Reflection (RefIn/RefOut) | Final XOR         | CRC Size   | Result Byte Order      | Notes                             |
|------------------|-------------|---------------------------|---------------------------|-------------------|------------|------------------------|-----------------------------------|
| **crc16Modbus**  | 0x8005 (reflected 0xA001) | 0xFFFF      | Yes (reflected)           | None              | 16 bits    | Little-endian          | Standard Modbus RTU CRC16         |
| **crc16CcittFalse** | 0x1021   | 0xFFFF                    | No                        | None              | 16 bits    | Big-endian             | CRC-16-CCITT-FALSE                |
| **crc32**        | 0x04C11DB7  | 0xFFFFFFFF                | Yes (reflected)           | XOR 0xFFFFFFFF    | 32 bits    | Little-endian          | Standard CRC32                    |
| **crc8**         | 0x07        | 0x00                      | No                        | None              | 8 bits     | 1 byte                 | CRC-8 without reflection          |
| **crc1**         | 0x01        | 0x00                      | No                        | None              | 1 bit      | 1 bit                  | Simple CRC-1                      |
| **crc8_1wire**   | 0x31 (reflected 0x8C) | 0x00            | Yes (reflected)           | None              | 8 bits     | 1 byte                 | CRC-8 for 1-Wire protocol         |
| **crc8_dvbs2**   | 0xD5        | 0x00                      | No                        | None              | 8 bits     | 1 byte                 | CRC-8 DVB-S2                      |
| **crc16_kermit** | 0x1021 (reflected 0x8408) | 0x0000      | Yes (reflected)           | None              | 16 bits    | Little-endian          | CRC-16 Kermit                     |
| **crc16_xmodem** | 0x1021      | 0x0000                    | No                        | None              | 16 bits    | Big-endian             | CRC-16 XModem                     |
| **crc24**        | 0x864CFB    | 0xB704CE                  | No                        | None              | 24 bits    | Big-endian (3 bytes)   | CRC-24 (Bluetooth, OpenPGP)       |
| **crc32mpeg**    | 0x04C11DB7  | 0xFFFFFFFF                | No                        | None              | 32 bits    | Big-endian             | CRC-32 MPEG-2                     |
| **crcjam**       | 0x04C11DB7  | 0xFFFFFFFF                | Yes (reflected)           | None              | 32 bits    | Little-endian          | CRC-32 JAM (no final XOR)         |
---

To use one of these options when initializing **ModbusClient**, see the example below:
```js
const client = new ModbusClient(
  transport, // your initialize transport
  0, // slave id
  {
    crcAlgorithm: 'crc16Modbus' // Selecting the type of CRC calculation
  }
)
```
> If you do not specify the type of CRC calculation during initialization, the default option is used - `crc16Modbus`

<br>

## 10. 🌀 <span id="error-handling">Error Handling</span>
The library defines specific error types for different Modbus issues:
- `ModbusError`: Base class for all Modbus errors.
- `ModbusTimeoutError`: Raised on request timeouts.
- `ModbusCRCError`: Raised on CRC checksum failures.
- `ModbusResponseError`: Raised on malformed responses.
- `ModbusTooManyEmptyReadsError`: Raised if the transport detects a stalled connection.
- `ModbusExceptionError`: Raised for standard Modbus exception responses from devices.
- `ModbusFlushError`: Raised if an operation is interrupted by a transport buffer flush.

Always wrap your Modbus calls in `try...catch` block to handle these errors appropriately.
```js
try {
  const data = await client.readHoldingRegisters(100, 1); // Invalid address
} catch (err) {
  if (err instanceof ModbusExceptionError) {
    console.error(`Modbus Exception ${err.exceptionCode}: ${err.message}`);
    // Handle specific device errors (e.g., Illegal Data Address)
  } else if (err instanceof ModbusTimeoutError) {
    console.error('Device did not respond in time');
    // Handle timeout, might trigger reconnection logic check
  } else if (err instanceof ModbusFlushError) {
     console.warn('Operation interrupted by buffer flush, likely due to reconnection');
     // Task will likely be retried by PollingManager or you can retry
  } else {
    console.error('An unexpected error occurred:', err.message);
  }
}
```

<br>

## 11. 🌀 <span id="polling-manager">Polling Manager</span>
`PollingManager` is a powerful utility for managing periodic asynchronous tasks. It supports retries, backoff strategies, timeouts, dynamic intervals, and lifecycle callbacks — ideal for polling Modbus or other real-time data sources. Improved to work seamlessly with transport `flush()` and automatic reconnection.

### 📦 Key Features
- Async execution of single or multiple functions
- Automatic retries with per-attempt backoff delay
- Per-function timeout handling
- Lifecycle control: start, stop, pause, resume, restart
- Lifecycle hooks: `onStart`, `onStop`, `onData`, `onError`, `onFinish`, `onBeforeEach`, `onRetry`, `onSuccess`, `onFailure`
- Dynamically adjustable polling interval per task
- Full task state inspection (running, paused, etc.)
- Clean-up and removal of tasks
- Handles `ModbusFlushError` gracefully, resetting backoff delays
- Enhanced logging and diagnostics with context-aware information
- Improved queue management and performance optimization
- Priority-based task execution
- Conditional task execution with `shouldRun` function
- Comprehensive statistics tracking
- Resource-based task queuing for serial device coordination

Usage example
```js
const PollingManager = require('modbus-connect/polling-manager');

const pollingManager = new PollingManager({
  defaultMaxRetries: 3,
  defaultBackoffDelay: 1000,
  defaultTaskTimeout: 5000,
  logLevel: 'debug'
});

// Define a polling task
pollingManager.addTask({
    id: 'read-sensors',           // Task name
    resourceId: 'COM3',           // Stream name (for serial device coordination)
    priority: 1,                  // Priority: method in queue (0...Infinity)
    interval: 1000,               // Poll every 1 second
    immediate: true,              // Start immediately
    fn: [                         // Multiple functions to execute
      () => client.readHoldingRegisters(0, 11),
      () => client.readInputRegisters(4, 2)
    ],
    onData: (data) => {           // Handle successful results
        console.log('Data received:', data);
    },
    onError: (error, index, attempt) => {  // Handle errors
        console.log(`Error in function ${index}, attempt ${attempt}:`, error.message);
    },
    onStart: () => console.log('Polling measure data started'),
    onStop: () => console.log('Polling measure data stopped'),
    onFinish: (success, results) => {      // Called after all functions complete
        console.log('Task finished:', { success, results });
    },
    onBeforeEach: () => {                  // Called before each execution cycle
        console.log('Starting new polling cycle');
    },
    shouldRun: () => {                     // Conditional execution
        return document.visibilityState === 'visible'; // Only run when tab is visible
    },
    maxRetries: 3,                         // Retry attempts per function
    backoffDelay: 300,                     // Base delay for exponential backoff
    taskTimeout: 1000                      // Timeout per function call
});

// Later...
// pollingManager.stopTask('read-sensors');
// pollingManager.removeTask('read-sensors');
```

>**"Resource Coordination**: If you need to perform 2 or more tasks for 1 device (for example, COM port), then `resourceId` must be the same. This ensures tasks are queued and executed sequentially, preventing concurrent access to the same device which would lead to errors." 

>"**Queue Management**: Tasks with the same `resourceId` are placed in a queue and executed one at a time using mutex locks. Tasks without `resourceId` run independently in their own loop."

### 🧩 Task Interface
**poll.addTask(options)**
Registers and starts a new polling task.
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

### 📊 Task Statistics
Each task maintains detailed statistics for monitoring and debugging:
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

### 🧪 Additional examples
#### ⏸ Pause and resume a task
```js
pollingManager.pauseTask('modbus-loop');

setTimeout(() => {
  pollingManager.resumeTask('modbus-loop');
}, 5000);
```

#### 🔁 Restart a task
```js
pollingManager.restartTask('modbus-loop');
```

#### 🧠 Dynamically update the polling interval
```js
pollingManager.setTaskInterval('modbus-loop', 2000); // now polls every 2 seconds
```

#### ❌ Remove a task
```js
pollingManager.removeTask('heartbeat');
```

#### 🔄 Update task configuration
```js
pollingManager.updateTask('read-sensors', {
    interval: 2000,
    maxRetries: 5,
    backoffDelay: 500
});
```

#### 🔄 Update task configuration
```js
pollingManager.updateTask('read-sensors', {
    interval: 2000,
    maxRetries: 5,
    backoffDelay: 500
});
```

#### 📊 Monitor system performance
```js
// Get detailed queue information
const queueInfo = pollingManager.getQueueInfo('COM3');
console.log('Queue status:', queueInfo);

// Get comprehensive system statistics
const systemStats = pollingManager.getSystemStats();
console.log('System stats:', systemStats);
```

#### 🛠 Task management methods
| METHOD | DESCRIPTION |
|--------|-------------|
|addTask(config)          | Add and start a new polling task                |
|startTask(id)            | Start a task                                    |
|stopTask(id)             | Stop a task                                     |
|pauseTask(id)            | Pause execution                                 |
|resumeTask(id)           | Resume execution                                |
|restartTask(id)          | Restart a task                                  |
|removeTask(id)           | Remove a task                                   |
|updateTask(id, opts)     | Update a task (removes and recreates)           |
|setTaskInterval(id, ms)  | Dynamically update the task's polling interval  |
|clearAll()               | Stops and removes all registered tasks          |
|restartAllTasks()        | Restart all tasks                               |
|pauseAllTasks()          | Pause all tasks                                 |
|resumeAllTasks()         | Resume all tasks                                |
|startAllTasks()          | Start all tasks                                 |
|stopAllTasks()           | Stop all tasks                                  |
|getAllTaskStats()        | Get stats for all tasks                         |
|getQueueInfo(resourceId) | Get detailed queue information                  |
|getSystemStats()         | Get comprehensive system statistics             |

#### 📊 Status and Checks

| METHOD | DESCRIPTION |
|--------|-------------|
| isTaskRunning(id) | Returns true if the task is running                                   |
| isTaskPaused(id)  | Returns true if the task is paused                                    |
| getTaskState(id)  | Returns detailed state info: { stopped, paused, running, inProgress } |
| getTaskStats(id)  | Returns detailed statistics for the task                              |
| hasTask(id)       | Checks if task exists                                                 |
| getTaskIds()      | Returns list of all task IDs                                          |

#### 🔧 Configuration Options
The PollingManager can be configured with various options:
```js
const pollingManager = new PollingManager({
  defaultMaxRetries: 3,      // Default retry attempts (default: 3)
  defaultBackoffDelay: 1000, // Default backoff delay in ms (default: 1000)
  defaultTaskTimeout: 5000,  // Default task timeout in ms (default: 5000)
  logLevel: 'info'           // Logging level: trace, debug, info, warn, error (default: 'info')
});
```

#### 🧼 Cleanup
```js
pollingManager.clearAll(); // Stops and removes all registered tasks, clears queues
```

#### 💡 Advanced Features
**Enhanced Error Handling**
The manager provides comprehensive error handling with detailed context:
- Automatic retry with exponential backoff
- Special handling for `ModbusFlushError` with reset backoff
- Per-function error tracking
- Detailed error statistics

**Performance Optimizations**
- Improved queue processing with processing flags to prevent duplicate execution
- Mutex-based resource locking for serial device coordination
- Memory-efficient task cleanup
- Rate-limited logging to prevent console spam

**Diagnostics and Monitoring**
```js
// Get system statistics
const stats = pollingManager.getSystemStats();
console.log('System Stats:', stats);

// Get queue information for specific resource
const queueInfo = pollingManager.getQueueInfo('COM3');
console.log('Queue Info:', queueInfo);

// Monitor individual task performance
const taskStats = pollingManager.getTaskStats('read-sensors');
console.log('Task Stats:', taskStats);
```

**Priority-based Execution**
Tasks can be assigned priorities for queue ordering:
```js
pollingManager.addTask({
    id: 'high-priority',
    resourceId: 'COM3',
    priority: 10,        // Higher priority executes first
    interval: 1000,
    fn: () => client.readCriticalData()
});

pollingManager.addTask({
    id: 'low-priority',
    resourceId: 'COM3',
    priority: 1,         // Lower priority executes later
    interval: 5000,
    fn: () => client.readNonCriticalData()
});
```

**Conditional Execution**
Use `shouldRun` function for conditional task execution:
```js
pollingManager.addTask({
    id: 'conditional-task',
    interval: 1000,
    fn: () => client.readData(),
    shouldRun: () => {
        // Only run when certain conditions are met
        return network.isConnected() && 
               device.isReady() && 
               user.hasPermission();
    },
    onData: (data) => console.log('Conditional data:', data)
});
```

**Tips for use Polling Manager**
Automatic pause/resume with Page Visibility API
```js
// Add automatic pause/resume when tab visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('The user switched to another tab or minimized the browser');
    if (pollingManager.isTaskRunning('read-sensors') && !pollingManager.isTaskPaused('read-sensors')) {
      pollingManager.pauseTask('read-sensors');
      console.log('Polling task is automatically paused');
    }
  } else {
    console.log('The user returned to the tab');
    if (pollingManager.isTaskPaused('read-sensors')) {
      pollingManager.resumeTask('read-sensors');
      console.log('Polling task automatically resumed');
    }
  }
});
```

**Network-aware polling**
```js
pollingManager.addTask({
    id: 'network-aware-task',
    interval: 1000,
    fn: () => client.readData(),
    shouldRun: () => navigator.onLine,  // Only run when online
    onError: (error) => {
        if (!navigator.onLine) {
            console.log('Network offline, pausing task');
            pollingManager.pauseTask('network-aware-task');
        }
    }
});

// Resume when network comes back
window.addEventListener('online', () => {
    pollingManager.resumeTask('network-aware-task');
});
```
>"**Improved Flush Handling**: The `PollingManager` now automatically flushes the transport buffer before each task run and intelligently handles `ModbusFlushError` during retries, resetting the exponential backoff delay for better responsiveness after a flush."

>"**Enhanced Logging**: Integrated with the advanced logger system for detailed monitoring and debugging capabilities with context-aware logging. Each component (manager, queues, tasks) has its own logger with detailed context information. "

>"**Resource Queue Management**: Tasks sharing the same `resourceId` are automatically queued and executed sequentially using mutex locks, preventing concurrent access to shared resources like serial ports."

<br>

## 12. <span id="slave-emulator">📘 SlaveEmulator</span>
#### 📦 Import
```js
const SlaveEmulator = require('modbus-connect/slave-emulator')
```

#### 🏗 Creating an Instance
```js
const emulator = new SlaveEmulator(1) // 1 — Modbus slave address (0-247)
```

#### 🔌 Connecting and Disconnecting
```js
await emulator.connect()
// ...interact with emulator...
await emulator.disconnect()

// Graceful cleanup
await emulator.destroy() // Stops all tasks and clears resources
```

#### ⚙️ Initializing Registers
**Method**: `addRegisters(config)`
Use this to initialize register and bit values:
```js
emulator.addRegisters({
    holding: [
        { start: 0, value: 123 },
        { start: 1, value: 456 }
    ],
    input: [
        { start: 0, value: 999 }
    ],
    coils: [
        { start: 0, value: true }
    ],
    discrete: [
        { start: 0, value: false }
    ]
})
```

#### 🔄 Direct Read/Write (No RTU)
**Holding Registers**
```js
emulator.setHoldingRegister(0, 321)
const holding = emulator.readHoldingRegisters(0, 2)
console.log(holding) // [321, 456]
```

**Input Registers**
```js
emulator.setInputRegister(1, 555)
const input = emulator.readInputRegisters(1, 1)
console.log(input) // [555]
```

**Coils (boolean flags)**
```js
emulator.setCoil(2, true)
const coils = emulator.readCoils(2, 1)
console.log(coils) // [true]
```

**Discrete Inputs**
```js
emulator.setDiscreteInput(3, true)
const inputs = emulator.readDiscreteInputs(3, 1)
console.log(inputs) // [true]
```
>"Data is returned in `uint16` only. All values are automatically masked to 16-bit."

#### 🚫 Exceptions
You can set exceptions for specific operations:
```js
emulator.setException(0x03, 1, 0x02) // Error for reading holding register 1

try {
    emulator.readHoldingRegisters(1, 1)
} catch (err) {
    console.log(err.message) // Exception response for function 0x03 with code 0x02
}
```

#### 🔄 Dynamic Register Simulation
Simulate changing register values over time:
```js
// Periodically change the value in holding register 0 between 30 and 65
emulator.infinityChange({
    typeRegister: 'Holding',    // 'Holding', 'Input', 'Coil', or 'Discrete'
    register: 0,                // Register address
    range: [30, 65],            // Value range [min, max] for registers, or boolean for coils
    interval: 500               // Update interval in milliseconds
})

// Stop dynamic changes
emulator.stopInfinityChange({
    typeRegister: 'Holding',
    register: 0
})
```

#### 🧪 Handling RTU Requests
**Input:** `Uint8Array` **with Modbus RTU request**
**Output:** `Uint8Array` **with response**
Example:
```js
const request = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B]) // Read Holding [0,2]
const response = emulator.handleRequest(request)

console.log(Buffer.from(response).toString('hex'))
// Example output: 010304007b01c8crc_lo crc_hi
```

#### 🧾 Full Example Script
```js
const SlaveEmulator = require('modbus-connect/slave-emulator')
const logger = require('modbus-connect/logger')

const log = logger.createLogger('main')
const emulator = new SlaveEmulator(1)

await emulator.connect()

emulator.addRegisters({
    holding: [{ start: 0, value: 123 }, { start: 1, value: 456 }],
    input: [{ start: 0, value: 999 }],
    coils: [{ start: 0, value: true }],
    discrete: [{ start: 0, value: false }]
})

log.warn('Holding:', emulator.readHoldingRegisters(0, 2))       // [123, 456]
log.warn('Input:', emulator.readInputRegisters(0, 1))           // [999]
log.warn('Coils:', emulator.readCoils(0, 1))                     // [true]
log.warn('Discrete:', emulator.readDiscreteInputs(0, 1))        // [false]

await emulator.disconnect()
```

#### 🧰 Additional Methods
| METHOD | DESCRIPTION |
|--------|-------------|
| setHoldingRegister(addr, val)        | Set holding register (0-65535)      |
| setInputRegister(addr, val)          | Set input register (0-65535)        |
| setCoil(addr, bool)                  | Set coil bit (boolean)              |
| setDiscreteInput(addr, bool)         | Set discrete input bit (boolean)    |
| readHoldingRegisters(start, qty)     | Read holding registers (max 125)    |
| readInputRegisters(start, qty)       | Read input registers (max 125)      |
| readCoils(start, qty)                | Read coil bits (max 2000)           |
| readDiscreteInputs(start, qty)       | Read discrete input bits (max 2000) |
| setException(funcCode, addr, exCode) | Register an exception               |
| handleRequest(buffer)                | Process Modbus RTU request          |
| infinityChange(config)               | Start dynamic register simulation   |
| stopInfinityChange(config)           | Stop dynamic register simulation    |
| getRegisterStats()                   | Get statistics about all registers  |
| getRegisterDump()                    | Get complete register dump          |
| getInfinityTasks()                   | Get list of active dynamic tasks    |
| clearAllRegisters()                  | Clear all register values           |
| clearExceptions()                    | Clear all exceptions                |
| clearInfinityTasks()                 | Stop all dynamic simulation tasks   |
| destroy()                            | Graceful shutdown with cleanup      |

#### ✅ Supported Modbus RTU Function Codes
| FUNCTION CODE | DESCRIPTION | MAX QUANTITY |
|---------------|-------------|--------------|
|   0x01   |   Read Coils                 |   2000   |
|   0x02   |   Read Discrete Inputs       |   2000   |
|   0x03   |   Read Holding Registers     |   125    |
|   0x04   |   Read Input Registers       |   125    |
|   0x05   |   Write Single Coil          |   1      |
|   0x06   |   Write Single Register      |   1      |
|   0x0F   |   Write Multiple Coils       |   1968   |
|   0x10   |   Write Multiple Registers   |   123    |

#### 📊 Diagnostic Methods
```js
// Get register statistics
const stats = emulator.getRegisterStats();
console.log(stats);
// Output: {
//   coils: 5,
//   discreteInputs: 3,
//   holdingRegisters: 10,
//   inputRegisters: 8,
//   exceptions: 2,
//   infinityTasks: 1
// }

// Get complete register dump
const dump = emulator.getRegisterDump();
console.log(dump);
// Output: {
//   coils: { '0': true, '1': false, ... },
//   discreteInputs: { '0': false, ... },
//   holdingRegisters: { '0': 123, '1': 456, ... },
//   inputRegisters: { '0': 999, ... }
// }

// Get active infinity tasks
const tasks = emulator.getInfinityTasks();
console.log(tasks); // ['Holding:0', 'Coil:5', ...]
```

#### 🧹 Cleanup Methods
```js
// Clear all register values
emulator.clearAllRegisters();

// Clear all exceptions
emulator.clearExceptions();

// Stop all infinity tasks
emulator.clearInfinityTasks();

// Complete cleanup (recommended)
await emulator.destroy();
```

### Slave emulator With PollingManager
Also `SlaveEmulator` can work in conjunction with `(PollingManager)[##polling-manager]`. Example usage:
```js
const SlaveEmulator = require('modbus-connect/slave-emulator')
const PollingManager = require('modbus-connect/polling-manager')
const logger = require('modbus-connect/logger')

const log = logger.createLogger('main')
log.setLevel('debug')

const poll = new PollingManager({
    defaultMaxRetries: 3,
    defaultBackoffDelay: 500,
    defaultTaskTimeout: 2000,
    logLevel: 'debug'
})

const emulator = new SlaveEmulator(1)
emulator.logger.setLevel('debug')

await emulator.connect()

// Initialize emulator register values
emulator.addRegisters({
    holding: [
        { start: 0, value: 123 },
        { start: 1, value: 456 }
    ],
    input: [
        { start: 0, value: 999 }
    ],
    coils: [
        { start: 0, value: true }
    ],
    discrete: [
        { start: 0, value: false }
    ]
})

// Periodically change the value in holding register 0 between 30 and 65
emulator.infinityChange({
    typeRegister: 'Holding',
    register: 0,
    range: [30, 65],
    interval: 500 // ms
})

// Add a polling task that reads data from the emulator every 1 second
poll.addTask({
    id: 'modbus-loop',
    resourceId: 'emulator-test',  // Use resourceId for sequential execution
    interval: 1000,
    immediate: true,
    fn: [
        () => emulator.readHoldingRegisters(0, 2),
        () => emulator.readInputRegisters(0, 1),
        () => emulator.readCoils(0, 1),
        () => emulator.readDiscreteInputs(0, 1)
    ],
    onData: ([holding, input, coils, discrete]) => {
        log.info('Registers updated', { 
            slaveId: 1,
            funcCode: 0x03,
            holding, 
            input, 
            coils, 
            discrete 
        });
    },
    onError: (error, index, attempt) => {
        log.warn(`Error in fn[${index}], attempt ${attempt}`, { 
            slaveId: 1,
            error: error.message,
            funcCode: [0x01, 0x02, 0x03, 0x04][index]
        });
    },
    onStart: () => log.info('Polling started', { slaveId: 1 }),
    onStop: () => log.info('Polling stopped', { slaveId: 1 }),
    maxRetries: 3,
    backoffDelay: 300,
    taskTimeout: 2000
});

// Later...
// await poll.stopTask('modbus-loop');
// await emulator.destroy();
```

Example Log Output:
```bash
[12:45:30] [INFO] [PollingManager] PollingManager initialized { config: {...} }
[12:45:30] [INFO] [Task:modbus-loop] TaskController created { id: 'modbus-loop', resourceId: 'emulator-test', interval: 1000 }
[12:45:30] [INFO] [Queue:emulator-test] TaskQueue created
[12:45:30] [INFO] [SlaveEmulator] Connecting to emulator...
[12:45:30] [INFO] [SlaveEmulator] Connected
[12:45:30] [INFO] [SlaveEmulator] Registers added successfully { coils: 1, discrete: 1, holding: 2, input: 1 }
[12:45:30] [INFO] [Task:modbus-loop] Task started
[12:45:30] [DEBUG] [Queue:emulator-test] Task enqueued { taskId: 'modbus-loop' }
[12:45:30] [DEBUG] [Queue:emulator-test] Acquiring mutex for task processing
[12:45:30] [DEBUG] [Queue:emulator-test] Processing task { taskId: 'modbus-loop' }
[12:45:30] [INFO] [Task:modbus-loop] Executing task once
[12:45:30] [INFO] [SlaveEmulator] readHoldingRegisters { startAddress: 0, quantity: 2 }
[12:45:30] [INFO] [SlaveEmulator] readInputRegisters { startAddress: 0, quantity: 1 }
[12:45:30] [INFO] [SlaveEmulator] readCoils { startAddress: 0, quantity: 1 }
[12:45:30] [INFO] [SlaveEmulator] readDiscreteInputs { startAddress: 0, quantity: 1 }
[12:45:30] [INFO] [Task:modbus-loop] Task execution completed { success: true, resultsCount: 4 }
[12:45:30] [DEBUG] [Queue:emulator-test] Task executed successfully { taskId: 'modbus-loop' }
[12:45:30] [INFO] [main] Registers updated { slaveId: 1, funcCode: 0x03, holding: [123, 456], input: [999], coils: [true], discrete: [false] }
[12:45:31] [DEBUG] [Queue:emulator-test] Task marked as ready { taskId: 'modbus-loop' }
```

Key Integration Features:
- **Resource-based Queuing**: Use `resourceId` to ensure sequential access to the emulator
- **Advanced Logging**: Full context-aware logging with slaveId and function codes
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **Performance Monitoring**: Built-in statistics and diagnostics
- **Graceful Cleanup**: Proper resource management with `destroy()` method

🛡️ Validation and Error Handling
The emulator includes comprehensive validation:
- **Address validation**: All addresses must be between 0 and 65535
- **Value validation**: Register values must be between 0 and 65535, coil values must be boolean
- **Quantity validation**: Respects Modbus protocol limits for each function
- **CRC validation**: Automatic CRC checking for incoming requests
- **Exception handling**: Proper Modbus exception responses
- **Input validation**: Type checking for all parameters

Emulator note
This emulator does not use real or virtual COM ports. It is fully virtual and designed for testing Modbus RTU logic without any physical device. It supports all standard Modbus RTU function codes with proper error handling, CRC validation, and protocol compliance. The integration with PollingManager provides enterprise-grade task management with logging, retries, and resource coordination.

<br>

## 📎 Notes
- Each `fn[i]` is handled independently; one failing does not stop others.
- `onData(results)` is called only if all functions succeed, with `results[i]` matching `fn[i]`.
- Retries (`maxRetries`) are applied per function, with delay `delay = backoffDelay × attempt`.
- `taskTimeout` applies individually to each function call.
- `onError(error, index, attempt)` fires on each failed attempt.
- Use `getTaskState(id)` for detailed insight into task lifecycle.
- Suitable for advanced diagnostic loops, sensor polling, background watchdogs, or telemetry logging.
- `PollingManager` handles transport `flush()` and `ModbusFlushError` internally for smotther operation.

<br>

## ❗ <span id="important-note">Important Note</span>
- Automatic transport reconnection is handled by the transport layer, not by the `ModbusClient` directly during retries anymore.
  >Automatic device reconnection for `WebSerialTransoprt` is not possible due to browser restrictions for user security reasons.

<br>

## <span id="tips-for-use">Tips for use</span>

- For Node.js, the `serialport` package is required (`npm install serialport`).
- For browser usage, HTTPS and Web Serial API support are required (**Google Chrome** or **Edge** or **Opera**).
- Use auto-detection methods to find port parameters and slaveId
- Use the client's `getDiagnostics()` and `resetDiagnostics()` methods for diagnostics.

<br>

## <span id="expansion">Expansion</span>
You can add your own Modbus functions by implementing a pair of `build...Request` and `parse...Response` functions in the `function-codes/` folder, then importing them into the ModbusClient in `modbus/client.js`

<br>

## <span id="changelog">CHANGELOG</span>
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

### **1.8.9 (2025-8-7)**
- Fixed calculation of expected response in `_readPacket()` of `ModbusClient` client
- Modified `readDeviceComment` function (**custom for SGM130**)

### **1.8.8 (2025-8-5)**
- Added `mutex` option to `ModbusClient` and `createTransport` constructor's for web transport

### **1.8.7 (2025-8-5)**
- Added RS485 support
  - Usage example:
    ```js
    const transport = await createTransport('node', {
          port: 'COM3',
          baudRate: 9600,
          parity: 'none',
          dataBits: 8,
          stopBits: 1,
          writeTimeout: 500,
          readTimeout: 500
      });

      await transport.connect();

      await new Promise(resolve => setTimeout(resolve, 1000));

      const client1 = new ModbusClient(transport, 38, { timeout: 1000 });

      const client2 = new ModbusClient(transport, 115, { timeout: 1000 });

      try {
          console.log('\n--- Reading from Device 1 (ID=38) ---');
          const holdingRegsDevice1 = await client1.readHoldingRegisters(0, 12);
          console.log('Device 1 Holding Registers [0-2]:', holdingRegsDevice1);

          console.log('\n--- Reading from Device 2 (ID=115) ---');
          const holdingRegsDevice2 = await client2.readHoldingRegisters(0, 12);
          console.log('Device 2 Input Registers [0-2] as Float:', holdingRegsDevice2);

      } catch (err) {
          console.error('Error reading:', err.message);
      }
    ```
  

### **1.8.5 (2025-7-29)**
- Improved device response checking in `packet-builder.js` and `write-multiple-registers.js`

### **1.8.4 (2025-07-26)**
- Returned the previous parameters for `web` transport in `factory.js`, now it is necessary to simply pass **port** instead of **deviceManager**
- Library manual updated

### **1.8.2 (2025-07-25)**
- Added task streams to `PollingManager`. This changed the usage of task creation in PollingManager, see changes in [PollingManager](#polling-manager)
- Removed check for function code in device response to `writeMultipleRegisters`

### **1.8.1 (2025-07-24)**
- Added `portFactory` option to `ModbusClient` and `createTransport` constructor's for web transport
- Added `deviceManager` option to `ModbusClient` and `createTransport` constructor's for web transport
- Library manual updated

### **1.8.0 (2025-07-24)**
- Refactored Reconnection Logic: Automatic reconnection responsibility has been moved from `ModbusClient` to the transport layer (**NodeSerialTransport**, **WebSerialTransport**). This prevents conflicts and simplifies the client's error handling.
- Enhanced Flush Handling: Added ModbusFlushError and implemented `flush()` methods in transports. `ModbusClient` and `PollingManager` now correctly handle this error, often resetting backoff delays for faster recovery.
- Improved PollingManager: `PollingManager` now resets its exponential backoff delay after a transport flush or a `ModbusFlushError`. It also flushes the transport buffer before each task run to ensure clean communication state.
- Removed Transport Restart: Removed the automatic transport restart logic from `PollingManager` as transports now manage their own reconnection.
- Updated Documentation: Documentation updated to reflect the new architecture and error handling improvements.