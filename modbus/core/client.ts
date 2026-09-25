// modbus/core/client.ts

import { Logger, type ILogObj } from 'tslog';
import { createTsLogger, formatDuration } from '../utils/logger.js';
import * as framer from '../protocol/framing.js';
import * as functions from '../protocol/functions.js';
import { ModbusProtocol } from './protocol.js';
import { ModbusExceptionCode, ModbusFunctionCode } from '../constants/modbus.js';
import RegisterData from './register-data.js';
import { DeviceConnectionTracker } from '../transport/trackers/device-tracker.js';
import { runWithRetries } from '../utils/retry.js';
import {
  EConnectionErrorType,
  ICustomFunctionHandler,
  IModbusClient,
  IModbusClientOptions,
  IModbusPlugin,
  IClientContext,
  IPortSession,
  ITransport,
  ITransportController,
  TDeviceStateHandler,
  TModbusClientLogLevel,
  TRSMode,
} from '../types/public.js';
import {
  ModbusCRCError,
  ModbusExceptionError,
  ModbusFlushError,
  ModbusIllegalDataValueError,
  ModbusInvalidAddressError,
  ModbusInvalidQuantityError,
  ModbusBufferUnderrunError,
  ModbusNotConnectedError,
  ModbusTimeoutError,
  ModbusOperationTimeoutError,
  ModbusQueueOverflowError,
  ModbusReentrancyError,
  ModbusScanActiveError,
} from '../core/errors.js';

/** Queue priority of manual client requests (lower number runs earlier). */
const REQUEST_PRIORITY = 1;

/**
 * ModbusClient is the main high-level interface for communicating with Modbus devices.
 * It supports both RTU and TCP framing, provides built-in retry logic, timeout handling,
 * plugin system, and comprehensive error management.
 * All public methods are thread-safe thanks to an internal mutex.
 */
class ModbusClient implements IModbusClient {
  /** Transport controller that manages physical connections. */
  private transportController: ITransportController;
  /** Modbus slave address (1-255). */
  private slaveId: number;
  /** Configuration options for timeout, retries, framing, plugins, etc. */
  private options: IModbusClientOptions;
  /** RS mode (RS485, RS232, TCP/IP) used for framing and transport selection. */
  private RSMode: TRSMode;
  /** Default timeout for requests (ms). */
  private defaultTimeout: number;
  /** Number of retry attempts for failed requests. */
  private retryCount: number;
  /** Delay between retry attempts (ms). */
  private retryDelay: number;
  /** Total budget of one call (ms), retries and delays included; 0 = disabled. */
  private totalTimeout: number;
  /** Isolated device tracker: this client's own view of its slave's connection state. */
  private readonly _deviceTracker: DeviceConnectionTracker;
  /** Controller-registered client id (undefined for legacy, self-created clients). */
  private _clientId?: string;
  /** Explicit session binding injected by the controller for managed clients. */
  private _session: IPortSession | null = null;
  /** True once the controller has unregistered this client (binding is dropped). */
  private _detached = false;
  /** Framing class (RtuFramer or TcpFramer) used for this client. */
  private _framing: typeof framer.RtuFramer | typeof framer.TcpFramer;
  /** Protocol instance used for sending/receiving Modbus PDUs. */
  private _protocol?: ModbusProtocol;
  /** Registered plugins that extend functionality with custom function codes and handlers. */
  private _plugins: IModbusPlugin[] = [];
  /** Registered custom function handlers keyed by function name. */
  private _customFunctions: Map<string, ICustomFunctionHandler> = new Map();
  /** Logger instance for this client, with slaveId bound to every record. */
  private logger: Logger<ILogObj>;

  /** Mapping of Modbus function codes to their corresponding enum values. */
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

