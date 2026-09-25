[← Back to README](../README.md)

# Modbus Scanner

> The `ModbusScanner` is a high-performance tool built into the `TransportController` that allows you to
> discover Modbus devices on a line or network without knowing their exact settings.

---

## 📚 Table of Contents

- [Key Features](#key-features)
- [Scan Profiles](#scan-profiles)
- [Callback System](#callback-system)
- [Scanning Options (IScanOptions)](#scanning-options-iscanoptions)
- [Scanning Methods](#scanning-methods)
  - [`scanRtuPort()`](#scanrtuportoptions)
  - [`scanTcpPort()`](#scantcpportoptions)
- [Scanner Control](#scanner-control)
- [Scan Report (IScanReport)](#scan-report-iscanreport)

---

## Key Features

- **Scan Profiles**: Mandatory `profile` parameter (`'quick'`, `'deep'`, `'custom'`) that presets baud rates, parities, concurrency, and timeouts. User options override profile defaults.
- **Adaptive RTU Timeouts**: Calculates the minimum physical probe timeout from the serial bit-time —
  `timeout = ceil(264000 / baud + padding)` — so the scanner never waits longer than physically needed
  (e.g., ~8ms per probe at 115200 baud with the `quick` profile's 5ms padding).
- **Isomorphic RTU Scanning**: Automatically detects if you are in Node.js or a Browser environment.
- **High-Concurrency TCP Scanning**: Scans multiple Unit IDs in parallel with configurable concurrency and timeout.
- **Lifecycle Control**: Ability to pause, resume, stop, and reset the scanning process programmatically. Supports `AbortSignal` for external cancellation.
- **Scan Statistics**: Returns `IScanReport` with discovered devices and detailed `IScanStats` (duration, probes sent, timeouts, CRC errors, exception responses).
- **Traffic Sniffer Integration**: When sniffer is enabled on the controller, scan traffic is automatically captured for analysis.
- **Multi-Baud Discovery**: Optional `multiBaud` flag reports a device per baud rate. Default deduplication
  key is `slaveId + parity + stopBits`; with `multiBaud` the baud rate is added to the key.
- **Per-Unit Progress**: TCP scan reports progress for each individual Unit ID, not just per batch.

---

## Scan Profiles

The `profile` parameter is **mandatory** and provides sensible defaults. You can still override any field by providing it explicitly.

| Profile  | Baud Rates                                 | Parities                     | Stop Bits | Concurrency | TCP Timeout | Padding |
| -------- | ------------------------------------------ | ---------------------------- | --------- | ----------- | ----------- | ------- |
| `quick`  | 115200, 57600, 38400, 19200, 9600          | none, even                   | 1, 2      | 100         | 200ms       | 5ms     |
| `deep`   | 115200, 57600, 38400, 19200, 9600, ...1200 | none, even, odd, mark, space | 1, 2      | 25          | 500ms       | 10ms    |
| `custom` | — (you must provide all options)           | —                            | —         | —           | —           | —       |

---

## Callback System

The scanner uses a reactive callback system to provide real-time feedback, making it ideal for building smooth User Interfaces.

- `onDeviceFound(device)`: Triggered immediately when a device is verified. You can use this to populate a list in your UI as the scan progresses.
- `onProgress(current, total, info)`: Triggered on every request attempt.
  - `current`: Current attempt index.
  - `total`: Total planned attempts.
  - `info`: Object containing current scan parameters (RTU: `{ baud, parity, stopBits, slaveId }`, TCP: `{ host, port, unitId }`).
- `onFinish(results)`: Triggered when the entire scan process is complete. Returns an array of all discovered `IScanResult` objects.
- `onStats(stats)`: Triggered when scan finishes with detailed statistics (`durationMs`, `probesSent`, `timeouts`, `crcErrors`, `exceptionResponses`).
- `onRegisterRead(slaveId, registerAddress, value)`: Triggered on every successful register read during scanning. Returns the slave ID, the register address being probed, and the raw 16-bit value read from the device. Only fires on successful responses — timeouts, CRC errors, and exception responses do not trigger this callback.

---

## Scanning Options (`IScanOptions`)

| Property          | Type                                        | Description                                                                                  |
| ----------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `profile`         | `'quick' \| 'deep' \| 'custom'`             | **Required**. Scan profile that provides default values.                                     |
| `path`            | `string \| IWebSerialPort`                  | Serial port path (Node) or `IWebSerialPort` object (Web).                                    |
| `type`            | `'node-rtu' \| 'web-rtu'`                   | RTU transport type. Optional — auto-detected from `path` (`web-rtu` for a WebSerial object). |
| `bauds`           | `number[]`                                  | List of baud rates to check. Override profile defaults.                                      |
| `parities`        | `TParityType[]`                             | List of parities to check. Override profile defaults.                                        |
| `slaveIds`        | `number[]`                                  | Range of Slave IDs to check (default: 1-247).                                                |
| `hosts`           | `string[]`                                  | List of TCP hosts/IPs to check. Default: `['127.0.0.1']`.                                    |
| `ports`           | `number[]`                                  | List of TCP ports to check. Default: `[502]`.                                                |
| `unitIds`         | `number[]`                                  | Range of Unit IDs to check for TCP scan (default: 1-247).                                    |
| `registerAddress` | `number`                                    | The register address to read for verification. Default: `0`.                                 |
| `controller`      | `IScanController`                           | External scan controller (`pause`/`resume`/`stop`/`reset`). Optional.                        |
| `concurrency`     | `number`                                    | TCP parallel request count. Default from profile (100 / 25).                                 |
| `tcpTimeout`      | `number`                                    | TCP response timeout in ms. Default from profile (200 / 500).                                |
| `multiBaud`       | `boolean`                                   | Report devices on multiple baud rates (default: `false`).                                    |
| `signal`          | `AbortSignal`                               | Standard `AbortSignal` for external scan cancellation.                                       |
| `stopBitsList`    | `(1 \| 2)[]`                                | List of stop bits to scan (RTU only). Default from profile: `[1, 2]`.                        |
| `padding`         | `number`                                    | Extra ms padding for RTU timeout. Default from profile (5 / 10).                             |
| `onProgress`      | `(current, total, info) => void`            | Fired on every probe attempt.                                                                |
| `onDeviceFound`   | `(device: IScanResult) => void`             | Fired immediately when a device is verified.                                                 |
| `onFinish`        | `(results: IScanResult[]) => void`          | Fired when the scan completes with all discovered devices.                                   |
| `onStats`         | `(stats: IScanStats) => void`               | Fired when the scan finishes with detailed statistics.                                       |
| `onRegisterRead`  | `(slaveId, registerAddress, value) => void` | Fired on each successful register read during scan.                                          |

---

## Scanning Methods

### `scanRtuPort(options)`

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

  onRegisterRead: (slaveId, registerAddress, value) => {
    console.log(`Register read: slaveId=${slaveId} addr=${registerAddress} value=${value}`);
  },
});

console.log('Stats:', report.stats);
// Stats: { durationMs: 12450, probesSent: 2470, timeouts: 2465, crcErrors: 0, exceptionResponses: 5 }
```

---

### `scanTcpPort(options)`

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

## Scanner Control

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

## Scan Report (`IScanReport`)

Both `scanRtuPort` and `scanTcpPort` return an `IScanReport`:

```ts
{
  results: IScanResult[];
  stats: IScanStats;
}
```

### Scan Result (`IScanResult`)

```ts
{
  type: 'node-rtu' | 'web-rtu' | 'node-tcp';
  slaveId: number;     // The Modbus address found
  baudRate?: number;   // (RTU only) The working baud rate
  parity?: TParityType; // (RTU only) none, even, odd, mark, or space
  stopBits?: 1 | 2;    // (RTU only) Actual stop bits used during scan
  port?: string;       // The physical port path
  host?: string;       // (TCP only) The device IP
  tcpPort?: number;    // (TCP only) The device Port
  discoveredAt: number;// Unix timestamp when device was discovered
}
```

### Scan Statistics (`IScanStats`)

```ts
{
  durationMs: number; // Total scan duration
  probesSent: number; // Total Modbus requests sent
  timeouts: number; // Requests that timed out
  crcErrors: number; // CRC validation failures (RTU)
  exceptionResponses: number; // Modbus exception responses (device exists but refused)
}
```
