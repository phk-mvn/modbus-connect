// modbus/core/client.ts

import { Mutex } from 'async-mutex';
import { pino, Logger } from 'pino';
import * as framer from '../protocol/framing.js';
import * as functions from '../protocol/functions.js';
import { ModbusProtocol } from './protocol.js';
import { ModbusExceptionCode, ModbusFunctionCode } from '../constants/modbus.js';
import {
  EConnectionErrorType,
  ICustomFunctionHandler,
  IModbusClient,
  IModbusClientOptions,
  IModbusPlugin,
  ITransport,
  ITransportController,
  TRSMode,
} from '../types/public.js';
import {
  ModbusCRCError,
  ModbusExceptionError,
  ModbusFlushError,
  ModbusIllegalDataValueError,
  ModbusInvalidAddressError,
  ModbusInvalidQuantityError,
  ModbusNotConnectedError,
  ModbusTimeoutError,
} from '../core/errors.js';

/**
 * ModbusClient is the main high-level interface for communicating with Modbus devices.
 * It supports both RTU and TCP framing, provides built-in retry logic, timeout handling,
 * plugin system, and comprehensive error management.
 * All public methods are thread-safe thanks to an internal mutex.
 */
class ModbusClient implements IModbusClient {
  private transportController: ITransportController;
  private slaveId: number;
  private options: IModbusClientOptions;
  private RSMode: TRSMode;
  private defaultTimeout: number;
  private retryCount: number;
  private retryDelay: number;
  private _mutex: Mutex;
  private _framing: typeof framer.RtuFramer | typeof framer.TcpFramer;
  private _protocol?: ModbusProtocol;

  private _plugins: IModbusPlugin[] = [];
  private _customFunctions: Map<string, ICustomFunctionHandler> = new Map();

  private logger: Logger;

  private static readonly FUNCTION_CODE_MAP = new Map<number, ModbusFunctionCode>([
    [0x01, ModbusFunctionCode.READ_COILS],
    [0x02, ModbusFunctionCode.READ_DISCRETE_INPUTS],
    [0x03, ModbusFunctionCode.READ_HOLDING_REGISTERS],
    [0x04, ModbusFunctionCode.READ_INPUT_REGISTERS],
    [0x05, ModbusFunctionCode.WRITE_SINGLE_COIL],
    [0x06, ModbusFunctionCode.WRITE_SINGLE_REGISTER],
    [0x0f, ModbusFunctionCode.WRITE_MULTIPLE_COILS],
    [0x10, ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS],
    [0x11, ModbusFunctionCode.REPORT_SLAVE_ID],
    [0x2b, ModbusFunctionCode.READ_DEVICE_IDENTIFICATION],
  ]);

  private static readonly EXCEPTION_CODE_MAP = new Map<number, ModbusExceptionCode>([
    [1, ModbusExceptionCode.ILLEGAL_FUNCTION],
    [2, ModbusExceptionCode.ILLEGAL_DATA_ADDRESS],
    [3, ModbusExceptionCode.ILLEGAL_DATA_VALUE],
    [4, ModbusExceptionCode.SLAVE_DEVICE_FAILURE],
    [5, ModbusExceptionCode.ACKNOWLEDGE],
    [6, ModbusExceptionCode.SLAVE_DEVICE_BUSY],
    [8, ModbusExceptionCode.MEMORY_PARITY_ERROR],
    [10, ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE],
    [11, ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED],
  ]);