  /** Mapping of Modbus exception codes to their corresponding enum values. */
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
   * @param context - Managed-client context injected by controller.createClient(); when
   *   present, the session binding and the framing (derived from the port RS mode) are
   *   taken from it instead of being resolved through the router.
   * @throws ModbusInvalidAddressError if slaveId is invalid
   */
  constructor(
    transportController: ITransportController,
    slaveId: number = 1,
    options: IModbusClientOptions = {},
    context?: IClientContext
  ) {
    if (!Number.isInteger(slaveId) || slaveId < 0 || slaveId > 255) {
      throw new ModbusInvalidAddressError(slaveId);
    }

    this.transportController = transportController;
    this.slaveId = slaveId;
    this.options = options;
    this.defaultTimeout = options.timeout ?? 1000;
    this.retryCount = options.retryCount ?? 0;
    this.retryDelay = options.retryDelay ?? 100;
    this.totalTimeout = options.totalTimeout ?? 0;
    this._deviceTracker = new DeviceConnectionTracker();
    this.logger = this._createLogger(options.logLevel ?? 'info');

    this._clientId = context?.clientId;
    this._session = context?.session ?? null;

    // Managed clients never choose their framing: it is derived from the port RS mode.
    this._framing =
      (context?.framing ?? options.framing) === 'tcp' ? framer.TcpFramer : framer.RtuFramer;
    this.RSMode =
      context?.rsMode ?? options.RSMode ?? (options.framing === 'tcp' ? 'TCP/IP' : 'RS485');

    const transport = this._effectiveTransport;
    if (transport) {
      this._protocol = new ModbusProtocol(
        transport,
        this._framing,
        options.echo ?? false,
        this.logger
      );
    }

    if (options.plugins && Array.isArray(options.plugins)) {
      for (const PluginClass of options.plugins) {
        this.use(new PluginClass());
      }
    }
  }

  /**
   * Builds the tslog logger for this client. `slaveId` is bound into every record so that
   * protocol-level and polling logs can be correlated per device. `'silent'` drops output
   * entirely (tslog has no silent level, we use `type: 'hidden'` instead).
   */
  private _createLogger(level: TModbusClientLogLevel = 'info'): Logger<ILogObj> {
    return createTsLogger({
      name: 'ModbusClient',
      level,
      bindings: { slaveId: this.slaveId },
    });
  }

  /**
   * Returns the currently active transport for this slave and RS mode.
   * Used internally by all communication methods.
   */
  private get _effectiveTransport(): ITransport | null {
    return this._effectiveSession?.transport ?? null;
  }

  /**
   * Returns the port session that owns the transport this client must use.
   * Managed clients keep the binding injected at creation; legacy clients resolve it
   * through the controller router on every access.
   */
  private get _effectiveSession(): IPortSession | null {
    if (this._detached) return null;
    return this._session ?? this.transportController.getSessionForSlave(this.slaveId, this.RSMode);
  }

  /** Controller-registered id of this client (undefined for self-created clients). */
  public get clientId(): string | undefined {
    return this._clientId;
  }

  /** Clears the client's isolated device state (used when the controller drops it). */
  public async clearDeviceState(): Promise<void> {
    await this._deviceTracker.clear();
  }

  /**
   * Changes the slave address without touching the controller roster.
   * Called by the controller (`reassignClient`) and by `setSlaveId()` for unmanaged clients.
   */
  public applySlaveId(newSlaveId: number): void {
    const old = this.slaveId;
    this.slaveId = newSlaveId;
    // The previous slave's connection state does not belong to this client any more.
    void this._deviceTracker.removeState(old);
  }

  /**
   * Sends an arbitrary PDU and returns the response PDU.
   *
   * Low-level escape hatch for vendor/custom function codes and diagnostics: the port queue,
   * device notifications and retries still apply, so it is safe to mix with normal calls.
   *
   * @param pdu - Ready protocol data unit (function code + data).
   * @param timeout - Optional exchange budget in ms.
   * @throws ModbusBufferUnderrunError when the PDU is empty.
   */
  public async rawExchange(
    pdu: Uint8Array,
    timeout?: number,
    expectedLengthResolver?: (
      partialResponsePdu: Uint8Array,
      requestPdu: Uint8Array
    ) => number | null
  ): Promise<Uint8Array> {
    if (!(pdu instanceof Uint8Array) || pdu.length === 0) {
      throw new ModbusBufferUnderrunError(0, 1);
    }
    return await this._sendRequest(pdu, timeout, false, true, expectedLengthResolver);
  }

