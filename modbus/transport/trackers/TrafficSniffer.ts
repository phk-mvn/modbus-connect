// modbus/transport/trackers/TrafficSniffer.ts

import { crc16Modbus } from '../../utils/crc.js';
import {
  ITrafficSniffer,
  ISnifferPacket,
  ISnifferAnalysis,
  ITransaction,
  TSnifferHandler,
  TModbusProtocolType,
  TTransactionHandler,
} from '../../types/modbus-types.js';

/**
 * TrafficSniffer is a non-invasive protocol analyzer for Modbus RTU and TCP.
 *
 * It monitors raw byte streams to:
 * - Calculate sub-millisecond performance metrics (Latency, Transfer time).
 * - Reassemble fragmented packets (TCP MBAP length check or RTU CRC validation).
 * - Provide human-readable protocol analysis (Unit ID, Function codes, Register data).
 * - Generate HEX and ASCII representations for debugging.
 */
export class TrafficSniffer implements ITrafficSniffer {
  private _handlers: TSnifferHandler[] = [];
  private _lastTxTime: number = 0;
  private _rxStartTime: number = 0;

  /**
   * Internal storage for accumulating fragmented RX data per transport channel.
   */
  private _rxBufferMap = new Map<string, { data: Uint8Array; latency: number }>();

  /** @private Handlers for transaction-level events */
  private _transactionHandlers: TTransactionHandler[] = [];

  /** @private Keeps track of the last request sent on each transport channel to pair it with a response */
  private _pendingTx = new Map<string, ISnifferPacket>();

  /**
   * Subscribes a handler to the stream of processed packets.
   * @param handler - A callback function that receives an ISnifferPacket.
   * @returns A function to unsubscribe the handler.
   */
  public onPacket(handler: TSnifferHandler): () => void {
    this._handlers.push(handler);
    return () => {
      this._handlers = this._handlers.filter(h => h !== handler);
    };
  }

