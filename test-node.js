// test-node.js

const ModbusClient = require('./dist/client.js');
const TransportController = require('./dist/transport/transport-controller.js');
const Logger = require('./dist/logger.js');
const PollingManager = require('./dist/polling-manager.js');

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
    const controller = new TransportController();

    // Добавляем транспорт, обслуживает только slaveId = 13
    await controller.addTransport('com3', 'node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
        slaveIds: [13]
    });

    // Подключаем транспорт
    await controller.connectAll();

    // Создаём и подключаем первый клиент
    const client1 = new ModbusClient(controller, 13, {
        timeout: 1000,
        crcAlgorithm: 'crc16Modbus',
        retryCount: Infinity,
        retryDelay: 300,
    });

    await client1.connect();
    client1.enableLogger('info');

    // Задача для первого клиента
    poll.addTask({
        id: 'modbus-loop',
        resourceId: "slave",
        interval: 1000,
        fn: [
            () => client1.readHoldingRegisters(0, 2, { type: 'uint16' }),
        ],
        onData: (results) => {
            console.log("Data received from slave's:", results);
        },
        onError: (error, index, attempt) => {
            testLogger.error(`Error in fn[${index}] for slave's, attempt ${attempt}`, { error: error.message });
        },
        onStart: () => testLogger.info("Polling for slave's started"),
        onStop: () => testLogger.info("Polling for slave's stopped"),
        maxRetries: Infinity,
        backoffDelay: 300,
        taskTimeout: 2000
    });

    poll.startTask('modbus-loop');

    console.log('Client 1 (slaveId 13) connected and running...');

    // Представим, что через 5 секунд мы хотим добавить ещё один slaveId = 122
    setTimeout(async () => {
        poll.removeTask('modbus-loop')
        console.log('Adding slaveId 122 dynamically...');

        // Назначаем slaveId 122 транспорту 'com3'
        controller.assignSlaveIdToTransport('com3', 122);

        // Создаём второй клиент
        const client2 = new ModbusClient(controller, 122, {
            timeout: 1000,
            crcAlgorithm: 'crc16Modbus',
            retryCount: Infinity,
            retryDelay: 300,
        });

        await client2.connect();
        client2.enableLogger('info');

        console.log('Client 2 (slaveId 122) connected and ready.');

        // Добавляем задачу для второго клиента
        poll.addTask({
            id: 'modbus-loop',
            resourceId: "slave",
            interval: 1000,
            fn: [
                () => client1.readHoldingRegisters(0, 2, { type: 'uint16' }),
                () => client2.readHoldingRegisters(0, 2, { type: 'uint16' }),
            ],
            onData: (results) => {
                console.log("Data received from slave 122:", results);
            },
            onError: (error, index, attempt) => {
                testLogger.error(`Error in fn[${index}] for slave 122, attempt ${attempt}`, { error: error.message });
            },
            onStart: () => testLogger.info('Polling for slave 122 started'),
            onStop: () => testLogger.info('Polling for slave 122 stopped'),
            maxRetries: Infinity,
            backoffDelay: 300,
            taskTimeout: 2000
        });

        poll.startTask('modbus-loop');

    }, 5000);
}

main().catch(err => {
    testLogger.error('Fatal error in main', { error: err.message });
});