  /**
   * Drops the session binding and the client id. The controller calls this when the client
   * leaves the roster, so a stale reference can no longer reach a removed port.
   */
  public detachSession(): void {
    this._session = null;
    this._clientId = undefined;
    this._detached = true;
  }

  /**
   * Registers a handler for this client's isolated device connection state.
   * @param handler - Callback `(slaveId, connected, error?) => void`.
   */
  public async setDeviceStateHandler(handler: TDeviceStateHandler): Promise<void> {
    await this._deviceTracker.setHandler(handler);
  }

  /**
   * Disables all logging output.
   * Replaces the internal logger with a `type: 'hidden'` tslog instance.
   */
  public disableLogger(): void {
    this.logger = this._createLogger('silent');
    // The protocol may hold the previous instance: keep them in sync.
    this._protocol?.setLogger(this.logger);
  }

  /**
   * Enables and configures the logger.
   *
   * Sets the default log level to 'info'; name and slave ID are attached to every record.
   * In non-production environments the output is pretty-printed.
   */
  public enableLogger(): void {
    this.logger = this._createLogger('info');
    this._protocol?.setLogger(this.logger);
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
    const expectedLengthResolver = handler.getExpectedResponseLength
      ? (partialPdu: Uint8Array, reqPdu: Uint8Array) =>
          handler.getExpectedResponseLength!(partialPdu, reqPdu)
      : undefined;

    return await this._sendRequestAndParse(
      requestPdu,
      responsePdu => {
        if (!responsePdu) return handler.parseResponse(new Uint8Array(0));
        return handler.parseResponse(responsePdu);
      },
      this.defaultTimeout,
      expectedLengthResolver
    );
  }

  /**
   * Performs a logical connection check.
   * Verifies that a transport exists for the current slave and that it is open.
   * Does **not** establish a physical connection — that is managed by TransportController.
   * @throws ModbusNotConnectedError if transport is not available or not open
   */
  public async connect(): Promise<void> {
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
  }

  /**
   * Performs a logical disconnection.
   * This is a no-op for the physical transport layer.
   * Physical connection management should be handled exclusively by the TransportController.
   * Mainly used for logging and consistency with connect().
   */
  public async disconnect(): Promise<void> {
    // Managed clients delegate to the controller so the client roster stays authoritative
    // (no double unregistration and no accidental removal of an empty transport).
    if (this._clientId && this.transportController.getClient(this._clientId) === this) {
      await this.transportController.removeClient(this._clientId);
      this.logger.info('Client removed from controller registry');
      return;
    }

    const transport = this._effectiveTransport;

    const transportInfo = this.transportController
      .listTransports()
      .find(t => t.transport === transport);

    if (transportInfo) {
      await this.transportController.removeSlaveIdFromTransport(transportInfo.id, this.slaveId);
    }

    await this._deviceTracker.clear();

    this.logger.info('Client disconnected and unregistered from transport');
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

    // The managed client rebinds the controller: it maintains the registry and port inventory;
    // otherwise, the inventory would drift out of sync with reality.
    if (
      this._clientId &&
      typeof this.transportController.reassignClient === 'function' &&
      this.transportController.getClient(this._clientId) === this
    ) {
      await this.transportController.reassignClient(this._clientId, newSlaveId);
      return;
    }

    const old = this.slaveId;
    this.applySlaveId(newSlaveId);
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
      this._protocol = new ModbusProtocol(
        transport,
        this._framing,
        this.options.echo ?? false,
        this.logger
      );
    }

