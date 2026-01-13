const ModbusClient = require('./dist/client.js');
const TransportController = require('./dist/transport/transport-controller.js');

async function main() {
    const controller = new TransportController();
    const TRANSPORT_ID = 'tcp-continuous';

    // 1. Настройка транспорта
    await controller.addTransport(TRANSPORT_ID, 'node-tcp', 
        {
            host: '10.59.43.97', 
            port: 502,
            slaveIds: [101],
        },
        { 
            maxReconnectAttempts: 10, // Увеличим для стабильности
            reconnectInterval: 3000   // Пауза между попытками переподключения
        }
    );

    console.log('>>> Connecting to device...');
    try {
        await controller.connectTransport(TRANSPORT_ID);
        console.log('>>> Connected successfully!');
    } catch (e) {
        console.error('>>> Initial connection failed:', e.message);
        // Не выходим, так как контроллер сам попробует переподключиться
    }

    // 2. Создаем клиент для Unit 101
    const client = new ModbusClient(controller, 101, { framing: 'tcp', timeout: 3000 });
    client.enableLogger('info')
    
    // Отключим дебаг-логи клиента, чтобы не спамить в консоль, 
    // оставим только инфо о данных
    // client.enableLogger('debug'); 

    // 3. Определяем задачу постоянного опроса
    const pollingTask = {
        id: 'task-read-data',
        interval: 1000, // Опрос каждую секунду (1000 мс)
        
        // Сама функция запроса
        fn: () => client.readHoldingRegisters(0, 5, { type: 'uint16' }),
        
        // Коллбэк при успешном получении данных
        onData: (data) => {
            console.log(`[${new Date().toLocaleTimeString()}] Data Received:`, data);
        },
        
        // Коллбэк при ошибке конкретного запроса
        onError: (err) => {
            console.error(`[POLLING ERROR]: ${err.message}`);
        }
    };

    // 4. Запускаем задачу
    console.log('>>> Starting continuous polling...');
    controller.addPollingTask(TRANSPORT_ID, pollingTask);
}

// Перехват сигналов завершения (Ctrl+C), чтобы красиво закрыть сокет
process.on('SIGINT', async () => {
    console.log('\n>>> Stopping polling and disconnecting...');
    // Здесь можно вызвать деструктор или ручной стоп, если нужно
    process.exit();
});

main().catch(console.error);