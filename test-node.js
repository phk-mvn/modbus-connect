// test-plugin.js (обновленный)

const ModbusClient = require('./dist/client.js');
const TransportController = require('./dist/transport/transport-controller.js');
const Logger = require('./dist/logger.js');
// PollingManager не используется, можно убрать
// const PollingManager = require('./dist/polling-manager.js');
const { SGMFilePlugin } = require('./sgm-file-plugin.js');

const logger = new Logger();
logger.setLevel('info');
logger.setLogFormat(['timestamp', 'level', 'logger']);
logger.setCustomFormatter('logger', (value) => (value ? `[${value}]` : ''));
const testLogger = logger.createLogger('test-plugin.js');

async function main() {
    const controller = new TransportController();

    try {
        await controller.addTransport('com3', 'node', {
            port: 'COM3',
            baudRate: 9600,
            RSMode: 'RS232'
        });
        
        await controller.connectAll();
        testLogger.info('Transport connected successfully');

        const client = new ModbusClient(controller, 13, {
            timeout: 1000,
            retryCount: 2,
            retryDelay: 300,
            RSMode: 'RS232',
            plugins: [ SGMFilePlugin ]
        });
        client.enableLogger('debug');

        testLogger.info(`Plugin "${new SGMFilePlugin().name}" was registered via constructor.`);

        // --- ВЫЗОВ ФУНКЦИИ #1: readFileLength ---
        const filename = 'ch1.arh';
        console.log(`Executing custom function 'readFileLength' with filename: "${filename}"...`);

        const fileLength = await client.executeCustomFunction('readFileLength', filename);

        if (fileLength === -1) {
            console.log(`>>> [SUCCESS] The device reported that file "${filename}" was not found.`);
        } else {
            console.log(`>>> [SUCCESS] The length of file "${filename}" is: ${fileLength} bytes.`);
        }
        
        // =================================================================
        // ✨ ШАГ 3: ВЫЗЫВАЕМ ВТОРУЮ КАСТОМНУЮ ФУНКЦИЮ
        // =================================================================
        console.log("Executing custom function 'getControllerTime'...");
        
        const controllerTime = await client.executeCustomFunction('getControllerTime');
        
        console.log(`>>> [SUCCESS] Controller time received:`, controllerTime);

    } catch (err) {
        console.log('[FAILURE] An error occurred during the test.', { 
            error: err.message, 
        });
    } finally {
        console.log('Disconnecting transport...');
        await controller.disconnectAll();
        console.log('Transport disconnected.');
    }
}

main().catch(err => {
    testLogger.error('Fatal error in main', { error: err.message });
    process.exit(1);
});

// // test-node.js

// const ModbusClient = require('./dist/client.js');
// const TransportController = require('./dist/transport/transport-controller.js');
// const Logger = require('./dist/logger.js');
// const PollingManager = require('./dist/polling-manager.js');

// const logger = new Logger();

// logger.setLevel('info');
// logger.setLogFormat(['timestamp', 'level', 'logger']);
// logger.setCustomFormatter('logger', (value) => {
//     return value ? `[${value}]` : '';
// });

// const testLogger = logger.createLogger('test-node.js');
// const poll = new PollingManager({ logLevel: 'info' });

// async function main() {
//     const controller = new TransportController();

//     controller.setDeviceStateHandler((slaveId, connected, error) => {
//         if (connected) {
//             testLogger.info(`[DEVICE] Device ${slaveId} CONNECTED`);
//         } else {
//             testLogger.warn(`[DEVICE] Device ${slaveId} DISCONNECTED`, { 
//                 errorType: error?.type, 
//                 errorMessage: error?.message 
//             });
//         }
//     });

//     controller.setPortStateHandler((connected, slaveIds, error) => {
//         if (connected) {
//             testLogger.info(`[PORT] Port CONNECTED`, { 
//                 devices: slaveIds && slaveIds.length > 0 ? slaveIds.join(', ') : 'none' 
//             });
//         } else {
//             testLogger.warn(`[PORT] Port DISCONNECTED`, { 
//                 errorType: error?.type, 
//                 errorMessage: error?.message 
//             });
//         }
//     });