    return this._protocol;
  }

  private _formatResponseForLog(response: unknown): string {
    try {
      const serialized = JSON.stringify(response, (_key, value) =>
        value instanceof Uint8Array ? Array.from(value) : value
      );
      return serialized ?? String(response);
    } catch {
      return String(response);
    }
  }

  private _formatDuration(durationMs: number): string {
    return formatDuration(durationMs, this.logger.settings.type === 'pretty');
  }

  private _logParsedResponse(
    slaveId: number,
    funcCode: number,
    response: unknown,
    durationMs: number
  ): void {
    this.logger.info(
      `[ID:${slaveId}][FC:${funcCode}] Response received ${this._formatResponseForLog(response)} ${this._formatDuration(durationMs)}`
    );
  }

  private async _sendRequestAndParse<T>(
    pdu: Uint8Array,
    parseResponse: (responsePdu: Uint8Array) => T | Promise<T>,
    timeout: number = this.defaultTimeout,
    expectedLengthResolver?: (
      partialResponsePdu: Uint8Array,
      requestPdu: Uint8Array
    ) => number | null
  ): Promise<T> {
    const startTime = Date.now();
    const responsePdu = await this._sendRequest(pdu, timeout, false, false, expectedLengthResolver);
    const parsedResponse = await parseResponse(responsePdu);
    this._logParsedResponse(this.slaveId, pdu[0] ?? 0, parsedResponse, Date.now() - startTime);
    return parsedResponse;
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
    ignoreNoResponse: boolean = false,
    logGenericResponse: boolean = true,
    expectedLengthResolver?: (
      partialResponsePdu: Uint8Array,
      requestPdu: Uint8Array
    ) => number | null
  ): Promise<Uint8Array> {
    const funcCode = pdu[0];
    const slaveId = this.slaveId;
    const startTime = Date.now();

    // `timeout` — the budget for a single attempt: measured from the moment transmission begins and excluding
    // time spent waiting in the queue. `totalTimeout` — the budget for the entire call, including pauses and retries
    // (0 = disabled). When the budget is exhausted, the call is rejected with a ModbusOperationTimeoutError.
    const deadline = this.totalTimeout > 0 ? startTime + this.totalTimeout : 0;
    const remainingMs = (): number =>
      deadline === 0 ? Number.POSITIVE_INFINITY : deadline - Date.now();

    // The retry policy is shared with polling tasks (modbus/utils/retry.ts)
    // Client-specifics: fixed pause (retryDelay; 50 ms for flush errors),
    // and exception responses are not retried—this indicates a logical device error rather than a line failure.
    return await runWithRetries<Uint8Array>(
      async attemptNumber => {
        if (deadline !== 0 && remainingMs() <= 0) {
          throw new ModbusOperationTimeoutError(this.totalTimeout, slaveId);
        }

        this.logger.debug({ slaveId, funcCode, attempt: attemptNumber }, 'Exchange start');

        // Each retry attempt is submitted as its own port-queue job: the queue keeps every
        // flush -> write -> read exchange atomic, while the port breathes between attempts.
        // `timeout` is the budget of the EXCHANGE itself and is measured from the moment the
        // job really starts on the wire. Waiting in the port queue behind another device must
        // not eat that budget, otherwise a healthy request would fail without being sent.
        // An attempt cannot exceed the total budget: its timeout is capped at the remaining amount.
        const attemptTimeout = Math.max(1, Math.min(timeout, remainingMs()));
        const responsePdu = await this._enqueueExchange(
          slaveId,
          pdu,
          attemptTimeout,
          ignoreNoResponse,
          expectedLengthResolver
        );

        if (ignoreNoResponse) {
          return new Uint8Array(0);
        }

        // Device-state notifications run outside the port queue (they use the tracker's own
        // mutex). The transport-level notification is kept while the legacy path still exists.
        const transport = this._effectiveTransport;
        if (transport?.notifyDeviceConnected) {
          transport.notifyDeviceConnected(this.slaveId);
        }
        await this._deviceTracker.notifyConnected(slaveId);

        if ((responsePdu[0]! & 0x80) !== 0) {
          const excCode = responsePdu[1]!;
          const modbusExc = ModbusClient.EXCEPTION_CODE_MAP.get(excCode) ?? excCode;
          this._logParsedResponse(
            slaveId,
            funcCode,
            { exception: true, code: modbusExc, functionCode: responsePdu[0]! & 0x7f },
            Date.now() - startTime
          );
          throw new ModbusExceptionError(responsePdu[0]! & 0x7f, modbusExc as number);
        }

        if (logGenericResponse) {
          this.logger.info(
            `Response received slaveId=${slaveId} funcCode=${funcCode} duration=${this._formatDuration(Date.now() - startTime)}`
          );
        }

        return responsePdu;
      },
      {
        maxRetries: this.retryCount,
        // An exception response—such as a device logic error or queue overflow—is not a line fault:
        // neither requires a retry (retrying would only exacerbate port congestion).
        shouldRetry: error =>
          !(error instanceof ModbusExceptionError) && !(error instanceof ModbusQueueOverflowError),
        // Pause before retry also counts towards the total call budget.
        getDelayMs: error => {
          const base = error instanceof ModbusFlushError ? 50 : this.retryDelay;
          return Math.max(0, Math.min(base, remainingMs()));
        },
        // The client owns its device tracker: connection quality to its slave is judged here.
        onAttemptFailed: (error, attemptNumber) => {
          this.logger.warn(
            { slaveId, funcCode, attempt: attemptNumber, err: (error as any).message },
            'Attempt failed'
          );

          if (error instanceof ModbusExceptionError) return;

          // Infrastructure errors (port queue, scan, reentrancy) — not the device's fault:
          // connection state is not switched for them.
          if (
            error instanceof ModbusQueueOverflowError ||
            error instanceof ModbusScanActiveError ||
            error instanceof ModbusReentrancyError
          ) {
            return;
          }

          let errorType = EConnectionErrorType.UnknownError;
          if (error instanceof ModbusTimeoutError) errorType = EConnectionErrorType.Timeout;
          else if (error instanceof ModbusCRCError) errorType = EConnectionErrorType.CRCError;

          const errorMessage = error instanceof Error ? error.message : String(error);

          const transport = this._effectiveTransport;
          if (transport?.notifyDeviceDisconnected) {
            transport.notifyDeviceDisconnected(this.slaveId, errorType, errorMessage);
          }

          // The client owns its device tracker: connection quality to its slave is judged here.
          this._deviceTracker.notifyDisconnected(slaveId, errorType, errorMessage);
        },
      }
    );
  }
  /**
   * Submits one exchange attempt to the port session queue.
   * The job performs the whole atomic exchange (flush -> write -> read) so that no other
   * client or polling task can interleave inside it.
   *
   * @param slaveId - Target slave id.
   * @param pdu - Protocol Data Unit to send.
   * @param timeout - Remaining time budget for this attempt.
   * @param ignoreNoResponse - When true only the frame is written.
   */
  private async _enqueueExchange(
    slaveId: number,
    pdu: Uint8Array,
    timeout: number,
    ignoreNoResponse: boolean,
    expectedLengthResolver?: (
      partialResponsePdu: Uint8Array,
      requestPdu: Uint8Array
    ) => number | null
  ): Promise<Uint8Array> {
    const session = this._effectiveSession;

    if (!session) {
      throw new ModbusNotConnectedError();
    }

    /**
     * The port queue is the only place where the transport is guaranteed to be free for this slave and RS mode.
     * The queue is shared with polling tasks, so the exchange is atomic.
     */
    return session.queue.enqueue(
      async () => {
        const protocol = this._syncProtocol();

        if (ignoreNoResponse) {
          await protocol.transport.write(this._framing.buildAdu(slaveId, pdu));
          return new Uint8Array(0);
        }

        return protocol.exchange(slaveId, pdu, timeout, expectedLengthResolver);
      },
      { priority: REQUEST_PRIORITY, immediate: true }
    );
  }

  /**
   * Reads multiple holding registers (Function Code 0x03).
   * @param startAddress - Starting register address (1-65535)
   * @param quantity - Number of registers to read (1-125)
   * @returns Array of register values (0-65535)
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async readHoldingRegisters(startAddress: number, quantity: number): Promise<RegisterData> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new ModbusInvalidQuantityError(quantity, 1, 125);
    }

    const requestPdu = functions.buildReadHoldingRegistersRequest(startAddress, quantity);
    return await this._sendRequestAndParse(requestPdu, responsePdu =>
      RegisterData.from(functions.parseReadHoldingRegistersResponse(responsePdu))
    );
  }

  /**
   * Reads multiple input registers (Function Code 0x04).
   * @param startAddress - Starting register address (1-65535)
   * @param quantity - Number of registers to read (1-125)
   * @returns Array of register values (0-65535)
   * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError
   */
  public async readInputRegisters(startAddress: number, quantity: number): Promise<RegisterData> {
    if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
      throw new ModbusInvalidAddressError(startAddress);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
      throw new ModbusInvalidQuantityError(quantity, 1, 125);
    }

    const requestPdu = functions.buildReadInputRegistersRequest(startAddress, quantity);
    return await this._sendRequestAndParse(requestPdu, responsePdu =>
      RegisterData.from(functions.parseReadInputRegistersResponse(responsePdu))
    );
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
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseWriteSingleRegisterResponse(responsePdu),
      timeout
    );
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
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseWriteMultipleRegistersResponse(responsePdu),
      timeout
    );
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
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseReadCoilsResponse(responsePdu, quantity),
      timeout
    );
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
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseReadDiscreteInputsResponse(responsePdu, quantity),
      timeout
    );
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
    const rawCoilValue = value as unknown as boolean | number;
    if (typeof rawCoilValue !== 'boolean' && rawCoilValue !== 0 && rawCoilValue !== 1) {
      throw new ModbusIllegalDataValueError(rawCoilValue as unknown as number, 'boolean or 0/1');
    }

    const pdu = functions.buildWriteSingleCoilRequest(address, value);
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseWriteSingleCoilResponse(responsePdu),
      timeout
    );
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

    const rawCoilValues = values as unknown as Array<boolean | number>;
    const badCoilValue = rawCoilValues.find(v => typeof v !== 'boolean' && v !== 0 && v !== 1);
    if (badCoilValue !== undefined) {
      throw new ModbusIllegalDataValueError(badCoilValue as unknown as number, 'boolean or 0/1');
    }

    const pdu = functions.buildWriteMultipleCoilsRequest(address, values);
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseWriteMultipleCoilsResponse(responsePdu),
      timeout
    );
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
    return await this._sendRequestAndParse(
      pdu,
      responsePdu => functions.parseReportSlaveIdResponse(responsePdu),
      timeout
    );
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
    const startTime = Date.now();

    // The response length (0x2B) is not known in advance (expectedResponsePduLength returns null),
    // so the RTU reads it byte-by-byte. The first request after (re)connection often
    // encounters interference or an incomplete transmission, and a single failed attempt
    // guarantees a timeout without a retry. We perform one short retry for line-related
    // errors (internal to this call; invisible to the user). If retryCount/totalTimeout
    // are specified, we do not consume their budget.
    const responsePdu: Uint8Array =
      this.totalTimeout > 0 || this.retryCount >= 1
        ? await this._sendRequest(pdu, timeout, false, false)
        : await runWithRetries<Uint8Array>(() => this._sendRequest(pdu, timeout, false, false), {
            maxRetries: 1,
            shouldRetry: error =>
              error instanceof ModbusTimeoutError || error instanceof ModbusCRCError,
            getDelayMs: () => 100,
            onAttemptFailed: (error, attemptNumber) =>
              this.logger.warn(
                { attempt: attemptNumber, err: (error as Error).message },
                'Identification read failed, retrying'
              ),
          });

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
        try {
          formattedObjects[id] = decodeText.decode(bytes).replace(/\0/g, '').trim();
        } catch {
          // A malformed identification object must not cause the entire request to fail.
          formattedObjects[id] = '';
        }
      }
    }

    const response = {
      ...rawResponse,
      objects: formattedObjects,
    };
    this._logParsedResponse(this.slaveId, pdu[0] ?? 0, response, Date.now() - startTime);
    return response;
  }
}

export = ModbusClient;
