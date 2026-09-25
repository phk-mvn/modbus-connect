[← Back to README](../README.md)

# Traffic Sniffer

> The sniffer instance is available via the `controller.sniffer` property. It uses an Observer pattern
> (subscription-based) to deliver data.

---

## 📚 Table of Contents

- [Methods](#methods)
- [Transaction Structure (ITransaction)](#transaction-structure-itransaction)
- [Packet Structure (ISnifferPacket)](#packet-structure-isnifferpacket)
- [`onTransaction` Usage Example](#ontransaction-usage-example)
- [Meta Structure (ISnifferPacket.meta)](#meta-structure-isnifferpacketmeta)
- [Analysis Structure (ISnifferPacket.analysis)](#analysis-structure-isnifferpacketanalysis)
- [`onPacket()` Usage Example](#onpacket-usage-example)
- [Why use the Sniffer?](#why-use-the-sniffer)

---

## Methods

| Method                   | Description                                                           | Returns                             |
| ------------------------ | --------------------------------------------------------------------- | ----------------------------------- |
| `onPacket(handler)`      | Subscribes to the stream of individual packets (TX and RX separately) | `() => void` (Unsubscribe function) |
| `onTransaction(handler)` | Subscribes to completed transactions (Paired Request + Response)      | `() => void` (Unsubscribe function) |

---

## Transaction Structure (`ITransaction`)

Unlike individual packets, a transaction represents a full Modbus cycle. This is the best way to monitor device health and latency.

| Property      | Type                               | Description                                                                                                  |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`          | `string`                           | Unique alphanumeric ID for the transaction.                                                                  |
| `transportId` | `string`                           | Identifier of the transport channel.                                                                         |
| `protocol`    | `'rtu'` or `'tcp'`                 | The protocol used for this exchange.                                                                         |
| `request`     | `ISnifferPacket`                   | The complete request packet (TX).                                                                            |
| `response`    | `ISnifferPacket` or `null`         | The complete response packet (RX). `null` if a timeout occurred.                                             |
| `status`      | `'ok'` or `'error'` or `'timeout'` | Transaction result: `ok` (success), `error` (exception response or transport-level error), `timeout`.        |
| `durationMs`  | `number`                           | Round-trip time (RTT) from start of TX to end of RX (`0` for timeouts).                                      |
| `error`       | `string`                           | Error message: "No response received before next request" for timeouts, or the Modbus exception description. |
| `timestamp`   | `number`                           | Unix timestamp of when the transaction was completed.                                                        |

---

## Packet Structure (`ISnifferPacket`)

Every packet (`tx` or `rx`) captured by the sniffer:

| Property      | Type             | Description                                                                           |
| ------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `id`          | `string`         | Unique alphanumeric ID for the transaction.                                           |
| `transportId` | `string`         | Identifier of the transport (e.g., COM port path or IP:Port).                         |
| `direction`   | `'tx'` or `'rx'` | Direction: `tx` (Sent request), `rx` (Received response).                             |
| `timestamp`   | `number`         | Precise high-resolution timestamp (`performance.now()`).                              |
| `raw`         | `Uint8Array`     | The actual raw bytes of the packet.                                                   |
| `hex`         | `string`         | Formatted HEX string (e.g., `"7A 03 00 01"`).                                         |
| `ascii`       | `string`         | ASCII representation (non-printable characters replaced by dots).                     |
| `analysis`    | `object`         | Deep protocol analysis (see Analysis Structure below).                                |
| `meta`        | `object`         | Performance metrics and status (see Meta Structure below; empty `{}` for TX packets). |

---

## `onTransaction` Usage Example

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

## Meta Structure (`ISnifferPacket.meta`)

| Property         | Type      | Description                                                                                                             |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `latencyMs`      | `number`  | Time between TX completion and first byte of RX (Device reaction time).                                                 |
| `transferMs`     | `number`  | Time taken to receive the entire packet (Physical transmission time).                                                   |
| `totalMs`        | `number`  | Full transaction cycle time (`latency + transfer`).                                                                     |
| `bytesPerSecond` | `number`  | Calculated throughput speed of the line.                                                                                |
| `isFragment`     | `boolean` | Internal flag — always `false` on emitted packets: fragmented RX chunks are reassembled by the sniffer before emission. |
| `error`          | `string`  | Optional transport-level error message.                                                                                 |

> `meta` is computed only for RX packets. TX packets carry an empty `meta: {}`.

---

## Analysis Structure (`ISnifferPacket.analysis`)

| Property      | Type             | Description                                                              |
| ------------- | ---------------- | ------------------------------------------------------------------------ |
| `protocol`    | `'rtu' \| 'tcp'` | Detected protocol.                                                       |
| `slaveId`     | `number`         | Modbus unit/slave ID.                                                    |
| `funcCode`    | `number`         | Function code (exception bit already stripped — check `isException`).    |
| `isException` | `boolean`        | `true` for exception frames (FC `0x80+`).                                |
| `crcValid`    | `boolean`        | CRC16 validity (RTU only; always `true` for TCP).                        |
| `data`        | `any`            | Parsed payload: register values for FC 0x03/0x04, exception code, etc.   |
| `description` | `string`         | Human-readable summary, e.g. `[RTU] Request: Func 0x3, Addr: 0, Qty: 2`. |

---

## `onPacket()` Usage Example

```js
const controller = new TransportController({ sniffer: true });

// Subscribe to packets
controller.sniffer.onPacket(packet => {
  // Note: packets are already reassembled — fragmented RX chunks are merged
  // internally by the sniffer before a full packet is emitted (meta.isFragment
  // is always false, so there is no need to filter fragments here).

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

## Why use the Sniffer?

Unlike standard logging, the `TrafficSniffer`:

- **Zero Impact**: It runs asynchronously and doesn't delay your Modbus requests.
- **Sub-millisecond Precision**: Uses `performance.now()` for ultra-accurate timing.
- **Fragment Reassembly**: Automatically glues together packets that arrive in multiple chunks (common in Serial/TCP).
- **Error Debugging**: Helps identify if a failure is due to device latency, CRC corruption, or transport issues.
