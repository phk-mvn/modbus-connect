// client.js
const { Mutex } = require('async-mutex');

// Registers
const { buildReadHoldingRegistersRequest, parseReadHoldingRegistersResponse } = require('./function-codes/read-holding-registers.js');
const { buildReadInputRegistersRequest, parseReadInputRegistersResponse } = require('./function-codes/read-input-registers.js');
const { buildWriteSingleRegisterRequest, parseWriteSingleRegisterResponse } = require('./function-codes/write-single-register.js');
const { buildWriteMultipleRegistersRequest, parseWriteMultipleRegistersResponse } = require('./function-codes/write-multiple-registers.js');

// Bit operations
const { buildReadCoilsRequest, parseReadCoilsResponse } = require('./function-codes/read-coils.js');
const { buildReadDiscreteInputsRequest, parseReadDiscreteInputsResponse } = require('./function-codes/read-discrete-inputs.js');
const { buildWriteSingleCoilRequest, parseWriteSingleCoilResponse } = require('./function-codes/write-single-coil.js');
const { buildWriteMultipleCoilsRequest, parseWriteMultipleCoilsResponse } = require('./function-codes/write-multiple-coils.js');

// Special functions
const { buildReportSlaveIdRequest, parseReportSlaveIdResponse } = require('./function-codes/report-slave-id.js');
const { buildReadDeviceIdentificationRequest, parseReadDeviceIdentificationResponse } = require('./function-codes/read-device-identification.js');

// Special functions for SGM130
const { buildReadDeviceCommentRequest, parseReadDeviceCommentResponse } = require('./function-codes/SGM130/read-device-comment.js');
const { buildWriteDeviceCommentRequest, parseWriteDeviceCommentResponse } = require('./function-codes/SGM130/write-device-comment.js');
const { buildReadFileLengthRequest, parseReadFileLengthResponse } = require('./function-codes/SGM130/read-file-length.js');
const { buildOpenFileRequest, parseOpenFileResponse } = require('./function-codes/SGM130/openFile.js');
const { buildCloseFileRequest, parseCloseFileResponse } = require('./function-codes/SGM130/closeFile.js');
const { buildRestartControllerRequest, parseRestartControllerResponse } = require('./function-codes/SGM130/restart-controller.js');
const { buildGetControllerTimeRequest, parseGetControllerTimeResponse } = require('./function-codes/SGM130/get-controller-time.js');
const { buildSetControllerTimeRequest, parseSetControllerTimeResponse } = require('./function-codes/SGM130/set-controller-time.js');

const {
  ModbusError,
  ModbusTimeoutError,
  ModbusCRCError,
  ModbusResponseError,
  ModbusTooManyEmptyReadsError,
  ModbusExceptionError,
  ModbusFlushError
} = require('./errors.js');

const { buildPacket, parsePacket } = require('./packet-builder.js');
const { concatUint8Arrays, allocUint8Array, toHex } = require('./utils/utils.js');
const logger = require('./logger.js');
const { Diagnostics } = require('./utils/diagnostics.js');

const crcFns = require('./utils/crc.js');

const crcAlgorithmMap = {
  crc16Modbus: crcFns.crc16Modbus,
  crc16CcittFalse: crcFns.crc16CcittFalse,
  crc32: crcFns.crc32,
  crc8: crcFns.crc8,
  crc1: crcFns.crc1,
  crc8_1wire: crcFns.crc8_1wire,
  crc8_dvbs2: crcFns.crc8_dvbs2,
  crc16_kermit: crcFns.crc16_kermit,
  crc16_xmodem: crcFns.crc16_xmodem,
  crc24: crcFns.crc24,
  crc32mpeg: crcFns.crc32mpeg,
  crcjam: crcFns.crcjam
};

class ModbusClient {
  constructor(transport, slaveId = 1, options = {}) {
    this.transport = transport;
    this.slaveId = slaveId;
    this.defaultTimeout = options.timeout || 2000;
    this.retryCount = options.retryCount || 0;
    this.retryDelay = options.retryDelay || 100;
    this.echoEnabled = options.echoEnabled || false;

    this.diagnostics = new Diagnostics();

    this.crcFunc = crcAlgorithmMap[options.crcAlgorithm || 'crc16Modbus'];
    if (!this.crcFunc) throw new Error(`Unknown CRC algorithm: ${options.crcAlgorithm}`);

    this._mutex = new Mutex(); // Добавляем мьютекс для синхронизации подключения
  }

