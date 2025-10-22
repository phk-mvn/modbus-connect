// test-node.js

const ModbusClient = require('./dist/client.js')
const { createTransport } = require('./dist/transport/factory.js')
const Logger = require('./dist/logger.js')
const PollingManager = require('./dist/polling-manager.js')

const logger = new Logger();

// Установка глобальных настроек логгера
logger.setLevel('info');
// Настройка формата лога: timestamp, level, logger
logger.setLogFormat(['timestamp', 'level', 'logger']);
// Устанавливаем кастомный форматтер для logger
logger.setCustomFormatter('logger', (value) => {
    return value ? `[${value}]` : '';
});

// Создаем именованный логгер и сохраняем ссылку на него
const testLogger = logger.createLogger('test-node.js');

const poll = new PollingManager({ logLevel: 'info' });

async function main() {
    const transport = await createTransport('node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
    });

    const client = new ModbusClient(transport, 13, {
        timeout: 1000,
        crcAlgorithm: 'crc16Modbus',
        retryCount: Infinity,
        retryDelay: 300,
    });

    await client.connect();
    client.enableLogger('info')

    poll.addTask({
        id: 'modbus-loop',
        resourceId: "asd",
        interval: 1000,
        fn: [
            () => client.readHoldingRegisters(0, 2, { type: 'uint16' }),
        ],
        onData: (results) => {
            console.log('Data received:', results);
        },
        onError: (error, index, attempt) => {
            testLogger.error(`Error in fn[${index}], attempt ${attempt}`, { error: error.message });
        },
        onStart: () => testLogger.info('Polling started'),
        onStop: () => testLogger.info('Polling stopped'),
        maxRetries: Infinity,
        backoffDelay: 300,
        taskTimeout: 2000
    });

    poll.startTask('modbus-loop')

    // transport.onDeviceStateChange((connected) => {
    //     console.log('🌐 Device :', connected ? '🟢 ONLINE' : '🔴 OFFLINE');
    // })
}

main().catch(err => {
    testLogger.error('Fatal error in main', { error: err.message });
});