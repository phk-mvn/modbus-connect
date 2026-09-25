// modbus/types/internal.ts

/**
 * Internal types and interfaces for use within the modbus-connect library.
 * These definitions describe subsystem contracts such as low-level protocol exchanges,
 * connection trackers, and traffic sniffing.
 */

import {
  EConnectionErrorType,
  TDeviceStateHandler,
  TPortStateHandler,
  TModbusProtocolType,
} from './public.js';

// ===================================================
// MODBUS PROTOCOL
// ===================================================

/**
 * Internal interface representing a Modbus framing protocol handler (RTU or TCP).
 * Handles framing, addressing, CRC/MBAP generation, and raw exchange with the transport.
 */
export interface IModbusProtocol {
  /**
   * Performs a single request-response exchange over the protocol.
   *
   * @param unitId - Modbus unit/slave address (1-247 for RTU, 0-255 for TCP).
   * @param pduRequest - Raw Protocol Data Unit (PDU) to send.
   * @param timeout - Maximum time to wait for a response in milliseconds.
   * @param expectedLengthResolver - Optional dynamic length resolver for custom or variable-length functions.
   * @returns A Promise resolving to the response PDU bytes.
   * @throws {ModbusTimeoutError} When no valid response is received within the timeout.
   * @throws {ModbusCrcError} When the received frame fails CRC checksum validation (RTU).
   * @throws {ModbusExceptionError} When the slave returns an exception response.
   */
  exchange(
    unitId: number,
    pduRequest: Uint8Array,
    timeout: number,
    expectedLengthResolver?: (
      partialResponsePdu: Uint8Array,
      requestPdu: Uint8Array
    ) => number | null
  ): Promise<Uint8Array>;
}

// ===================================================
// TRACKERS
// ===================================================

/**
 * Tracker responsible for monitoring the online/offline state of individual Modbus slave devices.
 * Supports debounced disconnection events and thread-safe state queries.
 */
export interface IDeviceConnectionTracker {
  /**
   * Registers a callback handler invoked when a device's connection status changes.
   * Immediately calls the handler with all currently known states.
   *
   * @param handler - Callback receiving (slaveId, connected, errorInfo).
   * @returns A Promise resolving once the handler is registered.
   */
  setHandler(handler: TDeviceStateHandler): Promise<void>;

  /**
   * Removes the active device state handler.
   *
   * @returns A Promise resolving once the handler is removed.
   */
  removeHandler(): Promise<void>;

  /**
   * Marks a slave device as connected, canceling any pending disconnect debounce timer.
   *
   * @param slaveId - Slave unit address (1-247).
   * @returns A Promise resolving once the state is updated.
   */
  notifyConnected(slaveId: number): Promise<void>;

  /**
   * Notifies that a slave device has disconnected, triggering a debounced state change.
   *
   * @param slaveId - Slave unit address (1-247).
   * @param errorType - Categorized connection error type.
   * @param errorMessage - Descriptive message detailing the disconnection reason.
   * @returns void
   */
  notifyDisconnected(slaveId: number, errorType: EConnectionErrorType, errorMessage: string): void;

  /**
   * Manually removes a device's tracked state and clears any pending timers.
   *
   * @param slaveId - Slave unit address to remove.
   * @returns void
   */
  removeState(slaveId: number): void;

  /**
   * Retrieves the current connection state of a specific slave device.
   *
   * @param slaveId - Slave unit address.
   * @returns A Promise resolving to the device state object, or undefined if untracked.
   */
  getState(slaveId: number): Promise<IDeviceConnectionStateObject | undefined>;

  /**
   * Retrieves snapshots of all tracked device connection states.
   *
   * @returns A Promise resolving to an array of device connection state objects.
   */
  getAllStates(): Promise<IDeviceConnectionStateObject[]>;

  /**
   * Clears all tracked states, cancels pending timers, and removes the active handler.
   *
   * @returns A Promise resolving once cleanup is complete.
   */
  clear(): Promise<void>;

  /**
   * Checks whether a device with the given slave ID is currently tracked.
   *
   * @param slaveId - Slave unit address.
   * @returns A Promise resolving to true if tracked, false otherwise.
   */
  hasState(slaveId: number): Promise<boolean>;

  /**
   * Retrieves the list of slave IDs that are currently marked as connected.
   *
   * @returns A Promise resolving to an array of connected slave IDs.
   */
  getConnectedSlaveIds(): Promise<number[]>;

  /**
   * Resets the debounce timer for a specific slave (testing/internal utility).
   *
   * @param slaveId - Slave unit address.
   * @returns void
   * @internal
   */
  __resetDebounce(slaveId: number): void;
}