  /**
   * Establishes a connection to the Modbus transport.
   * Logs the connection status upon successful connection.
   */
  async connect() {
    const release = await this._mutex.acquire();
    try {
      await this.transport.connect();
      logger.info('Transport connected', { transport: this.transport.constructor.name });
    } finally {
      release();
    }
  }

  /**
   * Closes the connection to the Modbus transport.
   * Logs the disconnection status upon successful disconnection.
   */
  async disconnect() {
    const release = await this._mutex.acquire();
    try {
      await this.transport.disconnect();
      logger.info('Transport disconnected', { transport: this.transport.constructor.name });
    } finally {
      release();
    }
  }

  setSlaveId(slaveId){
    if(typeof slaveId !== 'number' || slaveId < 0 || slaveId > 247){
      throw new Error('Invalid slave ID. Must be a number between 0 and 247');
    }
    this.slaveId = slaveId;
  }

  /**
   * Converts a buffer to a hex string.
   * @param {Uint8Array} buffer - The buffer to convert.
   * @returns {string} The hex string representation of the buffer.
   */
  _toHex(buffer) {
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(' ');
  }

  /**
   * Calculates the expected response length based on the PDU.
   * @param {Uint8Array} pdu - The PDU to calculate the expected response length for.
   * @returns {number|null} The expected response length, or null if the PDU is invalid.
   */
  _getExpectedResponseLength(pdu) {
    if (!pdu || pdu.length === 0) return null;
    
    const funcCode = pdu[0];
    
    switch(funcCode) {
      // Standard Modbus functions
      case 0x01: // Read Coils
      case 0x02: // Read Discrete Inputs
          if (pdu.length < 5) return null;
          const bitCount = (pdu[3] << 8) | pdu[4];
          return 5 + Math.ceil(bitCount / 8); // slave(1) + func(1) + byteCount(1) + data(N) + CRC(2)
          
      case 0x03: // Read Holding Registers
      case 0x04: // Read Input Registers
          if (pdu.length < 5) return null;
          const regCount = (pdu[3] << 8) | pdu[4];
          return 5 + regCount * 2; // slave(1) + func(1) + byteCount(1) + data(N*2) + CRC(2)
          
      case 0x05: // Write Single Coil
      case 0x06: // Write Single Register
          return 8; // slave(1) + func(1) + address(2) + value(2) + CRC(2)
          
      case 0x0F: // Write Multiple Coils
      case 0x10: // Write Multiple Registers
          return 8; // slave(1) + func(1) + address(2) + quantity(2) + CRC(2)
          
      case 0x08: // Diagnostics
          return 8; // slave(1) + func(1) + subFunc(2) + data(2) + CRC(2)
          
      // Special functions for SGM130
      case 0x14: // Read Device Comment
          return null;
          
      case 0x15: // Write Device Comment
          return 5; // slave(1) + func(1) + channel(1) + length(1) + CRC(2)
          
      case 0x2B: // Read Device Identification
          if (pdu.length < 4) return null;
          
          // Базовый заголовок ответа
          let baseLength = 9; // slave(1) + func(1) + interface(1) + category(1) + 
                              // respCategory(1) + contFlag(1) + nextStr(1) + strCount(1) + CRC(2)
          
          // Для ошибки
          if (pdu[2] === 0x00) return 6; // slave(1) + func(1) + interface(1) + error(1) + CRC(2)
          
          // Для индивидуального запроса (категория 0x04)
          if (pdu[2] === 0x04) {
              return null; // Длина строки неизвестна заранее
          }
          
          // Для основных/вспомогательных категорий
          return null; // Количество строк и их длины неизвестны заранее
          
      case 0x52: // Read File Length
          return 8; // slave(1) + func(1) + length(4) + CRC(2)
          
      case 0x55: // Open File
          return 8; // slave(1) + func(1) + length(4) + CRC(2)
          
      case 0x57: // Close File
          return 5; // slave(1) + func(1) + status(1) + CRC(2)

      case 0x5C: // Restart Controller
          return 0; // Ответа не ожидается
          
      case 0x6E: // Get Controller Time
          return 10; // slave(1) + func(1) + time(6) + CRC(2)
          
      case 0x6F: // Set Controller Time
          return 8; // slave(1) + func(1) + status(2) + CRC(2)
          
      // Обработка ошибок
      default:
          if (funcCode & 0x80) { // Error response
              return 5; // slave(1) + func(1) + errorCode(1) + CRC(2)
          }
          return null;
    }
  }

