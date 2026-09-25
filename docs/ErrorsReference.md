[← Back to README](../README.md)

# Error Reference

> All custom errors in the library inherit from the `ModbusError` base class, which in turn extends the standard JavaScript `Error`.

---

## 📚 Contents

All errors are grouped by their origin and scope:

| Group                                                                             | What it covers                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| [Basic and system protocol errors](#basic-and-system-protocol-errors)             | The core error hierarchy and timeouts.           |
| [Data Validation Errors](#data-validation-errors)                                 | Invalid addresses, values and Modbus exceptions. |
| [Frame format and parsing errors](#frame-format-and-parsing-errors)               | Malformed or corrupted frames.                   |
| [Connection and transport errors](#connection-and-transport-errors)               | Transport lifecycle and buffer problems.         |
| [Physical Layer Errors](#physical-layer-errors)                                   | RS-485 / UART line-level issues.                 |
| [Gateway Errors and Advanced Exceptions](#gateway-errors-and-advanced-exceptions) | Gateways, memory and stack failures.             |
| [Timing and broadcast errors](#timing-and-broadcast-errors)                       | Inter-frame timing and configuration.            |
| [Implementation-Specific Errors](#implementation-specific-errors-nodeweb)         | Node.js / Web Serial specifics.                  |
| [Port Queue / Session / Client Errors](#port-queue--session--client-errors)       | Queue, roster and duplicate devices.             |
| [PollingManager Errors](#pollingmanager-errors)                                   | Polling task lifecycle.                          |

---

## Basic and system protocol errors

| Error class                    | Description and cause                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ModbusError`                  | Base class for all library errors.                                                                             |
| `ModbusTimeoutError`           | Request timeout. The device did not respond within the timeout period.                                         |
| `ModbusOperationTimeoutError`  | The `totalTimeout` budget of a whole call (retries and delays included) ran out. Extends `ModbusTimeoutError`. |
| `ModbusCRCError`               | Checksum (RTU) error. The received packet is corrupted (CRC16 error).                                          |
| `ModbusResponseError`          | Base class for all errors related to invalid responses.                                                        |
| `ModbusTooManyEmptyReadsError` | Too many empty reads in a row. Indicates a dead connection.                                                    |
| `ModbusExceptionError`         | Modbus Exception. Logical error returned by the device (contains the function code and error code).            |
| `ModbusFlushError`             | The operation was aborted due to flushing (flush) of the transport's internal buffer.                          |

---

## Data Validation Errors

| Error class                         | Description and cause                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModbusInvalidAddressError`         | An address outside the 1-255 range for Slave ID or an invalid register address was specified.                                                                                                                    |
| `ModbusInvalidFunctionCodeError`    | Using a function code not supported by the standard or plugins.                                                                                                                                                  |
| `ModbusInvalidQuantityError`        | Attempt to read/write more or less data than allowed (e.g., > 125 registers, > 2000 bits, > 123 registers or > 1968 bits per write, quantity = 0). Checked locally before anything is sent.                      |
| `ModbusIllegalDataAddressError`     | Exception `0x02`. Attempt to access a non-existent address in device memory.                                                                                                                                     |
| `ModbusIllegalDataValueError`       | Exception `0x03`. A value was transmitted that the device cannot accept. Also raised locally for values that cannot be encoded (a register outside 0-65535, a coil value that is neither a boolean nor `0`/`1`). |
| `ModbusSlaveBusyError`              | Exception `0x06`. The device is busy and cannot process the request at this time.                                                                                                                                |
| `ModbusAcknowledgeError`            | Exception `0x05`. The request has been accepted, but will take a long time to complete.                                                                                                                          |
| `ModbusSlaveDeviceFailureError`     | Exception `0x04`. A fatal error (crash) has occurred within the slave device.                                                                                                                                    |
| `ModbusInvalidStartingAddressError` | An attempt was made to start an operation from an invalid base address.                                                                                                                                          |

> **Tip:** Exception-based errors (`ModbusIllegalDataAddressError`, `ModbusSlaveBusyError`, etc.) are **logical** device errors.
> They are never retried automatically, even with `retryCount > 0`.

---

## Frame format and parsing errors

| Error class                         | Description and cause                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ModbusMalformedFrameError`         | A packet was received whose structure does not comply with the Modbus standard.                                                 |
| `ModbusInsufficientDataError`       | The response PDU is shorter than the minimum for its function code. Raised by the response parsers before any field is decoded. |
| `ModbusInvalidFrameLengthError`     | The length of the received response does not match the expected length for this function code.                                  |
| `ModbusInvalidTransactionIdError`   | TCP. The Transaction ID in the response did not match the one sent.                                                             |
| `ModbusUnexpectedFunctionCodeError` | The function code in the response differs from the code in the request (and this is not an Exception).                          |
| `ModbusSyncError`                   | Loss of frame synchronization (missing start/end markers).                                                                      |
| `ModbusFrameBoundaryError`          | Violation of data frame boundaries while reading from the stream.                                                               |

---

## Connection and transport errors

| Error class                    | Description and cause                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `ModbusConnectionRefusedError` | TCP. The remote server actively rejected the connection attempt.                 |
| `ModbusConnectionTimeoutError` | TCP. The TCP connection establishment timed out.                                 |
| `ModbusNotConnectedError`      | Attempting to fulfill a request when the transport is closed or not initialized. |
| `ModbusAlreadyConnectedError`  | Attempting to call connect() while the connection is already active.             |
| `ModbusBufferOverflowError`    | Incoming data exceeded maxBufferSize.                                            |
| `ModbusBufferUnderrunError`    | Attempting to read more bytes than are physically available in the buffer.       |

---

## Physical Layer Errors

Physical errors describe the state of the **wire itself** — most often they indicate a wiring problem, a bad cable, or an interference source rather than a bug in your code.

| Error class            | Description and cause                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `ModbusParityError`    | Parity error (incorrect Parity settings on one of the nodes).                  |
| `ModbusCollisionError` | A collision was detected (simultaneous transmission on a half-duplex channel). |
| `ModbusNoiseError`     | Data on the channel is corrupted by electrical interference or noise.          |
| `ModbusOverrunError`   | Data is arriving faster than the hardware buffer can handle it.                |
| `ModbusFramingError`   | UART framing error (usually due to a BaudRate or Stop bit mismatch).           |
| `ModbusLRCError`       | Longitudinal Redundancy Check Error (for ASCII mode).                          |
| `ModbusChecksumError`  | General error of any packet checksum.                                          |

---

## Gateway Errors and Advanced Exceptions

| Error class                         | Description and cause                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `ModbusGatewayPathUnavailableError` | Exception `0x0A`. The gateway cannot route to the end device.                        |
| `ModbusGatewayTargetDeviceError`    | Exception `0x0B`. The gateway did not wait for a response from the device behind it. |
| `ModbusGatewayBusyError`            | The gateway is overloaded and cannot accept a new request.                           |
| `ModbusMemoryParityError`           | Exception `0x08`. Parity error reading from device memory.                           |
| `ModbusMemoryError`                 | General internal error accessing device memory.                                      |
| `ModbusDataOverrunError`            | Data overflow while processing a request.                                            |
| `ModbusStackOverflowError`          | Internal stack overflow during low-level operations.                                 |

---

## Timing and broadcast errors

| Error class                    | Description and cause                                                    |
| ------------------------------ | ------------------------------------------------------------------------ |
| `ModbusInterFrameTimeoutError` | The allowed pause between bytes within a single frame was exceeded.      |
| `ModbusSilentIntervalError`    | Violation of the 3.5 character silent interval in Modbus RTU.            |
| `ModbusBaudRateError`          | Error related to a mismatch between the actual and specified baud rates. |
| `ModbusBroadcastError`         | Error attempting to perform a broadcast request (Slave ID 0).            |
| `ModbusConfigError`            | Error in the Modbus stack configuration parameters.                      |
| `ModbusDataConversionError`    | Unable to convert data to the required type (e.g., Buffer -> String).    |

---

## Implementation-Specific Errors (Node/Web)

### Web Serial Transport

| Error class                | Description                        |
| -------------------------- | ---------------------------------- |
| `TransportError`           | Base class for transport failures. |
| `WebSerialTransportError`  | Web Serial API-level error.        |
| `WebSerialConnectionError` | Failed to open port in browser.    |
| `WebSerialReadError`       | Web Serial read stream failed.     |
| `WebSerialWriteError`      | Web Serial write stream failed.    |

### Node Serial Transport

| Error class                 | Description                                |
| --------------------------- | ------------------------------------------ |
| `NodeSerialTransportError`  | Base class for Node.js Serial errors.      |
| `NodeSerialConnectionError` | Port not found or used by another process. |
| `NodeSerialReadError`       | Physical port read error in Node.js.       |
| `NodeSerialWriteError`      | Physical write or `drain` method error.    |

---

## Port Queue / Session / Client Errors

| Error class                | Description and cause                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModbusQueueOverflowError` | The port queue reached its `maxLength` and the caller did not get a free slot in time (`overflowPolicy: 'reject'`, or the `overflowWaitMs` bound elapsed). |
| `ModbusReentrancyError`    | `enqueue()` called synchronously from inside a running job (would deadlock).                                                                               |
| `ModbusScanActiveError`    | The port is paused for a device scan; new exchanges (and calls waiting for a queue slot) are refused fast.                                                 |
| `ModbusBusyError`          | The port did not become idle in time (draining before a scan).                                                                                             |
| `ClientAlreadyExistsError` | `createClient()` with a `clientId` that is already in the roster.                                                                                          |
| `DuplicateSlaveIdError`    | A second client (or `reassignClient()`) would serve a device that another client of this port already serves.                                              |
| `ClientNotFoundError`      | `reassignClient()` for an unknown client id. `removeClient()` is idempotent and silently ignores an already-removed client.                                |

> **Note:** A serial port is opened with an exclusive lock (default `exclusiveLock: true`): a second process gets
> `Serial port <path> is already in use by process <pid> ...` instead of silently corrupting frames on the
> shared line. Permanent open failures (busy / permission / missing device) are returned to the caller
> immediately instead of being retried forever behind a "connected" status.

---

## PollingManager Errors

| Error class                     | Description and cause                                                |
| ------------------------------- | -------------------------------------------------------------------- |
| `PollingManagerError`           | General polling manager error.                                       |
| `PollingTaskAlreadyExistsError` | Attempt to add a task with an existing ID.                           |
| `PollingTaskNotFoundError`      | Attempt to manage a task that is not in the list.                    |
| `PollingTaskValidationError`    | Error in task parameters (invalid interval, missing function).       |
| `RSModeConstraintError`         | Violation of mode rules (e.g., attempt to add two devices to RS232). |
