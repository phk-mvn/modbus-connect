[← Back to README](../README.md)

# ModbusClient

> `ModbusClient` is a high-level interface for communicating with Modbus devices. It implements the retry
> logic, owns an isolated device connection tracker and automatically re-syncs with its port session when a
> transport is hot-swapped.

Serialization is not the client's job any more: every exchange is submitted as one job to the **port queue**
(`PortSession.queue`), which guarantees exactly one exchange on the wire at a time while letting several
clients share one port. The client has no mutex of its own.

---

## 📚 Table of Contents

- [Creating a client (ICreateClientOptions)](#creating-a-client-icreateclientoptions)
- [Status management and logging methods](#status-management-and-logging-methods)
- [Read Methods](#read-methods)
- [RegisterData — Type Conversion & Sub-Selection](#registerdata--type-conversion--sub-selection)
- [Write Methods](#write-methods)
- [Declarative Device Schema (withSchema)](#declarative-device-schema-withschema)
- [Service and diagnostic methods](#service-and-diagnostic-methods)
- [Plugins and custom features](#plugins-and-custom-features)
- [Getters](#getters)
- [Important Mechanisms (Under the hood)](#important-mechanisms-under-the-hood)

---

## Creating a client (`ICreateClientOptions`)

`ModbusClient` instances are created and owned by the controller — `await controller.createClient(...)`. The
class is never instantiated directly. `createClient()` derives framing from the port RS mode, keeps the port
slave inventory in sync and gives the client a `clientId` in the roster.

`ICreateClientOptions` = `IModbusClientOptions` **without** `framing`, plus:

| Option                  | Type      | Description                                                            |
| ----------------------- | --------- | ---------------------------------------------------------------------- |
| `slaveId`               | `number`  | Device address (0-255).                                                |
| `transportId`           | `string`  | Port id; omit it to let the router pick a port by `(slaveId, RSMode)`. |
| `clientId`              | `string`  | Roster id; generated automatically when omitted.                       |
| `allowDuplicateSlaveId` | `boolean` | Allow two clients for one device (default `false`).                    |

Client options:

| Option         | Type                                                                                   | Description                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RSMode`       | `'RS485'` or `'RS232'` or `'TCP/IP'`                                                   | Physical layer mode, used for routing; framing is derived from it (`rsModeToFraming`).                                                           |
| `timeout`      | `number`                                                                               | Waiting time for a response from the device (ms). Default: 1000.                                                                                 |
| `totalTimeout` | `number`                                                                               | Whole-call budget (ms) including retries and pauses; `0` = off (default). When it runs out, the call rejects with `ModbusOperationTimeoutError`. |
| `retryCount`   | `number`                                                                               | How many times to repeat the request in case of a communication error. Default: 0.                                                               |
| `retryDelay`   | `number`                                                                               | Delay between retries (ms). Default: 100.                                                                                                        |
| `echo`         | `boolean`                                                                              | Clear echo bytes after write (for RS485 half-duplex). Default: `false`.                                                                          |
| `logLevel`     | `'silent'` \| `'trace'` \| `'debug'` \| `'info'` \| `'warn'` \| `'error'` \| `'fatal'` | Client logger level. Default: `info`.                                                                                                            |
| `plugins`      | `TPluginConstructor[]`                                                                 | An array of plugin classes that will be initialized immediately.                                                                                 |

> **`timeout` semantics**: the value is the budget of **one exchange** (flush -> write -> read), measured from
> the moment the exchange really starts on the wire. Time spent waiting in the port queue behind other devices
> is not counted, so a queued request can never fail without having been sent.

**Example of initialization with all parameters:**

```js
const client = await controller.createClient({
  slaveId: 122,
  transportId: 'RS485_BUS',
  timeout: 3000,
  retryCount: 3,
  retryDelay: 500,
  plugins: [CustomPlugin],
});
```

---

## Status management and logging methods

### `enableLogger() / disableLogger()`

Enables or completely disables logging for this client.

```js
client.disableLogger(); // There will be no more logs of this client in the console
client.enableLogger(); // Logs are being output again
```

---

### `connect()`

Performs a logical check of transport availability for the given Slave ID. It does **not** open a
physical connection — that is managed exclusively by the `TransportController`. Throws
`ModbusNotConnectedError` when there is no transport for this slave or the port is not open.

```js
await client.connect();
```

**Expected result**:

```bash
[ModbusClient][ID:122] Client is ready. Transport is connected and available
```

---

### `disconnect()`

Logically disables the client. The physical transport is left untouched — for a client registered by
the controller this call unregisters the client from the roster (`removeClient()`), clears its
device state and releases the slave slot in the port inventory; a self-created client only removes
its Slave ID from the transport routes.

```js
await client.disconnect();
```

**Expected result**:

```bash
[ModbusClient][ID:122] Client disconnected and unregistered from transport
```

---

### `setSlaveId(newSlaveId)`

Changes the Slave ID address on the fly. All subsequent requests will be sent to the new address.

```js
await client.setSlaveId(10);
```

**Expected result**:

```bash
2026-09-25 12:00:10.204 INFO ModbusClient [ID:10] Slave ID changed 122 -> 10
```

---

## Read Methods

### `readCoils(startAddress, quantity, timeout?)` (FC 0x01)

Reads the values of the bit flags (Coils).

```js
const coils = await client.readCoils(0, 5);
console.log(coils);
```

**Expected result**:

```bash
2026-09-25 12:00:20.114 INFO ModbusClient [ID:122][FC:1] Response received +45ms
[true, true, true, true, false]
```

---

### `readDiscreteInputs(startAddress, quantity, timeout?)` (FC 0x02)

Reads the values of the digital inputs.

```js
const inputs = await client.readDiscreteInputs(100, 3);
console.log(inputs);
```

**Expected result**:

```bash
2026-09-25 12:01:20.109 INFO ModbusClient [ID:122][FC:2] Response received +40ms
[true, true, false]
```

---

### `readHoldingRegisters(startAddress, quantity)` (FC 0x03)

Reads the Holding registers. Returns a `RegisterData` object (extends `Array<number>`) that supports type conversion and sub-selection.

```js
const regs = await client.readHoldingRegisters(10, 2);
console.log(regs); // [1500, 240] — works like a regular array
```

**Expected result**:

```bash
2026-09-25 12:02:20.162 INFO ModbusClient [ID:122][FC:3] Response received +55ms
[1500, 240]
```

---

### `readInputRegisters(startAddress, quantity)` (FC 0x04)

Reads the Input registers. Returns a `RegisterData` object (extends `Array<number>`) that supports type conversion and sub-selection.

```js
const inputs = await client.readInputRegisters(0, 1);
console.log(inputs); // [356]
```

**Expected result**:

```bash
2026-09-25 12:03:20.155 INFO ModbusClient [ID:122][FC:4] Response received +48ms
[356]
```

---

## RegisterData — Type Conversion & Sub-Selection

> `readHoldingRegisters` and `readInputRegisters` return a `RegisterData` object instead of a plain `number[]`.
> `RegisterData` extends `Array<number>`, so all existing code (index access, `.length`, `.map`, etc.) continues
> to work without changes. The new methods allow you to convert raw 16-bit register values into standard numeric
> types and select specific registers from a block read.

### Conversion Methods

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

### Sub-Selection — `.sub()` and `.pick()`

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

- `.sub(offset, count?)` — selects a contiguous range. `count` defaults to 1 if omitted.
- `.pick(...indices)` — selects arbitrary registers (non-contiguous):

```js
// Pick specific registers scattered across the block
const flags = block.pick(4, 9).asUInt16(); // [1, 0]
```

> **Important**: When using `.pick()` with multi-register conversions (asUInt32, asInt32, asFloat32, asFloat64), **the order of indices you pass determines the word order**. For example, `block.pick(0, 1).asFloat32()` treats register 0 as the high word and register 1 as the low word (standard BE). But `block.pick(1, 0).asFloat32()` reverses the words — register 1 becomes the high word and register 0 becomes the low word. This is equivalent to applying a word-swap. Use this intentionally when your device stores values in a non-standard word order.

---

## Write Methods

### `writeSingleCoil(address, value, timeout?)` (FC 0x05)

Writes one bit.

```js
const res = await client.writeSingleCoil(5, true);
console.log(res);
```

---

### `writeSingleRegister(address, value, timeout?)` (FC 0x06)

Writes one 16-bit register.

```js
const res = await client.writeSingleRegister(20, 1000);
console.log(res);
```

---

### `writeMultipleCoils(address, values, timeout?)` (FC 0x0F)

Records a group of bits.

```js
const res = await client.writeMultipleCoils(0, [true, false, true]);
console.log(res);
```

---

### `writeMultipleRegisters(address, values, timeout?)` (FC 0x10)

Writes a group of registers.

```js
const res = await client.writeMultipleRegisters(10, [100, 200, 300]);
console.log(res); // { startAddress: 10, quantity: 3 }
```

---

### `writeFloat32(address, value, wordOrder?, timeout?)`

Writes a 32-bit floating point number (IEEE 754 single precision) into 2 consecutive holding registers.
Supports `'BE'` (default) or `'LE'` word order.

```js
await client.writeFloat32(10, 23.5); // Big-Endian
await client.writeFloat32(12, 23.5, 'LE'); // Little-Endian (word-swapped)
```

---

### `writeFloat64(address, value, wordOrder?, timeout?)`

Writes a 64-bit floating point number (IEEE 754 double precision) into 4 consecutive holding registers.

```js
await client.writeFloat64(20, 123456.789);
```

---

### `writeInt32(address, value, wordOrder?, timeout?)`

Writes a signed 32-bit integer (−2147483648 … 2147483647) into 2 consecutive holding registers.

```js
await client.writeInt32(30, -50000);
```

---

### `writeUInt32(address, value, wordOrder?, timeout?)`

Writes an unsigned 32-bit integer (0 … 4294967295) into 2 consecutive holding registers.

```js
await client.writeUInt32(32, 100000);
```

---

## Declarative Device Schema (`withSchema`)

> `client.withSchema(definition)` binds a high-level, declarative device register map directly to the client.
> It allows you to declare registers and groups using pure JavaScript/TypeScript objects, perform typed reads
> (`schema.read()`), read individual groups in a single PDU (`schema.readGroup()`), write single values or
> write entire register groups atomically (`schema.writeGroup()`).

### Defining a Schema

Schemas are defined using plain objects without any external helpers or DSL dependencies:

```js
const schema = client.withSchema({
  name: 'PowerMeter',
  fields: {
    // 1. Single fields:
    status: { address: 0x0001, type: 'uint16' },
    relay: { address: 0x0000, type: 'boolean', table: 'coil' },
    inputVal: { address: 0x0010, type: 'uint16', table: 'input' },

    // 2. Contiguous register groups (read/written as a single contiguous Modbus PDU):
    phaseA: {
      address: 0x1000, // Starting base address of the group
      table: 'holding', // Table for all group fields (defaults to 'holding')
      group: {
        voltage: { offset: 0, type: 'float32' }, // address 0x1000, 2 registers
        current: { offset: 2, type: 'float32' }, // address 0x1002, 2 registers
        power: { offset: 4, type: 'float32' }, // address 0x1004, 2 registers
      },
    },
  },
});
```

### Supported Field Types

| Type        | Registers / Bits | Description                                                                                   |
| ----------- | :--------------: | --------------------------------------------------------------------------------------------- |
| `'uint16'`  |    1 register    | Unsigned 16-bit integer (0 … 65535)                                                           |
| `'int16'`   |    1 register    | Signed 16-bit integer (−32768 … 32767)                                                        |
| `'uint32'`  |   2 registers    | Unsigned 32-bit integer                                                                       |
| `'int32'`   |   2 registers    | Signed 32-bit integer                                                                         |
| `'float32'` |   2 registers    | IEEE 754 single precision float                                                               |
| `'float64'` |   4 registers    | IEEE 754 double precision float                                                               |
| `'boolean'` |      1 bit       | Single coil/discrete input, or single-register flag                                           |
| `'bitmask'` |    1 register    | Unpacks single 16-bit register into `{ [key]: boolean }` flags via `bits: { flag: bitIndex }` |
| `'string'`  |   N registers    | ASCII/UTF-8 string (length defined by `length`)                                               |

### Reading with Schema

#### Reading all fields (`schema.read()`)

Reads all declared fields and groups. For each group, exactly **one** contiguous Modbus request is made for the entire block.

```js
const data = await schema.read();
console.log(data);
// Output:
// {
//   status: 1,
//   relay: true,
//   inputVal: 450,
//   phaseA: { voltage: 220.0, current: 5.0, power: 1100.0 }
// }
```

#### Reading a specific group (`schema.readGroup(groupKey)`)

Reads only the specified group in a single network request:

```js
const phaseA = await schema.readGroup('phaseA');
console.log(phaseA.voltage, phaseA.current);
```

#### Reading a subset of fields

Pass an array of field/group keys to read:

```js
const subset = await schema.read(['status', 'phaseA']);
```

### Writing with Schema

#### Writing single fields

```js
await schema.write('status', 1);
```

#### Writing inside a group with dot notation

Targets a specific subfield inside a group without affecting the rest of the group:

```js
await schema.write('phaseA.voltage', 230.5);
```

#### Atomic Group Writes (`schema.writeGroup(groupKey, values)`)

Writes all or partial subfields of a group **atomically in a single Modbus request** (`writeMultipleRegisters` FC 0x10 or `writeMultipleCoils` FC 0x0F):

```js
await schema.writeGroup('phaseA', {
  voltage: 230.0,
  current: 5.5,
  power: 1265.0,
});
```

_(If partial values are passed, the current block is read first to preserve unmentioned registers)._

### Using Schema with PollingManager

`PollingManager` remains completely transport-level and unchanged. You simply invoke `await schema.read()` inside the polling task's `fn`:

```js
controller.addPollingTask('RS485_BUS', {
  id: 'poll-meter',
  interval: 1000,
  fn: async () => {
    const data = await schema.read();
    return data;
  },
  onData: data => {
    console.log('Telemetry:', data[0]);
  },
});
```

---

## Service and diagnostic methods

### `reportSlaveId(timeout?)` (FC 0x11)

Requests a description of the device.

```js
const info = await client.reportSlaveId();
console.log(info);
```

**Expected result**:

```bash
2026-09-25 12:04:20.142 INFO ModbusClient [ID:122][FC:17] Response received +35ms
{ slaveId: 122, isRunning: true, data: Uint8Array(...) }
```

---

### `readDeviceIdentification(decoder, timeout?)` (FC 0x2B)

Reads the device's passport data (Vendor, Model, etc.).

```js
const id = await client.readDeviceIdentification('utf-8');
console.log(id.objects);
```

**Expected result**:

```bash
2026-09-25 12:05:20.217 INFO ModbusClient [ID:122][FC:43] Response received +110ms
{ 0: "VendorName", 1: "ProductCode", 2: "v1.0" }
```

---

### `rawExchange(pdu, timeout?, expectedLengthResolver?)`

Escape hatch for vendor/custom function codes and diagnostics. The PDU is sent as-is and the response
PDU is returned without any function-specific parsing. The port queue, the device connection tracker
and the retry logic still apply, so it is safe to mix with normal calls.

```js
const response = await client.rawExchange(new Uint8Array([0x64, 0x00, 0x01]));
console.log(Buffer.from(response).toString('hex')); // '6402abcd'
```

An unknown function code needs no configuration: the frame boundary is taken from the CRC (RTU) or
the MBAP length (TCP). You can also provide an optional `expectedLengthResolver: (partialResponsePdu, requestPdu) => number | null` for variable-length custom frames. An empty PDU is rejected with `ModbusBufferUnderrunError`.

---

## Plugins and custom features

The library allows you to extend the standard Modbus with manufacturer-specific functions.

A plugin is a class that should have a `name` property and a `customFunctionCodes` object. Each function
code must contain `buildRequest` (PDU assembly) and `parseResponse` (response parsing), and can optionally provide `getExpectedResponseLength` for variable-length responses.

```js
// Example of a plugin for working with a non-standard function code
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

### Dynamic Response Length (`getExpectedResponseLength`)

For custom functions whose response length depends on the response content (e.g., file chunks, archive readings, or variable strings), implement `getExpectedResponseLength`:

```js
readFileChunk: {
  buildRequest: chunkIdx => new Uint8Array([0x5A, (chunkIdx >> 8) & 0xff, chunkIdx & 0xff]),

  // Dynamically determines expected PDU length from the received header bytes
  getExpectedResponseLength: (partialPdu, reqPdu) => {
    if (partialPdu.length < 3) return null; // Need at least FC + 2 bytes length header
    const dataSize = (partialPdu[1] << 8) | partialPdu[2];
    return 3 + dataSize; // Total expected PDU length in bytes
  },

  parseResponse: responsePdu => {
    const dataSize = (responsePdu[1] << 8) | responsePdu[2];
    return responsePdu.subarray(3, 3 + dataSize);
  },
}
```

When `getExpectedResponseLength` returns a number, the protocol framer reads the entire remaining packet in a single transport read instead of reading byte-by-byte or timing out.

### Plugin registration

**Method A** — Through `createClient()` options (recommended):

```js
const client = await controller.createClient({
  slaveId: 1,
  transportId: 'RS485_BUS',
  plugins: [MyManufacturerPlugin],
});
```

**Method B** — Using the `use()` method:

```js
const client = await controller.createClient({ slaveId: 1, transportId: 'RS485_BUS' });
client.use(new MyManufacturerPlugin());
```

### Calling a custom function

```ts
// Calling the function by the name specified in the plugin (supports optional generic type for return value)
const hash = await client.executeCustomFunction<string>('getFirmwareHash', 0x01);
console.log('Firmware hash:', hash);
```

---

## Getters

### `currentSlaveId`

Returns the current address of the device that the client is working with.

```js
console.log(client.currentSlaveId); // 122
```

---

## Important Mechanisms (Under the hood)

- **`_syncProtocol()`**: The client is a smart shell. Before each request, it checks whether the transport in the `TransportController` has been restarted (for example, the port path or IP has changed). If the transport is new, the client instantly updates its internal exchange logic without interrupting the program.
- **Serialized exchanges**: the client has no mutex of its own. Every exchange is submitted as one job to the port queue (`immediate` + high priority), so simultaneous calls line up in a strict queue and packets can never get mixed up on the channel.
- **The answer must belong to the addressed device**: on a shared RS485 bus a late frame from another
  device (or from a foreign master) can arrive while a client is waiting. Such a frame is recognised
  by its slave address and dropped with a `Foreign frame ignored` debug record instead of being
  mistaken for the answer — previously another device's data could be returned to the caller.
- **Retry Logic**:
  - If the device does not respond or the data is corrupted (CRC Error), the client will automatically retry (`retryCount`).
  - If the device has responded with a **Modbus Exception** (for example, Illegal Function), repeated attempts **are not performed**, as this is a logical error, not a physical failure.
  - A **port queue overflow** (`ModbusQueueOverflowError`) is not retried either — repeating would only make the congestion worse.
  - The pause before each retry is part of the `totalTimeout` budget (when enabled).