  /**
   * Reads a packet from the Modbus transport.
   * @param {number} timeout - The timeout in milliseconds.
   * @param {Uint8Array|null} requestPdu - The PDU of the request packet.
   * @returns {Promise<Uint8Array>} The received packet.
   * @throws {ModbusTimeoutError} If the read operation times out.
   */
  async _readPacket(timeout, requestPdu = null) {
    const start = Date.now();
    let buffer = new Uint8Array(0);
    let expectedLength = requestPdu ? this._getExpectedResponseLength(requestPdu) : null;
    
    while (true) {
      const timeLeft = timeout - (Date.now() - start);
      if (timeLeft <= 0) throw new ModbusTimeoutError('Read timeout');
      
      const minPacketLength = 5;
      const bytesToRead = expectedLength 
        ? Math.max(1, expectedLength - buffer.length)
        : Math.max(1, minPacketLength - buffer.length);
        
      const chunk = await this.transport.read(bytesToRead, timeLeft);
      if (!chunk || chunk.length === 0) continue;
      
      buffer = concatUint8Arrays([buffer, chunk]);
      logger.debug('Received chunk:', { bytes: chunk.length, total: buffer.length });
      
      // Проверяем, достаточно ли данных для минимального пакета
      if (buffer.length >= minPacketLength) {
        try {
          // Пробуем распарсить пакет
          parsePacket(buffer, this.crcFunc);
          // Если не было исключения - пакет корректный
          return buffer;
        } catch (err) {
          if (err.message.startsWith('Invalid packet: too short')) {
            // Продолжаем чтение
            continue;
          }
          if (err.message.startsWith('CRC mismatch')) {
            // Продолжаем чтение, возможно пакет ещё не полный
            continue;
          }
          // Другая ошибка - пробрасываем её
          throw err;
        }
      }
    }
  }

