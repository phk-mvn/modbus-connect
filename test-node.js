// test-node.js

const ModbusClient = require('./client.js');
const { createTransport } = require('./transport/factory.js');
const Logger = require('./logger.js');
const PollingManager = require('./polling-manager.js');

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
        retryCount: 3,
        retryDelay: 300,
    });

    await client.connect();

    poll.addTask({
        id: 'modbus-loop',
        resourceId: "asd",
        interval: 1000,
        immediate: true,
        fn: [
            () => client.readHoldingRegisters(0, 2, { type: 'uint16' }),
            () => client.readInputRegisters(0, 4, { type: 'uint16' })
        ],
        onData: (results) => {
            testLogger.info('Data received:', results);
            console.log(client.diagnostics.getStats())
        },
        onError: (error, index, attempt) => {
            testLogger.error(`Error in fn[${index}], attempt ${attempt}`, { error: error.message });
        },
        onStart: () => testLogger.info('Polling started'),
        onStop: () => testLogger.info('Polling stopped'),
        maxRetries: 3,
        backoffDelay: 300,
        taskTimeout: 2000
    });

    poll.startTask('modbus-loop')
}

main().catch(err => {
    testLogger.error('Fatal error in main', { error: err.message });
});