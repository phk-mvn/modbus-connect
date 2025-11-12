// test-node.js

const ModbusClient = require('./dist/client.js');
const TransportController = require('./dist/transport/transport-controller.js');
const Logger = require('./dist/logger.js');
const PollingManager = require('./dist/polling-manager.js');

const logger = new Logger();

// Установка глобальных настроек логгера
logger.setLevel('info');
logger.setLogFormat(['timestamp', 'level', 'logger']);
logger.setCustomFormatter('logger', (value) => {
    return value ? `[${value}]` : '';
});

const testLogger = logger.createLogger('test-node.js');
const poll = new PollingManager({ logLevel: 'info' });

async function main() {
    const controller = new TransportController();

    controller.setDeviceStateHandler((slaveId, connected, error) => {
        if (connected) {
            testLogger.info(`[DEVICE] Device ${slaveId} CONNECTED`);
        } else {
            testLogger.warn(`[DEVICE] Device ${slaveId} DISCONNECTED`, { 
                errorType: error?.type, 
                errorMessage: error?.message 
            });
        }
    });

    controller.setPortStateHandler((connected, slaveIds, error) => {
        if (connected) {
            testLogger.info(`[PORT] Port CONNECTED`, { 
                devices: slaveIds && slaveIds.length > 0 ? slaveIds.join(', ') : 'none' 
            });
        } else {
            testLogger.warn(`[PORT] Port DISCONNECTED`, { 
                errorType: error?.type, 
                errorMessage: error?.message 
            });
        }
    });

    await controller.addTransport('com3', 'node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
        slaveIds: [13]
    });

    testLogger.info('Transport added, connecting...');
    await controller.connectAll();
    testLogger.info('Transport connected successfully');

    const client1 = new ModbusClient(controller, 13, {
        timeout: 1000,
        crcAlgorithm: 'crc16Modbus',
        retryCount: Infinity,
        retryDelay: 300,
    });

    await client1.connect();
    client1.enableLogger('info');
    testLogger.info('Client 1 (slaveId 13) connected');

    poll.addTask({
        id: 'modbus-poll-task',
        resourceId: "com3-bus",
        interval: 1000,
        fn: [
            () => client1.readHoldingRegisters(0, 2, { type: 'uint16' }),
        ],
        onData: (results) => {
            // ИСПРАВЛЕНО: Выводим результат, а не массив с результатом.
            console.log("Data received from slave 13:", results[0]);
        },
        onError: (error, index, attempt) => {
            testLogger.error(`Error polling slave 13, attempt ${attempt}`, { 
                error: error.message 
            });
        },
        onStart: () => testLogger.info("Polling for slave 13 started"),
        onStop: () => testLogger.info("Polling for slave 13 stopped"),
        maxRetries: 3, // ИСПРАВЛЕНО: Заменено Infinity на конечное число.
        backoffDelay: 300,
        taskTimeout: 2000
    });

    poll.startTask('modbus-poll-task');
    testLogger.info('Polling task started for slave 13');

    // setTimeout(async () => {
    //     try {
    //         testLogger.info('Stopping current polling task to reconfigure...');
    //         // ИСПРАВЛЕНО: Используем более безопасный паттерн для замены задачи.
    //         // Сначала останавливаем, потом удаляем.
    //         // (Предполагается, что у PollingManager есть асинхронный метод stopTask)
    //         if (poll.getTaskState('modbus-poll-task')?.running) {
    //             await poll.stopTask('modbus-poll-task');
    //         }
    //         poll.removeTask('modbus-poll-task');
            
    //         testLogger.info('Adding slaveId 122 dynamically...');
    //         controller.assignSlaveIdToTransport('com3', 122);

    //         const client2 = new ModbusClient(controller, 122, {
    //             timeout: 1000,
    //             crcAlgorithm: 'crc16Modbus',
    //             retryCount: 3, // ИСПРАВЛЕНО: Заменено Infinity на конечное число.
    //             retryDelay: 300,
    //         });

    //         await client2.connect();
    //         client2.enableLogger('info');
    //         testLogger.info('Client 2 (slaveId 122) connected and ready');

    //         poll.addTask({
    //             id: 'modbus-poll-task',
    //             resourceId: "com3-bus",
    //             interval: 1000,
    //             fn: [
    //                 () => client1.readHoldingRegisters(0, 2, { type: 'uint16' }),
    //                 () => client2.readHoldingRegisters(0, 2, { type: 'uint16' }),
    //             ],
    //             onData: (results) => {
    //                 console.log("Data received from both slaves:", {
    //                     slave13: results[0],
    //                     slave122: results[1]
    //                 });
    //             },
    //             onError: (error, index, attempt) => {
    //                 const clientDesc = index === 0 ? 'slave 13' : 'slave 122';
    //                 testLogger.error(`Error polling ${clientDesc}, attempt ${attempt}`, { 
    //                     error: error.message 
    //                 });
    //             },
    //             onStart: () => testLogger.info('Polling for both slaves started'),
    //             onStop: () => testLogger.info('Polling for both slaves stopped'),
    //             maxRetries: 3, // ИСПРАВЛЕНО: Заменено Infinity на конечное число.
    //             backoffDelay: 300,
    //             taskTimeout: 2000
    //         });

    //         poll.startTask('modbus-poll-task');
    //         testLogger.info('Polling task RESTARTED for both slaves (13 and 122)');
    //     } catch (err) {
    //         testLogger.error('Error adding second client', { error: err.message });
    //     }
    // }, 5000);
}

main().catch(err => {
    testLogger.error('Fatal error in main', { error: err.message, stack: err.stack });
    process.exit(1);
});