  /**
   * Sends a request to the Modbus transport.
   * @param {Uint8Array} pdu - The PDU of the request packet.
   * @param {number} timeout - The timeout in milliseconds.
   * @param {boolean} ignoreNoResponse - Whether to ignore no response.
   * @returns {Promise<Uint8Array>} The received packet.
   * @throws {ModbusTimeoutError} If the send operation times out.
   */
  async _sendRequest(pdu, timeout = this.defaultTimeout, ignoreNoResponse = false) {
    const release = await this._mutex.acquire();
    try {
      const funcCode = pdu[0];
      const slaveId = this.slaveId;
      this.diagnostics.recordRequest(slaveId, funcCode);
      this.diagnostics.recordFunctionCall(funcCode, slaveId);
  
      let lastError;
      const startTime = Date.now();
  
      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        try {
          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);
          if (timeLeft <= 0) throw new ModbusTimeoutError('Timeout before request');
  
          logger.debug(`Attempt #${attempt + 1} — sending request`, {
            slaveId,
            funcCode
          });
  
          const packet = buildPacket(slaveId, pdu, this.crcFunc);
          this.diagnostics.recordDataSent(packet.length, slaveId, funcCode);
  
          await this.transport.write(packet);
          logger.debug('Packet written to transport', { bytes: packet.length, slaveId, funcCode });
  
          if (this.echoEnabled) {
            logger.debug('Echo enabled, reading echo back...', { slaveId, funcCode });
            const echoResponse = await this.transport.read(packet.length, timeLeft);
            if (!echoResponse || echoResponse.length !== packet.length) {
              throw new Error(`Echo length mismatch (expected ${packet.length}, got ${echoResponse ? echoResponse.length : 0})`);
            }
            for (let i = 0; i < packet.length; i++) {
              if (packet[i] !== echoResponse[i]) {
                throw new Error('Echo mismatch detected');
              }
            }
            logger.debug('Echo verified successfully', { slaveId, funcCode });
          }
  
          if (ignoreNoResponse) {
            const elapsed = Date.now() - startTime;
            this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
            logger.info('Request sent, no response expected', { slaveId, funcCode, responseTime: elapsed });
            return;
          }
  
          const response = await this._readPacket(timeLeft, pdu);
          this.diagnostics.recordDataReceived(response.length, slaveId, funcCode);
  
          const elapsed = Date.now() - startTime;
          const { slaveAddress, pdu: responsePdu } = parsePacket(response, this.crcFunc);
  
          if (slaveAddress !== slaveId) {
            throw new Error(`Slave address mismatch (expected ${slaveId}, got ${slaveAddress})`);
          }
  
          const responseFuncCode = responsePdu[0];
          if ((responseFuncCode & 0x80) !== 0) {
            const exceptionCode = responsePdu[1];
            throw new ModbusExceptionError(responseFuncCode & 0x7F, exceptionCode);
          }
  
          this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
          logger.info('Response received', {
            slaveAddress,
            funcCode,
            responseTime: elapsed,
            hex: this._toHex(responsePdu),
            slaveId
          });
  
          return responsePdu;
  
        } catch (err) {
          const elapsed = Date.now() - startTime;
          const isFlushedError = err instanceof ModbusFlushError;
          const errorCode = err.message.toLowerCase().includes('timeout') ? 'timeout' :
                            err.message.toLowerCase().includes('crc') ? 'crc' :
                            err instanceof ModbusExceptionError ? 'modbus-exception' : null;
  
          this.diagnostics.recordError(err, {
            code: errorCode,
            responseTimeMs: elapsed,
            slaveId,
            funcCode,
            exceptionCode: err instanceof ModbusExceptionError ? err.exceptionCode : null
          });
  
          logger.warn(`Attempt #${attempt + 1} failed: ${err.message}`, {
            responseTime: elapsed,
            error: err,
            requestHex: this._toHex(pdu),
            slaveId,
            funcCode,
            exceptionCode: err instanceof ModbusExceptionError ? err.exceptionCode : null
          });
  
          lastError = err;
  
          if (isFlushedError) {
            logger.info(`Attempt #${attempt + 1} failed due to flush, will retry`, { slaveId, funcCode });
          }
  
          if (ignoreNoResponse && err.message.toLowerCase().includes('timeout') || isFlushedError) {
            logger.info('Operation ignored due to ignoreNoResponse=true and timeout/flush', {
              slaveId,
              funcCode,
              responseTime: elapsed
            });
            this.diagnostics.recordSuccess(elapsed, slaveId, funcCode);
            return;
          }
  
          if (attempt < this.retryCount) {
            this.diagnostics.recordRetry(1, slaveId, funcCode);
            let delay = this.retryDelay;
            if (isFlushedError) {
              delay = Math.min(50, delay);
              logger.debug(`Retrying after short delay ${delay}ms due to flush`, { slaveId, funcCode });
            } else {
              logger.debug(`Retrying after delay ${delay}ms`, { slaveId, funcCode });
            }
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            logger.error(`All ${this.retryCount + 1} attempts exhausted`, {
              error: lastError,
              slaveId,
              funcCode,
              responseTime: elapsed
            });
            throw lastError;
          }
        }
      }
    } finally {
      release();
    }
  }

  /**
   * Converts Modbus registers to a buffer.
   * @param {number[]} registers - The registers to convert.
   * @param {string} [type='uint16'] - The type of the registers.
   * @returns {ArrayBuffer} The buffer containing the converted registers.
   */
  _convertRegisters(registers, type = 'uint16') {
    const buffer = new ArrayBuffer(registers.length * 2);
    const view = new DataView(buffer);
  
    // Big endian запись (Modbus по умолчанию)
    registers.forEach((reg, i) => {
      view.setUint16(i * 2, reg, false);
    });
  
    const read32 = (method, littleEndian = false) => {
      const result = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        result.push(view[method](i * 2, littleEndian));
      }
      return result;
    };
  
    const read64 = (method, littleEndian = false) => {
      const result = [];
      for (let i = 0; i < registers.length - 3; i += 4) {
        const tempBuf = new ArrayBuffer(8);
        const tempView = new DataView(tempBuf);
        for (let j = 0; j < 8; j++) {
          tempView.setUint8(j, view.getUint8(i * 2 + j));
        }
  
        switch (method) {
          case 'uint64': {
            const high = BigInt(tempView.getUint32(0, littleEndian));
            const low = BigInt(tempView.getUint32(4, littleEndian));
            result.push((high << 32n) | low);
            break;
          }
          case 'int64': {
            const high = BigInt(tempView.getUint32(0, littleEndian));
            const low = BigInt(tempView.getUint32(4, littleEndian));
            let value = (high << 32n) | low;
            if (value & (1n << 63n)) value -= 1n << 64n;
            result.push(value);
            break;
          }
          case 'double': {
            result.push(tempView.getFloat64(0, littleEndian));
            break;
          }
        }
      }
      return result;
    };
  
    const getSwapped32 = (i, mode) => {
      const a = view.getUint8(i * 2);
      const b = view.getUint8(i * 2 + 1);
      const c = view.getUint8(i * 2 + 2);
      const d = view.getUint8(i * 2 + 3);
      let bytes;
  
      switch (mode) {
        case 'sw':  bytes = [c, d, a, b]; break;
        case 'sb':  bytes = [b, a, d, c]; break;
        case 'sbw': bytes = [d, c, b, a]; break;
        case 'le':  bytes = [d, c, b, a]; break; // LE = full byte reverse
        case 'le_sw':  bytes = [b, a, d, c]; break;
        case 'le_sb':  bytes = [a, b, c, d]; break;
        case 'le_sbw': bytes = [c, d, a, b]; break;
        default:   bytes = [a, b, c, d]; break;
      }
  
      const tempBuf = new ArrayBuffer(4);
      const tempView = new DataView(tempBuf);
      bytes.forEach((byte, idx) => tempView.setUint8(idx, byte));
      return tempView;
    };
  
    const read32Swapped = (method, mode) => {
      const result = [];
      for (let i = 0; i < registers.length - 1; i += 2) {
        const tempView = getSwapped32(i, mode);
        result.push(tempView[method](0, false));
      }
      return result;
    };
  
    switch (type.toLowerCase()) {
      // 16-бит
      case 'uint16': return registers;
      case 'int16': return registers.map((_, i) => view.getInt16(i * 2, false));
  
      // 32-бит
      case 'uint32': return read32('getUint32');
      case 'int32': return read32('getInt32');
      case 'float': return read32('getFloat32');
  
      // 32-бит LE
      case 'uint32_le': return read32('getUint32', true);
      case 'int32_le': return read32('getInt32', true);
      case 'float_le': return read32('getFloat32', true);
  
      // 32-бит со свопами
      case 'uint32_sw': return read32Swapped('getUint32', 'sw');
      case 'int32_sw': return read32Swapped('getInt32', 'sw');
      case 'float_sw': return read32Swapped('getFloat32', 'sw');
  
      case 'uint32_sb': return read32Swapped('getUint32', 'sb');
      case 'int32_sb': return read32Swapped('getInt32', 'sb');
      case 'float_sb': return read32Swapped('getFloat32', 'sb');
  
      case 'uint32_sbw': return read32Swapped('getUint32', 'sbw');
      case 'int32_sbw': return read32Swapped('getInt32', 'sbw');
      case 'float_sbw': return read32Swapped('getFloat32', 'sbw');
  
      // 32-бит little-endian через полные свопы
      case 'uint32_le_sw': return read32Swapped('getUint32', 'le_sw');
      case 'int32_le_sw': return read32Swapped('getInt32', 'le_sw');
      case 'float_le_sw': return read32Swapped('getFloat32', 'le_sw');
  
      case 'uint32_le_sb': return read32Swapped('getUint32', 'le_sb');
      case 'int32_le_sb': return read32Swapped('getInt32', 'le_sb');
      case 'float_le_sb': return read32Swapped('getFloat32', 'le_sb');
  
      case 'uint32_le_sbw': return read32Swapped('getUint32', 'le_sbw');
      case 'int32_le_sbw': return read32Swapped('getInt32', 'le_sbw');
      case 'float_le_sbw': return read32Swapped('getFloat32', 'le_sbw');
  
      // 64-бит
      case 'uint64': return read64('uint64');
      case 'int64': return read64('int64');
      case 'double': return read64('double');
  
      // 64-бит LE
      case 'uint64_le': return read64('uint64', true);
      case 'int64_le': return read64('int64', true);
      case 'double_le': return read64('double', true);
  
      // Разное
      case 'hex':
        return registers.map(r => r.toString(16).toUpperCase().padStart(4, '0'));
  
      case 'string': {
        let str = '';
        for (let i = 0; i < registers.length; i++) {
          const high = (registers[i] >> 8) & 0xFF;
          const low = registers[i] & 0xFF;
          if (high !== 0) str += String.fromCharCode(high);
          if (low !== 0) str += String.fromCharCode(low);
        }
        return str;
      }
  
      case 'bool':
        return registers.map(r => r !== 0);
  
      case 'binary':
        return registers.map(r =>
          r.toString(2).padStart(16, '0').split('').map(b => b === '1')
        );
  
      case 'bcd':
        return registers.map(r => {
          const high = ((r >> 8) & 0xFF);
          const low = (r & 0xFF);
          return (
            ((high >> 4) * 10 + (high & 0x0F)) * 100 +
            (low >> 4) * 10 + (low & 0x0F)
          );
        });
  
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
  }

  // --- Public method's Modbus ---

  /**
   * Reads holding registers from the Modbus device.
   * @param {number} startAddress - The starting address of the registers to read.
   * @param {number} quantity - The number of registers to read.
   * @param {Object} [options] - The options for the read operation.
   * @param {string} [options.type='uint16'] - The type of the registers.
   * @returns {ArrayBuffer} The buffer containing the read registers.
   */
  async readHoldingRegisters(startAddress, quantity, options = {}) {
    const pdu = buildReadHoldingRegistersRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu);
    const registers = parseReadHoldingRegistersResponse(responsePdu);
  
    const type = options.type || 'uint16';
    return this._convertRegisters(registers, type);
  }

  /**
   * Reads input registers from the Modbus device.
   * @param {number} startAddress - The starting address of the registers to read.
   * @param {number} quantity - The number of registers to read.
   * @param {Object} [options] - The options for the read operation.
   * @param {string} [options.type='uint16'] - The type of the registers.
   * @returns {ArrayBuffer} The buffer containing the read registers.
   */
  async readInputRegisters(startAddress, quantity, options = {}) {
    const responsePdu = await this._sendRequest(buildReadInputRegistersRequest(startAddress, quantity));
    const registers = parseReadInputRegistersResponse(responsePdu);

    const type = options.type || 'uint16';
    return this._convertRegisters(registers, type);
  }

  /**
   * Writes a single register to the Modbus device.
   * @param {number} address - The address of the register to write.
   * @param {number} value - The value to write to the register.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async writeSingleRegister(address, value, timeout) {
    const pdu = buildWriteSingleRegisterRequest(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseWriteSingleRegisterResponse(responsePdu);
  }

  /**
   * Writes multiple registers to the Modbus device.
   * @param {number} startAddress - The starting address of the registers to write.
   * @param {number[]} values - The values to write to the registers.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async writeMultipleRegisters(startAddress, values, timeout) {
    const pdu = buildWriteMultipleRegistersRequest(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseWriteMultipleRegistersResponse(responsePdu);
  }

  /**
   * Reads coils from the Modbus device.
   * @param {number} startAddress - The starting address of the coils to read.
   * @param {number} quantity - The number of coils to read.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async readCoils(startAddress, quantity, timeout) {
    const pdu = buildReadCoilsRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseReadCoilsResponse(responsePdu);
  }

  /**
   * Reads discrete inputs from the Modbus device.
   * @param {number} startAddress - The starting address of the discrete inputs to read.
   * @param {number} quantity - The number of discrete inputs to read.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async readDiscreteInputs(startAddress, quantity, timeout) {
    const pdu = buildReadDiscreteInputsRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseReadDiscreteInputsResponse(responsePdu);
  }

  /**
   * Writes a single coil to the Modbus device.
   * @param {number} address - The address of the coil to write.
   * @param {number} value - The value to write to the coil.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async writeSingleCoil(address, value, timeout) {
    const pdu = buildWriteSingleCoilRequest(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseWriteSingleCoilResponse(responsePdu);
  }

  /**
   * Writes multiple coils to the Modbus device.
   * @param {number} startAddress - The starting address of the coils to write.
   * @param {number[]} values - The values to write to the coils.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async writeMultipleCoils(startAddress, values, timeout) {
    const pdu = buildWriteMultipleCoilsRequest(startAddress, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseWriteMultipleCoilsResponse(responsePdu);
  }

  /**
   * Reports the slave ID of the Modbus device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async reportSlaveId(timeout) {
    const pdu = buildReportSlaveIdRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseReportSlaveIdResponse(responsePdu);
  }

  /**
   * Reads the device identification from the Modbus device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async readDeviceIdentification(timeout) {
    // Сохраняем текущий slaveId
    const originalSlaveId = this.slaveId;

    try {
      const pdu = buildReadDeviceIdentificationRequest();
      const responsePdu = await this._sendRequest(pdu, timeout);
      return parseReadDeviceIdentificationResponse(responsePdu);
    } finally {
      this.slaveId = originalSlaveId;
    }
  }

  /**
   * Reads the device comment from the Modbus device.
   * @param {number} channel - The channel to read the comment from.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async readDeviceComment(channel, timeout) {
    const pdu = buildReadDeviceCommentRequest(channel);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseReadDeviceCommentResponse(responsePdu);
  }

  /**
   * Writes the device comment to the Modbus device.
   * @param {string} comment - The comment to write to the device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async writeDeviceComment(comment, timeout) {
    const pdu = buildWriteDeviceCommentRequest(comment);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseWriteDeviceCommentResponse(responsePdu);
  }

  /**
   * Reads the file length from the Modbus device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async readFileLength(timeout) {
    const pdu = buildReadFileLengthRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseReadFileLengthResponse(responsePdu);
  }

  /**
   * Opens a file on the Modbus device.
   * @param {string} filename - The name of the file to open.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async openFile(filename, timeout) {
    const pdu = buildOpenFileRequest(filename);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseOpenFileResponse(responsePdu);
  }

  /**
   * Closes a file on the Modbus device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async closeFile(timeout) {
    const pdu = buildCloseFileRequest();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    
    // Если responsePdu === undefined (устройство не ответило), возвращаем успех
    if (responsePdu === undefined) {
        // Ждем немного и очищаем буфер
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.transport.flush) {
            await this.transport.flush();
        }
        return true;
    }
    
    const result = parseCloseFileResponse(responsePdu);
    
    // Ждем немного и очищаем буфер
    await new Promise(resolve => setTimeout(resolve, 100));
    if (this.transport.flush) {
        await this.transport.flush();
    }
    
    return result;
  }

  /**
   * Restarts the controller on the Modbus device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async restartController(timeout) {
    const pdu = buildRestartControllerRequest();
    const responsePdu = await this._sendRequest(pdu, timeout, true);
    return parseRestartControllerResponse(responsePdu);
  }

  /**
   * Gets the controller time from the Modbus device.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async getControllerTime(timeout) {
    const pdu = buildGetControllerTimeRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseGetControllerTimeResponse(responsePdu);
  }

  /**
   * Sets the controller time on the Modbus device.
   * @param {Date} datetime - The datetime to set on the controller.
   * @param {number} timeout - The timeout in milliseconds.
   * @returns {Object} The response from the Modbus device.
   */
  async setControllerTime(datetime, timeout) {
    const pdu = buildSetControllerTimeRequest(datetime);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return parseSetControllerTimeResponse(responsePdu);
  }
}

module.exports = ModbusClient;