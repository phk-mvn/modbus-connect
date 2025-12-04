// test-single-port.js

const ModbusClient = require('./dist/client.js');
const TransportController = require('./dist/transport/transport-controller.js');
const Logger = require('./dist/logger.js');

// Настройка логгера
const logger = new Logger();
logger.setLevel('info');
logger.setLogFormat(['timestamp', 'level', 'logger']);
logger.setCustomFormatter('logger', (value) => value ? `[${value}]` : '');

const testLogger = logger.createLogger('test-single-port');

async function main() {
    const controller = new TransportController();

    // ID нашего единственного транспорта
    const TRANSPORT_ID = 'transport-com3';

    controller.setPortStateHandler((connected, slaveIds, error) => {
        testLogger.info(`[PORT STATUS] ${connected ? 'CONNECTED' : 'DISCONNECTED'} | SlaveIds: [${slaveIds || ''}]`);
    });

    // =================================================================
    // ЭТАП 0: Инициализация Порта с одним устройством (Slave 13)
    // =================================================================
    testLogger.info('>>> [START] Initializing COM3 with Slave 13...');

    await controller.addTransport(
        TRANSPORT_ID, 
        'node', 
        {
            port: 'COM3', // ЕДИНСТВЕННЫЙ ПОРТ
            baudRate: 9600,
            parity: 'none',
            slaveIds: [13], // Пока только 13
            RSMode: 'RS485' // Важно для нескольких устройств
        },
        { maxReconnectAttempts: 3 }
    );

    await controller.connectTransport(TRANSPORT_ID);

    // Создаем клиенты (они привязаны к контроллеру, а не напрямую к порту)
    const client13 = new ModbusClient(controller, 13, { timeout: 500 });
    client13.enableLogger('info')
    // const client122 = new ModbusClient(controller, 122, { timeout: 800 });

    // Определяем задачу для Slave 13 отдельно, чтобы переиспользовать при переподключении
    const taskSlave13 = {
        id: 'poll-slave-13',
        interval: 500,
        fn: () => client13.readHoldingRegisters(0, 2, { type: 'uint16' }),
        onData: (data) => console.log(`[Slave 13] Data:`, data),
        onError: (err) => testLogger.error(`[Slave 13] Error: ${err.message}`)
    };

    // Запускаем опрос 13
    controller.addPollingTask(TRANSPORT_ID, taskSlave13);
    testLogger.info('>>> Polling started for Slave 13');


    // =================================================================
    // ЭТАП 1: Через 5 сек подключаем ВТОРОЕ устройство (Slave 122) в ТОТ ЖЕ порт
    // =================================================================
    // setTimeout(async () => {
    //     try {
    //         testLogger.info('\n>>> [STEP 1] 5 seconds passed. Adding Slave 122 to existing COM3...');

    //         // 1. Сообщаем контроллеру, что на этом транспорте теперь живет и Slave 122
    //         controller.assignSlaveIdToTransport(TRANSPORT_ID, 122);

    //         // 2. Добавляем задачу опроса для нового устройства
    //         controller.addPollingTask(TRANSPORT_ID, {
    //             id: 'poll-slave-122',
    //             interval: 500,
    //             fn: () => client122.readHoldingRegisters(0, 2, { type: 'uint16' }),
    //             onData: (data) => console.log(`[Slave 122] Data:`, data),
    //             onError: (err) => testLogger.error(`[Slave 122] Error: ${err.message}`)
    //         });

    //         testLogger.info('>>> Polling started for Slave 122 (Mixed with Slave 13)');


    //         // =================================================================
    //         // ЭТАП 2: Через 3 сек ОТКЛЮЧАЕМ ПЕРВОЕ устройство (Slave 13)
    //         // =================================================================
    //         setTimeout(() => {
    //             testLogger.info('\n>>> [STEP 2] 3 seconds passed. Removing Slave 13 from COM3...');
                
    //             // 1. Останавливаем/удаляем задачу опроса
    //             controller.removePollingTask(TRANSPORT_ID, 'poll-slave-13');
                
    //             // 2. Удаляем Slave 13 из списка транспорта
    //             // Если не сделать это, потом нельзя будет его добавить обратно
    //             controller.removeSlaveIdFromTransport(TRANSPORT_ID, 13);
                
    //             testLogger.info('>>> Slave 13 removed. Only Slave 122 should be polling now.');


    //             // =================================================================
    //             // ЭТАП 3: Через 4 сек ВОЗВРАЩАЕМ ПЕРВОЕ устройство (Slave 13)
    //             // =================================================================
    //             setTimeout(() => {
    //                 testLogger.info('\n>>> [STEP 3] 4 seconds passed. Re-adding Slave 13 to COM3...');
                    
    //                 try {
    //                     // 1. Снова регистрируем ID на транспорте
    //                     controller.assignSlaveIdToTransport(TRANSPORT_ID, 13);
    //                     testLogger.info('>>> Slave 13 re-assigned to transport.');

    //                     // 2. Снова добавляем задачу
    //                     controller.addPollingTask(TRANSPORT_ID, taskSlave13);
    //                     testLogger.info('>>> Polling restarted for Slave 13.');
    //                     testLogger.info('>>> Both devices should be polling now.');

    //                 } catch (e) {
    //                     testLogger.error(`Failed to reconnect Slave 13: ${e.message}`);
    //                 }

    //             }, 4000); // Ждем 4 секунды

    //         }, 3000); // Ждем 3 секунды

    //     } catch (err) {
    //         testLogger.error('Error in sequence', err);
    //     }
    // }, 5000); // Ждем 5 секунд


    // Статистика
    // setInterval(() => {
    //     try {
    //         const stats = controller.getPollingStats(TRANSPORT_ID);
    //         const run13 = stats['poll-slave-13'] ? stats['poll-slave-13'].totalRuns : 0;
    //         const run122 = stats['poll-slave-122'] ? stats['poll-slave-122'].totalRuns : 0;
            
    //         console.log(`--- STATS [COM3]: Slave 13 Runs: ${run13} | Slave 122 Runs: ${run122} ---`);
    //     } catch(e) {}
    // }, 1000);
}

main().catch(console.error);