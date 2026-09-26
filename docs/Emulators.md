[← Back to README](../README.md)

# Modbus Emulators (RTU & TCP)

> Emulators allow you to simulate real Modbus devices directly in your code. They support four memory areas
> (**Coils**, **Discrete Inputs**, **Holding Registers**, **Input Registers**), can simulate network delays,
> errors (Exceptions), and automatically change data (sensor simulation).

---

## 📚 Table of Contents

- [Adding an Emulator to the Controller](#adding-an-emulator-to-the-controller)
- [Emulator Data Management](#emulator-data-management)
  - [`addRegisters()`](#addregistersdefinitions)
  - [`deviceIdentification`](#deviceidentification)
  - [`infinityChange()`](#infinitychangeoptions)
  - [`stopInfinityChange()`](#stopinfinitychangeoptions)
  - [`setException()`](#setexceptionfunctioncode-address-exceptioncode)
  - [`clearAll()`](#clearall)
- [Full example: Emulator + Client + Polling](#full-example-emulator--client--polling)

---

## Adding an Emulator to the Controller

Emulators are registered as regular transports using `addTransport`.

**Options for `rtu-emulator` and `tcp-emulator`**:

| Option                 | Type      | Description                                                                                                                                               |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slaveId`              | `number`  | Modbus Unit ID of the emulator (0-247). Defaults to 1.                                                                                                    |
| `responseLatencyMs`    | `number`  | Artificial response delay in ms. Defaults: 30 for `rtu-emulator`, 5 for `tcp-emulator`.                                                                   |
| `initialRegisters`     | `object`  | An object with initial data for memory: `{ coils?, discrete?, holding?, input? }`.                                                                        |
| `deviceIdentification` | `object`  | Device identification objects (FC `0x2B`/`0x0E`): `{ [objectId]: string }`.                                                                               |
| `loggerEnabled`        | `boolean` | Enable/disable internal logging. Defaults to `true`.                                                                                                      |
| `RSMode`               | `string`  | For `tcp-emulator` only. Informational: the emulator always operates and reports `'TCP/IP'` (the option is accepted for factory signature compatibility). |

> There is no `slaveIds` option anymore: when the emulator transport connects, its slave is registered
> with the session's port automatically (via the device/port state handlers).

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
});
```

**Example of creating a TCP emulator**:

```js
await controller.addTransport('SIM_TCP', 'tcp-emulator', {
  slaveId: 1,
  responseLatencyMs: 10,
  initialRegisters: {
    input: [{ start: 100, value: 366 }],
  },
});
```

**Expected result**:

```bash
2026-09-25 10:00:00.104 INFO ModbusSlaveCore ModbusSlaveCore initialized successfully (Slave ID: 122)
2026-09-25 10:00:00.105 INFO Transport Controller Transport "SIM_RTU" added with PollingManager
```

---

## Emulator Data Management

> To interact with the emulator's internal memory and behavior, you must access its core via the transport's
> `getCore()` method: `controller.getSession('SIM_RTU').transport.getCore()`.

### `addRegisters(definitions)`

Allows you to bulk add or update data in memory.

```js
const emu = controller.getSession('SIM_RTU').transport;
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
2026-09-25 10:05:00.221 INFO ModbusSlaveCore Registers added successfully: {"coils":2,"discrete":1,"holding":2,"input":1}
```

---

### `deviceIdentification`

Emulators support the standard Read Device Identification function (FC `0x2B` / MEI `0x0E`). Data is filled manually via the `deviceIdentification` option — no extra code is required, you only set the transport type (`rtu-emulator` / `tcp-emulator`) and the client method `readDeviceIdentification()` works as with a real device.

Object IDs (standard): `0x00` VendorName, `0x01` ProductCode, `0x02` MajorMinorRevision, `0x03` VendorUrl, `0x04` ProductName, `0x05` ModelName, `0x06` UserApplicationName.

**Example**:

```js
await controller.addTransport('SIM_TCP', 'tcp-emulator', {
  slaveId: 122,
  deviceIdentification: {
    0: 'MyVendor',
    1: 'MY-100',
    2: 'v1.2.3',
    3: 'https://my-site.com',
    4: 'MyProduct',
    5: 'SLV-100',
    6: 'Test Slave',
  },
});

const client = await controller.createClient({
  slaveId: 122,
  transportId: 'SIM_TCP',
  timeout: 2000,
});
const id = await client.readDeviceIdentification('utf-8');
console.log(id.objects);
// { 0: 'MyVendor', 1: 'MY-100', 2: 'v1.2.3' } — Basic (0x01): objectId 0..2
```

> The emulator answers all read categories: Basic (`0x01`), Regular (`0x02`), Extended (`0x03`) and Individual
> (`0x04`). If `deviceIdentification` is not set, the slave responds with exception `0x03` (Illegal Data Value).

---

### `infinityChange(options)`

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
2026-09-25 10:10:00.512 INFO ModbusSlaveCore Infinity change started for Holding[0] (interval: 1000ms)
2026-09-25 10:10:01.523 DEBUG ModbusSlaveCore Infinity change: Holding[0] = 142
2026-09-25 10:10:02.531 DEBUG ModbusSlaveCore Infinity change: Holding[0] = 187
```

---

### `stopInfinityChange(options)`

Stops data generation.

```js
core.stopInfinityChange({
  typeRegister: 'Holding',
  register: 0,
});
```

**Expected result**:

```bash
2026-09-25 10:15:00.098 DEBUG ModbusSlaveCore Infinity change stopped for Holding:0
```

---

### `setException(functionCode, address, exceptionCode)`

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
2026-09-25 10:20:00.118 INFO ModbusSlaveCore Exception set: functionCode=0x3, address=10, exceptionCode=0x2
2026-09-25 10:20:00.118 WARN ModbusSlaveCore [FC:0x3] Throwing exception for function 0x3 at address 10: code 0x2
```

---

### `clearAll()`

Full clear: removes all data from tables, resets all errors, and stops all `infinityChange` tasks.

```js
core.clearAll();
```

**Expected result**:

```bash
2026-09-25 10:25:00.402 INFO ModbusSlaveCore All registers, exceptions and infinity tasks cleared
```

---

## Full example: Emulator + Client + Polling

```js
const TransportController = require('modbus-connect/transport');

async function startSystem() {
  const controller = new TransportController();

  // 1. Create and connect the emulator
  await controller.addTransport('DEVICE_SIM', 'rtu-emulator', {
    slaveId: 10,
    responseLatencyMs: 20,
  });
  await controller.connectTransport('DEVICE_SIM');

  // 2. Set up dynamic data
  const core = controller.getSession('DEVICE_SIM').transport.getCore();
  core.infinityChange({
    typeRegister: 'Holding',
    register: 1,
    range: [30, 40],
    interval: 1000,
  });

  // 3. Create a client to work with this emulator
  const client = await controller.createClient({
    slaveId: 10,
    transportId: 'DEVICE_SIM',
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
2026-09-25 12:00:00.089 INFO ModbusSlaveCore ModbusSlaveCore initialized successfully (Slave ID: 10)
2026-09-25 12:00:00.317 INFO RTU Emulator RTU Emulator connected
2026-09-25 12:00:00.318 INFO Transport Controller Transport "SIM_RTU" connected
2026-09-25 12:00:00.401 INFO ModbusSlaveCore Infinity change started for Holding[1] (interval: 1000ms)
2026-09-25 12:00:00.402 INFO Transport Controller [SIM_RTU][rtu][ID:10] Client 'client-1' created
2026-09-25 12:00:00.451 INFO manager Task added -> poll-emulator
2026-09-25 12:00:02.318 INFO ModbusClient [ID:10][FC:3] Response received +22ms
Value from the emulator: [34]
```
