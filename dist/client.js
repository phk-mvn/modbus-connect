"use strict";
// modbus/client.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
const async_mutex_1 = require("async-mutex");
const pino_1 = require("pino");
const framer = __importStar(require("./utils/framers.js"));
const functions = __importStar(require("./utils/functions.js"));
const protocol_1 = require("./protocol");
const constants_1 = require("./constants/constants");
const modbus_types_1 = require("./types/modbus-types");
const errors_1 = require("./errors");
/**
 * ModbusClient is the main high-level interface for communicating with Modbus devices.
 * It supports both RTU and TCP framing, provides built-in retry logic, timeout handling,
 * plugin system, and comprehensive error management.
 * All public methods are thread-safe thanks to an internal mutex.
 */
class ModbusClient {
    transportController;
    slaveId;
    options;
    RSMode;
    defaultTimeout;
    retryCount;
    retryDelay;
    _mutex;
    _framing;
    _protocol;
    _plugins = [];
    _customFunctions = new Map();
    logger;
    static FUNCION_CODE_MAP = new Map([
        [0x01, constants_1.ModbusFunctionCode.READ_COILS],
        [0x02, constants_1.ModbusFunctionCode.READ_DISCRETE_INPUTS],
        [0x03, constants_1.ModbusFunctionCode.READ_HOLDING_REGISTERS],
        [0x04, constants_1.ModbusFunctionCode.READ_INPUT_REGISTERS],
        [0x05, constants_1.ModbusFunctionCode.WRITE_SINGLE_COIL],
        [0x06, constants_1.ModbusFunctionCode.WRITE_SINGLE_REGISTER],
        [0x0f, constants_1.ModbusFunctionCode.WRITE_MULTIPLE_COILS],
        [0x10, constants_1.ModbusFunctionCode.WRITE_MULTIPLE_REGISTERS],
        [0x11, constants_1.ModbusFunctionCode.REPORT_SLAVE_ID],
        [0x2b, constants_1.ModbusFunctionCode.READ_DEVICE_IDENTIFICATION],
    ]);
    static EXCEPTION_CODE_MAP = new Map([
        [1, constants_1.ModbusExceptionCode.ILLEGAL_FUNCTION],
        [2, constants_1.ModbusExceptionCode.ILLEGAL_DATA_ADDRESS],
        [3, constants_1.ModbusExceptionCode.ILLEGAL_DATA_VALUE],
        [4, constants_1.ModbusExceptionCode.SLAVE_DEVICE_FAILURE],
        [5, constants_1.ModbusExceptionCode.ACKNOWLEDGE],
        [6, constants_1.ModbusExceptionCode.SLAVE_DEVICE_BUSY],
        [8, constants_1.ModbusExceptionCode.MEMORY_PARITY_ERROR],
        [10, constants_1.ModbusExceptionCode.GATEWAY_PATH_UNAVAILABLE],
        [11, constants_1.ModbusExceptionCode.GATEWAY_TARGET_DEVICE_FAILED],
    ]);
    /**
     * Creates a new ModbusClient instance.
     * @param transportController - Transport controller that manages physical connections
     * @param slaveId - Modbus slave address (1-255)
     * @param options - Configuration options for timeout, retries, framing, plugins, etc.
     * @throws ModbusInvalidAddressError if slaveId is invalid
     */
    constructor(transportController, slaveId = 1, options = {}) {
        if (!Number.isInteger(slaveId) || slaveId < 0 || slaveId > 255) {
            throw new errors_1.ModbusInvalidAddressError(slaveId);
        }
        this.logger = (0, pino_1.pino)({
            level: 'info',
            base: { component: 'ModbusClient', slaveId: slaveId },
            transport: process.env.NODE_ENV !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:mm:ss',
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
        this._mutex = new async_mutex_1.Mutex();
        if (options.RSMode) {
            this.RSMode = options.RSMode;
        }
        else {
            this.RSMode = options.framing === 'tcp' ? 'TCP/IP' : 'RS485';
        }
        const transport = this._effectiveTransport;
        this._framing = options.framing === 'tcp' ? framer.TcpFramer : framer.RtuFramer;
        this._protocol = new protocol_1.ModbusProtocol(transport, this._framing);
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
    get _effectiveTransport() {
        return this.transportController.getTransportForSlave(this.slaveId, this.RSMode);
    }
    /**
     * Disables all logging output.
     * Re-initializes the pino instance with the 'silent' level to stop any log emission.
     */
    disableLogger() {
        this.logger = (0, pino_1.pino)({
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
    enableLogger() {
        this.logger = (0, pino_1.pino)({
            level: 'info',
            base: { component: 'ModbusClient', slaveId: this.slaveId },
            transport: process.env.NODE_ENV !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:mm:ss',
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
    use(plugin) {
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
                    this.logger.warn(`Custom function "${funcName}" from plugin "${plugin.name}" overrides an existing function`);
                }
                const handler = plugin.customFunctionCodes[funcName];
                if (handler)
                    this._customFunctions.set(funcName, handler);
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
    async executeCustomFunction(functionName, ...args) {
        const handler = this._customFunctions.get(functionName);
        if (!handler)
            throw new Error(`Custom function "${functionName}" is not registered. Have you registered the plugin using client.use()?`);
        const requestPdu = handler.buildRequest(...args);
        const responsePdu = await this._sendRequest(requestPdu);
        if (!responsePdu)
            return handler.parseResponse(new Uint8Array(0));
        return handler.parseResponse(responsePdu);
    }
    /**
     * Performs a logical connection check.
     * Verifies that a transport exists for the current slave and that it is open.
     * Does **not** establish a physical connection — that is managed by TransportController.
     * @throws ModbusNotConnectedError if transport is not available or not open
     */
    async connect() {
        const release = await this._mutex.acquire();
        try {
            const transport = this._effectiveTransport;
            if (!transport)
                throw new errors_1.ModbusNotConnectedError();
            if (!transport.isOpen)
                throw new errors_1.ModbusNotConnectedError();
            this.logger.info({
                slaveId: this.slaveId,
                transport: transport.constructor.name,
            }, 'Client is ready. Transport is connected and available');
        }
        finally {
            release();
        }
    }
    /**
     * Performs a logical disconnection.
     * This is a no-op for the physical transport layer.
     * Physical connection management should be handled exclusively by the TransportController.
     * Mainly used for logging and consistency with connect().
     */
    async disconnect() {
        const release = await this._mutex.acquire();
        try {
            const transport = this._effectiveTransport;
            const transportId = this.transportController
                .listTransports()
                .find(t => t.transport === transport)?.id;
            if (transportId) {
                this.transportController.removeSlaveIdFromTransport(transportId, this.slaveId);
            }
            this.logger.info('Client disconnected and unregistered from transport');
        }
        finally {
            release();
        }
    }
    /**
     * Returns the current slave ID used by this client instance
     * Useful when slave ID can change dynamically
     * @returns The current slave ID (1-255)
     */
    get currentSlaveId() {
        return this.slaveId;
    }
    /**
     * Dynamically changes the slave ID of this client intsance without recreating the client
     * After calling this method, all subsequent requests will use the new slave ID
     * @param newSlaveId - New slave ID (must be integer between 1 and 255)
     * @throws ModbusInvalidAddressError if newSlaveId is invalid
     */
    async setSlaveId(newSlaveId) {
        if (!Number.isInteger(newSlaveId) || newSlaveId < 1 || newSlaveId > 255)
            throw new errors_1.ModbusInvalidAddressError(newSlaveId);
        const old = this.slaveId;
        this.slaveId = newSlaveId;
        this.logger.info({
            transport: this._effectiveTransport?.constructor.name,
        }, `Slave ID changed ${old} -> ${newSlaveId}`);
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
    async _sendRequest(pdu, timeout = this.defaultTimeout, ignoreNoResponse = false) {
        const release = await this._mutex.acquire();
        const funcCode = pdu[0];
        const funcCodeEnum = ModbusClient.FUNCION_CODE_MAP.get(funcCode) ?? funcCode;
        const slaveId = this.slaveId;
        const startTime = Date.now();
        let lastError;
        try {
            for (let attempt = 0; attempt <= this.retryCount; attempt++) {
                const transport = this._effectiveTransport;
                if (!transport)
                    throw new errors_1.ModbusNotConnectedError();
                try {
                    const attemptStart = Date.now();
                    const timeLeft = timeout - (attemptStart - startTime);
                    if (timeLeft <= 0)
                        throw new errors_1.ModbusTimeoutError('Timeout before request');
                    this.logger.debug({ slaveId, funcCode }, `Attempt #${attempt + 1} - exchange start`);
                    if (ignoreNoResponse) {
                        await transport.write(this._framing.buildAdu(slaveId, pdu));
                        return new Uint8Array(0);
                    }
                    const responsePdu = await this._protocol.exchange(slaveId, pdu, timeLeft);
                    if (transport.notifyDeviceConnected) {
                        transport.notifyDeviceConnected(this.slaveId);
                    }
                    if ((responsePdu[0] & 0x80) !== 0) {
                        const excCode = responsePdu[1];
                        const modbusExc = ModbusClient.EXCEPTION_CODE_MAP.get(excCode) ?? excCode;
                        throw new errors_1.ModbusExceptionError(responsePdu[0] & 0x7f, modbusExc);
                    }
                    this.logger.info({
                        slaveId,
                        funcCode,
                        ms: Date.now() - startTime,
                    }, 'Response received', Date.now() - startTime);
                    return responsePdu;
                }
                catch (err) {
                    lastError = err;
                    const elapsed = Date.now() - startTime;
                    this.logger.warn({ slaveId, funcCode, responseTime: elapsed }, `Attempt #${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
                    if (!(err instanceof errors_1.ModbusExceptionError)) {
                        if (transport.notifyDeviceDisconnected) {
                            let errorType = modbus_types_1.EConnectionErrorType.UnknownError;
                            if (err instanceof errors_1.ModbusTimeoutError)
                                errorType = modbus_types_1.EConnectionErrorType.Timeout;
                            else if (err instanceof errors_1.ModbusCRCError)
                                errorType = modbus_types_1.EConnectionErrorType.CRCError;
                            transport.notifyDeviceDisconnected(this.slaveId, errorType, err instanceof Error ? err.message : String(err));
                        }
                    }
                    if (attempt < this.retryCount) {
                        const delay = err instanceof errors_1.ModbusFlushError ? 50 : this.retryDelay;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }
        finally {
            release();
        }
    }
    /**
     * Reads multiple holding registers (Function Code 0x03).
     * @param startAddress - Starting register address (1-65535)
     * @param quantity - Number of registers to read (1-125)
     * @returns Array of register values (0-65535)
     * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, ModbusTimeoutError, etc.
     */
    async readHoldingRegisters(startAddress, quantity) {
        if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
            throw new errors_1.ModbusInvalidAddressError(startAddress);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
            throw new errors_1.ModbusInvalidQuantityError(quantity, 1, 125);
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
     * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, ModbusTimeoutError, etc.
     */
    async readInputRegisters(startAddress, quantity) {
        if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
            throw new errors_1.ModbusInvalidAddressError(startAddress);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 125) {
            throw new errors_1.ModbusInvalidQuantityError(quantity, 1, 125);
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
     * @throws ModbusInvalidAddressError, ModbusIllegalDataValueError, ModbusTimeoutError, etc.
     */
    async writeSingleRegister(address, value, timeout) {
        if (!Number.isInteger(address) || address < 0 || address > 65535) {
            throw new errors_1.ModbusInvalidAddressError(address);
        }
        if (!Number.isInteger(value) || value < 0 || value > 65535) {
            throw new errors_1.ModbusIllegalDataValueError(value, 'integer between 0-65535');
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
     * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, ModbusIllegalDataValueError, etc.
     */
    async writeMultipleRegisters(address, values, timeout) {
        if (!Number.isInteger(address) || address < 0 || address > 65535) {
            throw new errors_1.ModbusInvalidAddressError(address);
        }
        if (!Array.isArray(values) || values.length < 1 || values.length > 123) {
            throw new errors_1.ModbusInvalidQuantityError(values.length, 1, 123);
        }
        if (values.some(v => !Number.isInteger(v) || v < 0 || v > 65535)) {
            const invalidValue = values.find(v => !Number.isInteger(v) || v < 0 || v > 65535);
            throw new errors_1.ModbusIllegalDataValueError(invalidValue, 'integer between 0-65535');
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
     * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, etc.
     */
    async readCoils(startAddress, quantity, timeout) {
        if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
            throw new errors_1.ModbusInvalidAddressError(startAddress);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) {
            throw new errors_1.ModbusInvalidQuantityError(quantity, 1, 2000);
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
     * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, etc.
     */
    async readDiscreteInputs(startAddress, quantity, timeout) {
        if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 65535) {
            throw new errors_1.ModbusInvalidAddressError(startAddress);
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) {
            throw new errors_1.ModbusInvalidQuantityError(quantity, 1, 2000);
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
     * @throws ModbusInvalidAddressError, ModbusIllegalDataValueError, etc.
     */
    async writeSingleCoil(address, value, timeout) {
        if (!Number.isInteger(address) || address < 0 || address > 65535) {
            throw new errors_1.ModbusInvalidAddressError(address);
        }
        if (typeof value === 'number' && value !== 0 && value !== 1) {
            throw new errors_1.ModbusIllegalDataValueError(value, 'boolean or 0/1');
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
     * @throws ModbusInvalidAddressError, ModbusInvalidQuantityError, etc.
     */
    async writeMultipleCoils(address, values, timeout) {
        if (!Number.isInteger(address) || address < 0 || address > 65535) {
            throw new errors_1.ModbusInvalidAddressError(address);
        }
        if (!Array.isArray(values) || values.length < 1 || values.length > 1968) {
            throw new errors_1.ModbusInvalidQuantityError(values.length, 1, 1968);
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
    async reportSlaveId(timeout) {
        const pdu = functions.buildReportSlaveIdRequest();
        const responsePdu = await this._sendRequest(pdu, timeout);
        return functions.parseReportSlaveIdResponse(responsePdu);
    }
    /**
     * Reads device identification information (Function Code 0x2B / 0x0E).
     * @param timeout - Optional custom timeout in ms
     * @returns Detailed device identification object with object values as strings
     */
    async readDeviceIdentification(timeout) {
        const originalSlaveId = this.slaveId;
        try {
            const pdu = functions.buildReadDeviceIdentificationRequest(0x01, 0x00);
            const responsePdu = await this._sendRequest(pdu, timeout);
            const rawResponse = functions.parseReadDeviceIdentificationResponse(responsePdu);
            if (!rawResponse) {
                this.logger.error('Failed to parse 0x2B response. PDU might be corrupted.');
                throw new Error('Modbus function 0x2B parsing failed');
            }
            const formattedObjects = {};
            if (rawResponse.objects) {
                const decoder = new TextDecoder('windows-1251');
                for (const [key, value] of Object.entries(rawResponse.objects)) {
                    const id = parseInt(key, 10);
                    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
                    formattedObjects[id] = decoder.decode(bytes).replace(/\0/g, '').trim();
                }
            }
            return {
                ...rawResponse,
                objects: formattedObjects,
            };
        }
        finally {
            this.slaveId = originalSlaveId;
        }
    }
}
module.exports = ModbusClient;
//# sourceMappingURL=client.js.map