//     // --- ШАГ 1: Создаем транспорт в режиме RS485 ---
//     await controller.addTransport('com3', 'node', {
//         port: 'COM3',
//         baudRate: 9600,
//         parity: 'none',
//         dataBits: 8,
//         stopBits: 1,
//         slaveIds: [13],
//         RSMode: 'RS232' // Явно указываем режим
//     });

//     testLogger.info("Transport 'com3' (RS485) added, connecting...");
//     await controller.connectAll();
//     testLogger.info('Transport connected successfully');

//     // --- ШАГ 2: Создаем первого клиента ---
//     const client1 = new ModbusClient(controller, 13, {
//         timeout: 1000,
//         crcAlgorithm: 'crc16Modbus',
//         retryCount: 3,
//         retryDelay: 300,
//         RSMode: 'RS232'
//     });

//     await client1.connect();
//     client1.enableLogger('info');
//     testLogger.info('Client 1 (slaveId 13) connected');

//     // --- ШАГ 3: Запускаем опрос первого клиента ---
//     poll.addTask({
//         id: 'initial-poll',
//         resourceId: "com3",
//         interval: 1000,
//         fn: [() => client1.readHoldingRegisters(0, 2, { type: 'uint16' })],
//         onData: (results) => {
//             console.log("Data received from slave 13:", results[0]);
//         },
//         onError: (error) => {
//             testLogger.error('Error polling slave 13', { error: error.message });
//         },
//     });
//     poll.startTask('initial-poll');
//     testLogger.info('Polling task started for slave 13');

//     // --- ШАГ 4: Через 5 секунд ДОБАВЛЯЕМ второе устройство ---
//     setTimeout(async () => {
//         try {
//             testLogger.info('\n--- [TEST] Attempting to add slaveId 122 to RS485 transport... ---');
            
//             // Эта строка должна УСПЕШНО выполниться
//             controller.assignSlaveIdToTransport('com3', 122);
//             testLogger.info('>>> [PASSED] Successfully assigned slaveId 122 to RS485 transport.');

//             // Останавливаем и удаляем старую задачу опроса
//             poll.stopTask('initial-poll');
//             poll.removeTask('initial-poll');

//             // Создаем второго клиента
//             const client2 = new ModbusClient(controller, 122, {
//                 timeout: 1000,
//                 crcAlgorithm: 'crc16Modbus',
//                 retryCount: 3,
//                 retryDelay: 300,
//                 RSMode: 'RS485'
//             });
//             await client2.connect();
//             client2.enableLogger('info');
//             testLogger.info('Client 2 (slaveId 122) connected');

//             // Создаем новую задачу для опроса ДВУХ устройств
//             poll.addTask({
//                 id: 'multi-poll',
//                 resourceId: "com3",
//                 interval: 1000,
//                 fn: [
//                     () => client1.readHoldingRegisters(0, 2, { type: 'uint16' }),
//                     () => client2.readHoldingRegisters(0, 2, { type: 'uint16' })
//                 ],
//                 onData: (results) => {
//                     console.log("Data from multi-poll:", { slave13: results[0], slave122: results[1] });
//                 },
//                 onError: (error, index) => {
//                     const clientDesc = index === 0 ? 'slave 13' : 'slave 122';
//                     testLogger.error(`Error polling ${clientDesc}`, { error: error.message });
//                 },
//             });
//             poll.startTask('multi-poll');
//             testLogger.info('Polling task restarted for both slaves (13 and 122)');

//         } catch (err) {
//             // Если мы попали сюда в режиме RS485 - это провал
//             testLogger.error(`[FAILED] ${err.message}`);
//         }
//     }, 5000);
// }

// main().catch(err => {
//     testLogger.error('Fatal error in main', { error: err.message, stack: err.stack });
//     process.exit(1);
// });