  /**
   * Creates a new ModbusClient instance.
   * @param transportController - Transport controller that manages physical connections
   * @param slaveId - Modbus slave address (1-255)
   * @param options - Configuration options for timeout, retries, framing, plugins, etc.
   * @throws ModbusInvalidAddressError if slaveId is invalid
   */
  constructor(
    transportController: ITransportController,
    slaveId: number = 1,
    options: IModbusClientOptions = {}
  ) {
    if (!Number.isInteger(slaveId) || slaveId < 0 || slaveId > 255) {
      throw new ModbusInvalidAddressError(slaveId);
    }

    this.logger = pino({
      level: 'info',
      base: { component: 'ModbusClient', slaveId: slaveId },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component,slaveId,funcCode,ms',
                messageFormat: '[{component}][ID:{slaveId}] {msg} {ms}ms',
              },
            }
          : undefined,
    });

    this.logger.debug('Modbus Client initialized');

    this.transportController = transportController;
    this.slaveId = slaveId;
    this.options = options;
    this.defaultTimeout = options.timeout ?? 1000;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 100;
    this._mutex = new Mutex();

    this._framing = options.framing === 'tcp' ? framer.TcpFramer : framer.RtuFramer;
    this.RSMode = options.RSMode || (options.framing === 'tcp' ? 'TCP/IP' : 'RS485');

    const transport = this._effectiveTransport;
    if (transport) {
      this._protocol = new ModbusProtocol(transport, this._framing);
    }

    if (options.plugins && Array.isArray(options.plugins)) {
      for (const PluginClass of options.plugins) {
        this.use(new PluginClass());
      }
    }
  }

  /**
   * Returns the currently active transport for this slave and RS mode.
   * Used internally by all communication methods.
   */
  private get _effectiveTransport(): ITransport | null {
    return this.transportController.getTransportForSlave(this.slaveId, this.RSMode);
  }

  /**
   * Disables all logging output.
   * Re-initializes the pino instance with the 'silent' level to stop any log emission.
   */
  public disableLogger(): void {
    this.logger = pino({
      level: 'silent',
    });
  }

  /**
   * Enables and configures the logger.
   *
   * Sets the default log level to 'info' and attaches metadata (component name and slave ID).
   * If the environment is not 'production', it enables `pino-pretty` transport
   * with custom message formatting for better developer experience.
   */
  public enableLogger(): void {
    this.logger = pino({
      level: 'info',
      base: { component: 'ModbusClient', slaveId: this.slaveId },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname,component,slaveId,funcCode,ms',
                messageFormat: '[{component}][ID:{slaveId}] {msg} {ms}ms',
              },
            }
          : undefined,
    });
  }

  /**
   * Registers a plugin with the Modbus client.
   * Plugins can extend functionality by adding custom function codes and handlers.
   * Duplicate plugins (by name) are skipped.
   * @param plugin - Plugin instance to register
   * @throws Error if plugin is invalid (missing name)
   */
  public use(plugin: IModbusPlugin): void {
    if (!plugin || typeof plugin.name !== 'string')
      throw new Error('Invalid plugin provided. A plugin must be an object with a "name" property');

    if (this._plugins.some(p => p.name === plugin.name)) {
      this.logger.warn(`Plugin with name "${plugin.name}" is already registered. Skipping...`);
      return;
    }

    this._plugins.push(plugin);

    if (plugin.customFunctionCodes) {
      for (const funcName in plugin.customFunctionCodes) {
        if (this._customFunctions.has(funcName)) {
          this.logger.warn(
            `Custom function "${funcName}" from plugin "${plugin.name}" overrides an existing function`
          );
        }
        const handler = plugin.customFunctionCodes[funcName];
        if (handler) this._customFunctions.set(funcName, handler);
      }
    }

    this.logger.info(`Plugin "${plugin.name}" registered successfully`);
  }

  /**
   * Executes a custom function registered by a plugin
   * @param functionName - The name of the custom function to execute
   * @param args - Arguments to pass to the custom function
   * @returns The result of the custom function
   */
  public async executeCustomFunction(functionName: string, ...args: any[]): Promise<any> {
    const handler = this._customFunctions.get(functionName);
    if (!handler)
      throw new Error(
        `Custom function "${functionName}" is not registered. Have you registered the plugin using client.use()?`
      );

    const requestPdu = handler.buildRequest(...args);
    const responsePdu = await this._sendRequest(requestPdu);
    if (!responsePdu) return handler.parseResponse(new Uint8Array(0));

    return handler.parseResponse(responsePdu);
  }

  /**
   * Performs a logical connection check.
   * Verifies that a transport exists for the current slave and that it is open.
   * Does **not** establish a physical connection — that is managed by TransportController.
   * @throws ModbusNotConnectedError if transport is not available or not open
   */
  public async connect(): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const transport = this._effectiveTransport;

      if (!transport || !transport.isOpen) {
        throw new ModbusNotConnectedError();
      }

      this.logger.info(
        {
          slaveId: this.slaveId,
          transport: transport.constructor.name,
        },
        'Client is ready. Transport is connected and available'
      );
    });
  }

  /**
   * Performs a logical disconnection.
   * This is a no-op for the physical transport layer.
   * Physical connection management should be handled exclusively by the TransportController.
   * Mainly used for logging and consistency with connect().
   */
  public async disconnect(): Promise<void> {
    await this._mutex.runExclusive(async () => {
      const transport = this._effectiveTransport;

      const transportInfo = this.transportController
        .listTransports()
        .find(t => t.transport === transport);

      if (transportInfo) {
        await this.transportController.removeSlaveIdFromTransport(transportInfo.id, this.slaveId);
      }

      this.logger.info('Client disconnected and unregistered from transport');
    });
  }

  /**
   * Returns the current slave ID used by this client instance
   * Useful when slave ID can change dynamically
   * @returns The current slave ID (1-255)
   */
  public get currentSlaveId(): number {
    return this.slaveId;
  }

  /**
   * Dynamically changes the slave ID of this client intsance without recreating the client
   * After calling this method, all subsequent requests will use the new slave ID
   * @param newSlaveId - New slave ID (must be integer between 1 and 255)
   * @throws ModbusInvalidAddressError if newSlaveId is invalid
   */
  public async setSlaveId(newSlaveId: number): Promise<void> {
    if (!Number.isInteger(newSlaveId) || newSlaveId < 1 || newSlaveId > 255)
      throw new ModbusInvalidAddressError(newSlaveId);

    const old = this.slaveId;
    this.slaveId = newSlaveId;
    this.logger.info(
      {
        transport: this._effectiveTransport?.constructor.name,
      },
      `Slave ID changed ${old} -> ${newSlaveId}`
    );
  }

  /**
   * Synchronizes the protocol instance with the current transport.
   * Implements lazy principalization and hot reload support for transport.
   */
  private _syncProtocol(): ModbusProtocol {
    const transport = this._effectiveTransport;

    if (!transport) {
      throw new ModbusNotConnectedError();
    }

    if (!this._protocol || this._protocol.transport !== transport) {
      this.logger.debug(
        {
          reason: !this._protocol ? 'initial_sync' : 'transport_changed',
          transport: transport.constructor.name,
        },
        'Syncing protocol with transport instance'
      );
      this._protocol = new ModbusProtocol(transport, this._framing);
    }

    return this._protocol;
  }

  /**
   * Low-level method to send a Modbus request and receive a response.
   * Handles retries, timeouts, exception responses, and device connection notifications.
   * All public read/write methods use this internally.
   * @param pdu - Protocol Data Unit (function code + data)
   * @param timeout - Maximum time to wait for response (defaults to client timeout)
   * @param ignoreNoResponse - If true, only writes without waiting for response
   * @returns Response PDU or undefined when ignoreNoResponse is true
   * @throws ModbusNotConnectedError, ModbusTimeoutError, ModbusExceptionError, etc.
   */
  private async _sendRequest(
    pdu: Uint8Array,
    timeout: number = this.defaultTimeout,
    ignoreNoResponse: boolean = false
  ): Promise<Uint8Array> {
    return await this._mutex.runExclusive(async () => {
      const funcCode = pdu[0];
      const slaveId = this.slaveId;
      const startTime = Date.now();
      let lastError: unknown;

      for (let attempt = 0; attempt <= this.retryCount; attempt++) {
        try {
          const protocol = this._syncProtocol();
          const transport = protocol.transport;

          const attemptStart = Date.now();
          const timeLeft = timeout - (attemptStart - startTime);

          if (timeLeft <= 0) {
            throw new ModbusTimeoutError('Timeout before request started');
          }

          this.logger.debug({ slaveId, funcCode, attempt: attempt + 1 }, 'Exchange start');

          if (ignoreNoResponse) {
            await transport.write(this._framing.buildAdu(slaveId, pdu));
            return new Uint8Array(0);
          }

          const responsePdu = await protocol.exchange(slaveId, pdu, timeLeft);

          if (transport.notifyDeviceConnected) {
            transport.notifyDeviceConnected(this.slaveId);
          }

          if ((responsePdu[0]! & 0x80) !== 0) {
            const excCode = responsePdu[1]!;
            const modbusExc = ModbusClient.EXCEPTION_CODE_MAP.get(excCode) ?? excCode;
            throw new ModbusExceptionError(responsePdu[0]! & 0x7f, modbusExc as number);
          }

          this.logger.info({ slaveId, funcCode, ms: Date.now() - startTime }, 'Response received');

          return responsePdu;
        } catch (err: unknown) {
          lastError = err;

          this.logger.warn(
            { slaveId, funcCode, attempt: attempt + 1, err: (err as any).message },
            'Attempt failed'
          );

          const transport = this._effectiveTransport;
          if (transport && !(err instanceof ModbusExceptionError)) {
            if (transport.notifyDeviceDisconnected) {
              let errorType = EConnectionErrorType.UnknownError;
              if (err instanceof ModbusTimeoutError) errorType = EConnectionErrorType.Timeout;
              else if (err instanceof ModbusCRCError) errorType = EConnectionErrorType.CRCError;

              transport.notifyDeviceDisconnected(
                this.slaveId,
                errorType,
                err instanceof Error ? err.message : String(err)
              );
            }
          }

          if (attempt < this.retryCount) {
            const delay = err instanceof ModbusFlushError ? 50 : this.retryDelay;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    });
  }

  /**
   * Reads multiple holding registers (Function Code 0x03).
   * @param startAddress - Starting register address (1-65535)
   * @param quantity - Number of registers to read (1-125)
   * @returns Array of register values (0-65535)
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async readHoldingRegisters(startAddress: number, quantity: number): Promise<number[]> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new ModbusInvalidQuantityError(quantity, 1, 125);
    }

    const requestPdu = functions.buildReadHoldingRegistersRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(requestPdu);
    return functions.parseReadHoldingRegistersResponse(responsePdu);
  }

  /**
   * Reads multiple input registers (Function Code 0x04).
   * @param startAddress - Starting register address (1-65535)
   * @param quantity - Number of registers to read (1-125)
   * @returns Array of register values (0-65535)
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async readInputRegisters(startAddress: number, quantity: number): Promise<number[]> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new ModbusInvalidQuantityError(quantity, 1, 125);
    }

    const requestPdu = functions.buildReadInputRegistersRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(requestPdu);
    return functions.parseReadInputRegistersResponse(responsePdu);
  }

  /**
   * Writes a single holding register (Function Code 0x06).
   * @param address - Register address (0-65535)
   * @param value - Value to write (0-65535)
   * @param timeout - Optional custom timeout in ms
   * @returns Object containing written address and value
   * @throws ModbusInvalidAddressError, ModbusIllegalDataValueError
   */
  public async writeSingleRegister(
    address: number,
    value: number,
    timeout?: number
  ): Promise<{ startAddress: number; value: number }> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusInvalidAddressError(address);
    }
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new ModbusIllegalDataValueError(value, 'integer between 0-65535');
    }

    const pdu = functions.buildWriteSingleRegisterRequest(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseWriteSingleRegisterResponse(responsePdu);
  }

  /**
   * Writes multiple holding registers (Function Code 0x10).
   * @param address - Starting register address (0-65535)
   * @param values - Array of values to write (each 0-65535)
   * @param timeout - Optional custom timeout in ms
   * @returns Object containing written start address and quantity
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, ModbusIllegalDataValueError
   */
  public async writeMultipleRegisters(
    address: number,
    values: number[],
    timeout?: number
  ): Promise<{ startAddress: number; quantity: number }> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusInvalidAddressError(address);
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 123) {
      throw new ModbusInvalidQuantityError(values.length, 1, 123);
    }
    if (values.some(v => !Number.isInteger(v) || v < 0 || v > 65535)) {
      const invalidValue = values.find(v => !Number.isInteger(v) || v < 0 || v > 65535);
      throw new ModbusIllegalDataValueError(invalidValue!, 'integer between 0-65535');
    }

    const pdu = functions.buildWriteMultipleRegistersRequest(address, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseWriteMultipleRegistersResponse(responsePdu);
  }

  /**
   * Reads multiple coils (Function Code 0x01).
   * @param startAddress - Starting coil address (0-65535)
   * @param quantity - Number of coils to read (1-2000)
   * @param timeout - Optional custom timeout in ms
   * @returns Array of boolean values (true = ON, false = OFF)
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async readCoils(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<boolean[]> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) {
      throw new ModbusInvalidQuantityError(quantity, 1, 2000);
    }

    const pdu = functions.buildReadCoilsRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseReadCoilsResponse(responsePdu, quantity);
  }

  /**
   * Reads multiple discrete inputs (Function Code 0x02).
   * @param startAddress - Starting input address (0-65535)
   * @param quantity - Number of inputs to read (1-2000)
   * @param timeout - Optional custom timeout in ms
   * @returns Array of boolean values
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async readDiscreteInputs(
    startAddress: number,
    quantity: number,
    timeout?: number
  ): Promise<boolean[]> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) {
      throw new ModbusInvalidQuantityError(quantity, 1, 2000);
    }

    const pdu = functions.buildReadDiscreteInputsRequest(startAddress, quantity);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseReadDiscreteInputsResponse(responsePdu, quantity);
  }

  /**
   * Writes a single coil (Function Code 0x05).
   * @param address - Coil address (0-65535)
   * @param value - Boolean value (true = ON, false = OFF)
   * @param timeout - Optional custom timeout in ms
   * @returns Object containing written address and value
   * @throws ModbusInvalidAddressError, ModbusIllegalDataValueError
   */
  public async writeSingleCoil(
    address: number,
    value: boolean,
    timeout?: number
  ): Promise<{ startAddress: number; value: boolean }> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusInvalidAddressError(address);
    }
    if (typeof value === 'number' && value !== 0 && value !== 1) {
      throw new ModbusIllegalDataValueError(value, 'boolean or 0/1');
    }

    const pdu = functions.buildWriteSingleCoilRequest(address, value);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseWriteSingleCoilResponse(responsePdu);
  }

  /**
   * Writes multiple coils (Function Code 0x0F).
   * @param address - Starting coil address (0-65535)
   * @param values - Array of boolean values to write
   * @param timeout - Optional custom timeout in ms
   * @returns Object containing written start address and quantity
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async writeMultipleCoils(
    address: number,
    values: boolean[],
    timeout?: number
  ): Promise<{ startAddress: number; quantity: number }> {
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      throw new ModbusInvalidAddressError(address);
    }
    if (!Array.isArray(values) || values.length < 1 || values.length > 1968) {
      throw new ModbusInvalidQuantityError(values.length, 1, 1968);
    }

    const pdu = functions.buildWriteMultipleCoilsRequest(address, values);
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseWriteMultipleCoilsResponse(responsePdu);
  }

  /**
   * Reports slave ID and additional information (Function Code 0x11).
   * @param timeout - Optional custom timeout in ms
   * @returns Object with slave ID, running status and raw data
   */
  public async reportSlaveId(
    timeout?: number
  ): Promise<{ slaveId: number; isRunning: boolean; data: Uint8Array }> {
    const pdu = functions.buildReportSlaveIdRequest();
    const responsePdu = await this._sendRequest(pdu, timeout);
    return functions.parseReportSlaveIdResponse(responsePdu);
  }

  /**
   * Reads device identification information (Function Code 0x2B / 0x0E).
   * @param timeout - Optional custom timeout in ms
   * @returns Detailed device identification object with object values as strings
   */
  public async readDeviceIdentification(
    decoder: 'windows-1251' | 'utf-8' = 'utf-8',
    timeout?: number
  ) {
    const pdu = functions.buildReadDeviceIdentificationRequest(0x01, 0x00);
    const responsePdu = await this._sendRequest(pdu, timeout);

    const rawResponse = functions.parseReadDeviceIdentificationResponse(responsePdu);

    if (!rawResponse) {
      this.logger.error('Failed to parse 0x2B response');
      throw new Error('Modbus function 0x2B parsing failed');
    }

    const formattedObjects: Record<number, string> = {};

    if (rawResponse.objects) {
      const decodeText = new TextDecoder(decoder);

      for (const [key, value] of Object.entries(rawResponse.objects)) {
        const id = parseInt(key, 10);
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value as any);
        formattedObjects[id] = decodeText.decode(bytes).replace(/\0/g, '').trim();
      }
    }

    return {
      ...rawResponse,
      objects: formattedObjects,
    };
  }
}

export = ModbusClient;
