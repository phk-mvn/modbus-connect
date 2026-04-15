"use strict";
// modbus/transport/modules/transport-factory.ts
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportFactory = void 0;
/**
 * TransportFactory is a static factory class responsible for creating
 * different types of transport implementations (serial, TCP, WebSerial, emulators, etc.).
 *
 * It encapsulates the logic for dynamic imports of transport modules to keep the
 * bundle size optimized and provides a unified interface for transport initialization.
 */
class TransportFactory {
    /**
     * Creates and returns a transport instance based on the specified type.
     *
     * This method performs the following steps:
     * 1. Validates required options for the specific transport type.
     * 2. Dynamically imports the required transport class.
     * 3. Instantiates the transport with provided options.
     * 4. Automatically attaches a TrafficSniffer instance if one is provided.
     *
     * @param type - Type of transport to create ('node-rtu', 'node-tcp', 'web-rtu', 'rtu-emulator', 'tcp-emulator').
     * @param options - Configuration options specific to the chosen transport (e.g., port, baudRate, host).
     * @param logger - Pino logger instance for internal transport diagnostics.
     * @param sniffer - Optional TrafficSniffer instance to monitor and analyze raw traffic on this transport.
     * @returns A Promise that resolves to an implementation of the ITransport interface.
     * @throws Error if required options are missing or the transport type is unknown.
     */
    static async create(type, options, logger, sniffer = null) {
        const factoryLogger = logger.child({ component: 'TransportFactory' });
        try {
            let transport;
            switch (type) {
                case 'node-rtu': {
                    const path = options.port || options.path;
                    if (!path) {
                        throw new Error('Missing "port" (or "path") option for node transport');
                    }
                    const NodeSerialTransport = (await Promise.resolve().then(() => __importStar(require('../node-transports/node-rtu.js')))).default;
                    const nodeOptions = {};
                    const allowedNodeKeys = [
                        'baudRate',
                        'dataBits',
                        'stopBits',
                        'parity',
                        'readTimeout',
                        'writeTimeout',
                        'maxBufferSize',
                        'reconnectInterval',
                        'maxReconnectAttempts',
                        'RSMode',
                    ];
                    for (const key of allowedNodeKeys) {
                        if (key in options) {
                            nodeOptions[key] = options[key];
                        }
                    }
                    transport = new NodeSerialTransport(path, nodeOptions);
                    break;
                }
                case 'node-tcp': {
                    const host = options.host;
                    const port = options.port || 502;
                    if (!host) {
                        throw new Error('Missing "host" option for node-tcp transport');
                    }
                    const NodeTcpTransport = (await Promise.resolve().then(() => __importStar(require('../node-transports/node-tcp.js')))).default;
                    const tcpOptions = {};
                    const allowedTcpKeys = [
                        'readTimeout',
                        'writeTimeout',
                        'maxBufferSize',
                        'reconnectInterval',
                        'maxReconnectAttempts',
                    ];
                    for (const key of allowedTcpKeys) {
                        if (key in options) {
                            tcpOptions[key] = options[key];
                        }
                    }
                    transport = new NodeTcpTransport(host, port, tcpOptions);
                    break;
                }
                case 'web-rtu': {
                    const port = options.port;
                    if (!port)
                        throw new Error('Missing "port" options for web transport');
                    const WebSerialTransport = (await Promise.resolve().then(() => __importStar(require('../web-transports/web-rtu.js')))).default;
                    const portFactory = async () => {
                        if (port.readable || port.writable) {
                            await port.close();
                        }
                        return port;
                    };
                    const webOptions = {};
                    const allowedWebKeys = [
                        'baudRate',
                        'dataBits',
                        'stopBits',
                        'parity',
                        'readTimeout',
                        'writeTimeout',
                        'reconnectInterval',
                        'maxReconnectAttempts',
                        'maxEmptyReadsBeforeReconnect',
                        'RSMode',
                    ];
                    for (const key of allowedWebKeys) {
                        if (key in options) {
                            webOptions[key] = options[key];
                        }
                    }
                    transport = new WebSerialTransport(portFactory, webOptions);
                    break;
                }
                case 'rtu-emulator': {
                    const RtuEmulatorTransport = (await Promise.resolve().then(() => __importStar(require('../emulator-transports/rtu-emulator.js'))))
                        .default;
                    const opts = {
                        slaveId: options.slaveId || 1,
                        responseLatencyMs: options.responseLatencyMs || 5,
                        loggerEnabled: options.loggerEnabled !== false,
                        initialRegisters: options.initialRegisters,
                    };
                    transport = new RtuEmulatorTransport(opts);
                    break;
                }
                case 'tcp-emulator': {
                    const TcpEmulatorTransport = (await Promise.resolve().then(() => __importStar(require('../emulator-transports/tcp-emulator.js'))))
                        .default;
                    const emulatorOptions = {
                        slaveId: options.slaveId || 1,
                        responseLatencyMs: options.responseLatencyMs || 0,
                        loggerEnabled: options.loggerEnabled !== false,
                        initialRegisters: options.initialRegisters,
                        RSMode: options.RSMode || 'TCP/IP',
                    };
                    factoryLogger.info(`Creating emulator transport for slaveId ${emulatorOptions.slaveId}`);
                    transport = new TcpEmulatorTransport(emulatorOptions);
                    break;
                }
                default:
                    throw new Error(`Unknown transport type ${type}`);
            }
            if (sniffer && transport) {
                transport.setSniffer(sniffer);
            }
            return transport;
        }
        catch (err) {
            factoryLogger.error({ transportType: type, error: err.message }, 'Failed to create transport');
            throw err;
        }
    }
}
exports.TransportFactory = TransportFactory;
//# sourceMappingURL=transport-factory.js.map