  /**
   * Subscribes a handler to complete Modbus transactions (Request + Response pairs).
   * @param handler - A callback function that receives an ITransaction.
   * @returns A function to unsubscribe the handler.
   */
  public onTransaction(handler: TTransactionHandler): () => void {
    this._transactionHandlers.push(handler);
    return () => {
      this._transactionHandlers = this._transactionHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Records an outgoing Modbus request (TX).
   * Automatically clears any stale RX buffers for the specific transport channel.
   * @param transportId - Unique identifier of the transport (e.g., COM port or IP address).
   * @param data - The raw bytes being sent.
   */
  public recordTx(
    transportId: string,
    data: Uint8Array,
    protocol: TModbusProtocolType = 'rtu'
  ): void {
    this._lastTxTime = performance.now();

    // Check if the previous request on this channel never got a response
    this._checkAndEmitTimeout(transportId);

    this._rxBufferMap.delete(transportId);

    const packet = this._createPacket(transportId, 'tx', data, this._lastTxTime);
    packet.analysis = this._analyzeModbusAdu(data, true, protocol);

    // Store this request to match it with the upcoming response
    this._pendingTx.set(transportId, packet);

    this._notify(packet);
  }

  /**
   * Records the timestamp of the very first byte received in a response.
   * This is used to calculate the device's processing latency (Response Time).
   */
  public recordRxStart(): void {
    this._rxStartTime = performance.now();
  }

  /**
   * Records incoming data chunks (RX).
   * This method handles fragmentation by accumulating chunks until a valid
   * Modbus TCP or RTU packet is reassembled.
   * @param transportId - Unique identifier of the transport.
   * @param data - The raw bytes received in the current chunk.
   * @param error - Optional transport-level error message.
   */
  public recordRxEnd(
    transportId: string,
    data: Uint8Array,
    protocol: TModbusProtocolType = 'rtu',
    error?: string
  ): void {
    const endTime = performance.now();
    const latency = this._rxStartTime > 0 ? this._rxStartTime - this._lastTxTime : 0;
    const transfer = this._rxStartTime > 0 ? endTime - this._rxStartTime : 0;

    let session = this._rxBufferMap.get(transportId);
    if (!session) {
      session = { data: new Uint8Array(0), latency: Number(latency.toFixed(3)) };
      this._rxBufferMap.set(transportId, session);
    }

    const combined = new Uint8Array(session.data.length + data.length);
    combined.set(session.data);
    combined.set(data, session.data.length);
    session.data = combined;

    const raw = session.data;
    let isComplete = false;

    if (protocol === 'tcp') {
      if (raw.length >= 7) {
        const expectedPayloadLen = (raw[4] << 8) | raw[5];
        isComplete = raw.length >= 6 + expectedPayloadLen;
      }
    } else {
      const rtuAnalysis = this._analyzeModbusAdu(raw, false, 'rtu');
      isComplete = rtuAnalysis.crcValid;
    }

    if (error) isComplete = true;

    if (isComplete) {
      const analysis = this._analyzeModbusAdu(raw, false, protocol);
      const packet = this._createPacket(transportId, 'rx', raw, endTime);

      packet.analysis = analysis;
      packet.meta = {
        latencyMs: session.latency,
        transferMs: Number(transfer.toFixed(3)),
        totalMs: Number((session.latency + transfer).toFixed(3)),
        bytesPerSecond: Math.round(raw.length / ((transfer || 1) / 1000)),
        isFragment: false,
        error,
      };

      const requestPacket = this._pendingTx.get(transportId);
      if (requestPacket) {
        this._emitTransaction({
          id: this._generateId(),
          transportId,
          protocol,
          request: requestPacket,
          response: packet,
          status: error || analysis.isException ? 'error' : 'ok',
          error: error || (analysis.isException ? analysis.description : undefined),
          durationMs: Number((endTime - requestPacket.timestamp).toFixed(3)),
          timestamp: Date.now(),
        });
        this._pendingTx.delete(transportId);
      }

      this._notify(packet);
      this._rxBufferMap.delete(transportId);
      this._rxStartTime = 0;
    }
  }

  /**
   * Closes a pending request as a timeout if a new request is sent before the response arrives.
   * @private
   */
  private _checkAndEmitTimeout(transportId: string): void {
    const pending = this._pendingTx.get(transportId);
    if (pending) {
      this._emitTransaction({
        id: this._generateId(),
        transportId,
        protocol: pending.analysis?.protocol || 'rtu',
        request: pending,
        response: null,
        status: 'timeout',
        error: 'No response received before next request',
        durationMs: 0,
        timestamp: Date.now(),
      });
      this._pendingTx.delete(transportId);
    }
  }

  /**
   * Asynchronously notifies all transaction handlers.
   * @private
   */
  private _emitTransaction(tx: ITransaction): void {
    if (this._transactionHandlers.length === 0) return;
    Promise.resolve().then(() => {
      this._transactionHandlers.forEach(h => h(tx));
    });
  }

  /**
   * Internal analyzer for Modbus Application Data Units (ADU).
   * Automatically detects protocol type and extracts fields.
   * @param raw - Raw bytes to analyze.
   * @param isTx - Direction flag (true for Request, false for Response).
   * @returns An ISnifferAnalysis object containing parsed protocol details.
   * @private
   */
  private _analyzeModbusAdu(
    raw: Uint8Array,
    isTx: boolean,
    protocol: TModbusProtocolType
  ): ISnifferAnalysis {
    let offset = 0;
    const isTcp = protocol === 'tcp';

    if (isTcp) {
      offset = 6;
    }

    const slaveId = raw[offset] ?? 0;
    const funcCode = raw[offset + 1] ?? 0;
    const isException = (funcCode & 0x80) !== 0;
    const cleanFuncCode = isException ? funcCode & 0x7f : funcCode;

    let crcValid = true;
    if (!isTcp && raw.length >= 4) {
      const payload = raw.subarray(0, -2);
      const checkCrc = crc16Modbus(payload);
      crcValid = raw[raw.length - 2] === checkCrc[0] && raw[raw.length - 1] === checkCrc[1];
    }

    let description = isTcp ? '[TCP] ' : '[RTU] ';
    let data: any = null;

    if (isTx) {
      if (raw.length >= offset + 6) {
        const addr = (raw[offset + 2] << 8) | raw[offset + 3];
        const qty = (raw[offset + 4] << 8) | raw[offset + 5];
        description += `Request: Func 0x${cleanFuncCode.toString(16)}, Addr: ${addr}, Qty: ${qty}`;
        data = { address: addr, quantity: qty };
      }
    } else {
      if (isException) {
        data = raw[offset + 2];
        description += `Exception: Code ${data}`;
      } else if (raw.length >= offset + 3) {
        const byteCount = raw[offset + 2];

        switch (cleanFuncCode) {
          case 0x01:
          case 0x02:
            description += `Response: ${byteCount} bytes (bits)`;
            break;
          case 0x03:
          case 0x04:
            const regs = [];
            for (let i = 0; i < byteCount; i += 2) {
              const regIdx = offset + 3 + i;
              if (raw[regIdx] !== undefined) {
                regs.push((raw[regIdx] << 8) | (raw[regIdx + 1] || 0));
              }
            }
            data = regs;
            description += `Response: [${regs.join(', ')}]`;
            break;
          default:
            description += `Response: Success`;
        }
      }
    }

    return { protocol, slaveId, funcCode: cleanFuncCode, isException, crcValid, data, description };
  }

  /**
   * Factory method to create an ISnifferPacket with HEX and ASCII representations.
   * @param transportId - Transport identifier.
   * @param direction - 'tx' or 'rx'.
   * @param data - Raw packet bytes.
   * @param ts - Precise timestamp.
   * @returns A fully initialized ISnifferPacket.
   * @private
   */
  private _createPacket(
    transportId: string,
    direction: 'tx' | 'rx',
    data: Uint8Array,
    ts: number
  ): ISnifferPacket {
    const raw = new Uint8Array(data);
    const hex = Array.from(raw)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    const ascii = Array.from(raw)
      .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');

    return {
      id: this._generateId(),
      transportId,
      direction,
      raw,
      hex,
      ascii,
      timestamp: ts,
      meta: {},
    };
  }

  /**
   * Asynchronously notifies all registered handlers of a new packet.
   * Uses Promise.resolve().then() to avoid blocking the main transport execution thread.
   * @param packet - The packet to emit.
   * @private
   */
  private _notify(packet: ISnifferPacket): void {
    if (this._handlers.length === 0) return;
    Promise.resolve().then(() => {
      this._handlers.forEach(h => h(packet));
    });
  }

  /**
   * Generates a unique alphanumeric ID for packet tracking.
   * @returns A unique 9-character string.
   * @private
   */
  private _generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}