/**
 * Tracker responsible for monitoring the physical or network port's connection state.
 * Emits debounced disconnect notifications and tracks active slave devices on the port.
 */
export interface IPortConnectionTracker {
  /**
   * Registers a callback handler for port connection state updates.
   *
   * @param handler - Callback receiving (isConnected, slaveIds, errorInfo).
   * @returns A Promise resolving once the handler is set.
   */
  setHandler(handler: TPortStateHandler): Promise<void>;

  /**
   * Marks the port as connected with the given list of slave IDs.
   *
   * @param slaveIds - Array of active slave device IDs on this port.
   * @returns A Promise resolving once the state is updated.
   */
  notifyConnected(slaveIds: number[]): Promise<void>;

  /**
   * Notifies that the port has disconnected with a debounced delay.
   *
   * @param errorType - Categorized connection error type.
   * @param errorMessage - Descriptive message detailing the disconnection reason.
   * @param slaveIds - Array of slave device IDs associated with the port.
   * @returns void
   */
  notifyDisconnected(
    errorType: EConnectionErrorType,
    errorMessage: string,
    slaveIds: number[]
  ): void;

  /**
   * Retrieves a snapshot of the current port connection state.
   *
   * @returns A Promise resolving to the port connection state object.
   */
  getState(): Promise<IPortConnectionState>;

  /**
   * Clears any active debounce timer and resets the port state to disconnected.
   *
   * @returns A Promise resolving once the tracker is cleared.
   */
  clear(): Promise<void>;

  /**
   * Checks whether the port is currently connected.
   *
   * @returns A Promise resolving to true if connected, false otherwise.
   */
  isConnected(): Promise<boolean>;

  /**
   * Resets the debounce timer for the port (testing/internal utility).
   *
   * @returns void
   * @internal
   */
  __resetDebounce(): void;
}

/**
 * Representation of a single slave device's connection status.
 */
export interface IDeviceConnectionStateObject {
  /**
   * Slave address (1-247).
   */
  slaveId: number;

  /**
   * Whether the device is currently responding and connected.
   */
  hasConnectionDevice: boolean;

  /**
   * Error classification type if disconnected.
   */
  errorType?: EConnectionErrorType;

  /**
   * Human-readable error message explaining the connection failure.
   */
  errorMessage?: string;
}

/**
 * Configuration options for initializing a DeviceConnectionTracker.
 */
export interface IDeviceConnectionTrackerOptions {
  /**
   * Debounce delay in milliseconds before dispatching disconnect notifications (default: 500).
   */
  debounceMs?: number;

  /**
   * Whether to validate that slaveId is within the valid 1-255 range (default: true).
   */
  validateSlaveId?: boolean;
}

/**
 * Representation of the port connection status and its associated slave devices.
 */
export interface IPortConnectionState {
  /**
   * Whether the communication channel (serial port or socket) is open.
   */
  isConnected: boolean;

  /**
   * Error classification type if disconnected.
   */
  errorType?: EConnectionErrorType;

  /**
   * Human-readable error message explaining why the port was disconnected.
   */
  errorMessage?: string;

  /**
   * List of slave IDs known or assigned to this port.
   */
  slaveIds: number[];

  /**
   * Timestamp in milliseconds when the state was last updated.
   */
  timestamp: number;
}

/**
 * Configuration options for initializing a PortConnectionTracker.
 */
export interface IPortConnectionTrackerOptions {
  /**
   * Debounce delay in milliseconds before dispatching port disconnect notifications (default: 300).
   */
  debounceMs?: number;
}

// ===================================================
// TRAFFIC SNIFFER
// ===================================================

/**
 * Interface for intercepting, recording, and analyzing Modbus traffic packets and transactions.
 */
export interface ITrafficSniffer {
  /**
   * Subscribes a listener to individual raw transmitted (TX) or received (RX) packets.
   *
   * @param handler - Callback function invoked for every captured packet.
   * @returns An unsubscribe function to remove the listener.
   */
  onPacket(handler: TSnifferHandler): () => void;

  /**
   * Subscribes a listener to paired request-response transactions.
   *
   * @param handler - Callback function invoked when a transaction completes or times out.
   * @returns An unsubscribe function to remove the listener.
   */
  onTransaction(handler: TTransactionHandler): () => void;

  /**
   * Records an outgoing (TX) packet to the sniffer.
   *
   * @param transportId - Identifier of the transport transmitting the packet.
   * @param data - Raw byte payload transmitted.
   * @param protocol - Optional Modbus protocol framing ('rtu' or 'tcp').
   * @returns void
   */
  recordTx(transportId: string, data: Uint8Array, protocol?: TModbusProtocolType): void;

