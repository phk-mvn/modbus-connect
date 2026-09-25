// modbus/core/protocol.ts

import * as utils from '../utils/buffer.js';
import * as framer from '../protocol/framing.js';
import { IModbusProtocol } from '../types/internal.js';
import { ITransport } from '../types/public.js';

export type TProtocolLogger = {
  debug: (obj: Record<string, unknown>, msg?: string) => void;
};

/**
 * ModbusProtocol is a low-level class responsible for reliable Modbus ADU (Application Data Unit) exchange.
 * It handles framing (RTU or TCP), request transmission, response reception, and basic error recovery.
 * This class is used internally by ModbusClient and abstracts the differences between RTU and TCP protocols.
 */
export class ModbusProtocol implements IModbusProtocol {
  private minLen: number;

  /**
   * Creates a new ModbusProtocol instance.
   * @param _transport - Transport layer used for reading and writing raw bytes
   * @param _framerClass - Framer class (RtuFramer or TcpFramer) responsible for ADU construction and parsing
   */
  constructor(
    private _transport: ITransport,
    private _framerClass: typeof framer.RtuFramer | typeof framer.TcpFramer,
    private _echo: boolean = false,
    private _logger?: TProtocolLogger
  ) {
    // Minimum ADU length required before attempting to parse:
    // - RTU: at least 4 bytes (slaveId + functionCode + CRC)
    // - TCP: at least 7 bytes (MBAP header)
    this.minLen = this._framerClass === framer.TcpFramer ? 7 : 4;
  }

  /**
   * Replaces the logger (the client may swap its tslog instance on enable/disableLogger()).
   */
  public setLogger(logger?: TProtocolLogger): void {
    this._logger = logger;
  }

  /**
   * Performs a complete Modbus request-response exchange.
   *
   * Steps performed:
   * 1. Builds the ADU (Application Data Unit) from the given PDU using the selected framer
   * 2. Optionally flushes the transport buffer (for serial/RS485)
   * 3. Writes the request to the transport
   * 4. Reads the response in chunks until a valid ADU can be parsed
   * 5. Handles partial responses, CRC errors, and short frames gracefully
   * 6. Returns only the PDU portion of the received ADU
   *
   * @param unitId - Modbus slave/unit identifier (0-255)
   * @param pduRequest - Protocol Data Unit containing function code and data
   * @param timeout - Maximum time in milliseconds to wait for a complete response
   * @returns The parsed PDU from the device's response
   *
   * @throws ModbusCRCError if CRC check fails and enough data was received
   * @throws ModbusResponseError for malformed or incomplete responses
   * @throws Error with timeout message if the operation exceeds the timeout
   */
  public async exchange(
    unitId: number,
    pduRequest: Uint8Array,
    timeout: number
  ): Promise<Uint8Array> {
    const startTime = Date.now();
    const aduRequest = this._framerClass.buildAdu(unitId, pduRequest);

    const rawExpected = this._framerClass.getExpectedResponseLength(pduRequest);
    const exceptionLen = this._framerClass.exceptionResponseLength;
    let expectedLen = rawExpected && rawExpected > 0 ? rawExpected : this.minLen;

    if (this._transport.flush) await this._transport.flush();
    await this._transport.write(aduRequest);

    if (this._echo) {
      const echoLen = aduRequest.length;
      const elapsed = Date.now() - startTime;
      if (elapsed < timeout) {
        await this._transport.read(echoLen, timeout - elapsed);
      }
    }

    let buffer: Uint8Array = new Uint8Array(0);

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new Error(`Response timeout after ${elapsed}ms. Buffer: ${utils.toHex(buffer)}`);
      }

      let bytesToRead = 1;
      if (buffer.length < this.minLen) {
        bytesToRead = this.minLen - buffer.length;
      } else if (expectedLen > buffer.length) {
        bytesToRead = expectedLen - buffer.length;
      }

      const chunk = await this._transport.read(bytesToRead, timeout - elapsed);
      if (chunk && chunk.length > 0) {
        buffer = utils.concatUint8Arrays([buffer, chunk]);
      }

      // An exception response (FC with the 0x80 bit set) is always short. If we wait for the full length
      // of a successful response, we will get a timeout instead of a device error.
      if (buffer.length >= 2 && (buffer[1]! & 0x80) !== 0 && expectedLen > exceptionLen) {
        expectedLen = exceptionLen;
      }

      if (buffer.length >= this.minLen) {
        if (this.minLen === 7 && buffer.length >= 6) {
          const followingLen = (buffer[4] << 8) | buffer[5];
          expectedLen = 6 + followingLen;
        }

        try {
          const parsed = this._framerClass.parseAdu(buffer);

          // An exception response (FC with the 0x80 bit set) is always short. If we wait for the full length
          // of a successful response, we will get a timeout instead of a device error.
          if (parsed.unitId !== unitId) {
            this._logger?.debug(
              { expected: unitId, received: parsed.unitId },
              'Foreign frame ignored'
            );
            if (this.minLen === 7) {
              const frameLen = 6 + ((buffer[4]! << 8) | buffer[5]!);
              buffer = utils.sliceUint8Array(buffer, frameLen);
            } else {
              buffer = new Uint8Array(0);
            }
            continue;
          }

          return parsed.pdu;
        } catch (err: any) {
          const errMsg = err.message || String(err);

          if (errMsg.includes('short')) continue;

          if (errMsg.includes('Invalid Protocol ID')) {
            buffer = utils.sliceUint8Array(buffer, 1);
            continue;
          }

          if (errMsg.includes('CRC mismatch')) {
            if (this.minLen === 4) {
              // Garbage/echo before the actual frame: looking for the frame (CRC + unitId) inside the already
              // received bytes, without waiting for new ones — otherwise the exchange dies silently on timeout.
              const recovered = this._tryRecoverRtuFrame(buffer, unitId);
              if (recovered) return recovered;
              continue;
            }
          }
          throw err;
        }
      }
    }
  }

  /**
   * Searches for a valid RTU frame within the already received buffer (CRC + unitId).
   *
   * Functions with unpredictable response lengths (e.g., 0x2B) are read byte-by-byte,
   * and any noise at the start of the frame causes the entire buffer to result in a "CRC mismatch."
   * Previously, the loop would silently wait for new bytes until the timeout expired.
   * Here, the frame is located by iterating through all contiguous buffer fragments:
   * the risk of a false positive is limited by the CRC probability (~1/65536 per
   * fragment) and an additional unitId check.
   */
  private _tryRecoverRtuFrame(buffer: Uint8Array, unitId: number): Uint8Array | null {
    const len = buffer.length;
    for (let start = 0; start + 4 <= len; start++) {
      for (let end = start + 4; end <= len; end++) {
        try {
          const parsed = this._framerClass.parseAdu(utils.sliceUint8Array(buffer, start, end));
          if (parsed.unitId === unitId) return parsed.pdu;
        } catch {
          // fragment is invalid — trying the next one
        }
      }
    }
    return null;
  }

  /**
   * Returns the underlying transport instance used by this protocol.
   * Useful for advanced use cases or debugging.
   */
  public get transport(): ITransport {
    return this._transport;
  }

  /**
   * Returns the framer class (RtuFramer or TcpFramer) currently in use.
   * Can be used to inspect which framing protocol is active.
   */
  public get framerClass(): typeof framer.RtuFramer | typeof framer.TcpFramer {
    return this._framerClass;
  }
}