  /**
   * Marks the start of a response (RX) packet arrival (first byte detected).
   *
   * @returns void
   */
  recordRxStart(): void;

  /**
   * Records a completed incoming (RX) packet to the sniffer and finalizes the active transaction.
   *
   * @param transportId - Identifier of the transport receiving the packet.
   * @param data - Raw byte payload received.
   * @param protocol - Modbus protocol framing ('rtu' or 'tcp').
   * @param error - Optional transport-level error description.
   * @returns void
   */
  recordRxEnd(
    transportId: string,
    data: Uint8Array,
    protocol: TModbusProtocolType,
    error?: string
  ): void;
}

/**
 * Represents a complete paired Modbus transaction consisting of a request and its corresponding response.
 */
export interface ITransaction {
  /**
   * Unique identifier for the transaction.
   */
  id: string;

  /**
   * Identifier of the transport channel over which the exchange occurred.
   */
  transportId: string;

  /**
   * Modbus protocol flavor used for this transaction ('rtu' or 'tcp').
   */
  protocol: TModbusProtocolType;

  /**
   * The transmitted request packet.
   */
  request: ISnifferPacket;

  /**
   * The received response packet, or null if the transaction timed out or was dropped.
   */
  response: ISnifferPacket | null;

  /**
   * Transaction outcome status:
   * - 'ok': Valid response received and parsed successfully.
   * - 'error': Exception response, CRC mismatch, or framing error.
   * - 'timeout': No response received before timeout expired.
   */
  status: 'ok' | 'error' | 'timeout';

  /**
   * Error description if status is 'error' or 'timeout'.
   */
  error?: string;

  /**
   * Total round-trip duration in milliseconds from TX start to RX completion.
   */
  durationMs: number;

  /**
   * Timestamp in milliseconds when the transaction was completed.
   */
  timestamp: number;
}

/**
 * Callback function signature for receiving completed Modbus transactions.
 */
export type TTransactionHandler = (transaction: ITransaction) => void;

/**
 * Protocol inspection details extracted from a raw Modbus packet.
 */
export interface ISnifferAnalysis {
  /**
   * Protocol flavor ('rtu' or 'tcp').
   */
  protocol: TModbusProtocolType;

  /**
   * Target slave device address.
   */
  slaveId: number;

  /**
   * Modbus function code (e.g., 0x03 for Read Holding Registers).
   */
  funcCode: number;

  /**
   * True if the packet is a Modbus exception response (function code has 0x80 bit set).
   */
  isException: boolean;

  /**
   * Whether the CRC checksum verified successfully (RTU only).
   */
  crcValid: boolean;

  /**
   * Decoded functional payload data (registers, coils, counts, etc.).
   */
  data?: any;

  /**
   * Human-readable summary of the packet's function and arguments.
   */
  description: string;
}

/**
 * Represents an individual captured Modbus data packet (either TX or RX).
 */
export interface ISnifferPacket {
  /**
   * Unique identifier matching the associated transaction.
   */
  id: string;

  /**
   * Identifier of the transport channel that processed the packet.
   */
  transportId: string;

  /**
   * Packet direction: 'tx' for outgoing transmission, 'rx' for incoming reception.
   */
  direction: 'tx' | 'rx';

  /**
   * Raw bytes of the packet.
   */
  raw: Uint8Array;

  /**
   * Formatted hexadecimal string representation of the raw bytes.
   */
  hex: string;

  /**
   * ASCII representation of printable bytes (non-printable bytes rendered as dots).
   */
  ascii: string;

  /**
   * High-resolution timestamp when the packet was captured.
   */
  timestamp: number;

  /**
   * Protocol analysis breakdown if parsing succeeded.
   */
  analysis?: ISnifferAnalysis;

  /**
   * Transmission timing and metric metadata.
   */
  meta: {
    /**
     * Latency in milliseconds between request completion and first response byte arrival.
     */
    latencyMs?: number;

    /**
     * Physical transfer time in milliseconds for the packet duration.
     */
    transferMs?: number;

    /**
     * Total elapsed time in milliseconds.
     */
    totalMs?: number;

    /**
     * Data throughput in bytes per second.
     */
    bytesPerSecond?: number;

    /**
     * Transport-level error message if packet reception encountered a low-level error.
     */
    error?: string;

    /**
     * True if this packet is an incomplete fragment of a multi-part stream read.
     */
    isFragment?: boolean;
  };
}

/**
 * Callback function signature for receiving individual captured packets from the sniffer.
 */
export type TSnifferHandler = (packet: ISnifferPacket) => void;
