// test-node.js

const ModbusClient = require('./client.js');
const { createTransport } = require('./transport/factory.js');
const logger = require('./logger.js');
const PollingManager = require('./polling-manager.js');

// const poll = new PollingManager()
const log = logger.createLogger('main');

async function main() {

    const transport = await createTransport('node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
        // writeTimeout: 500,
        // readTimeout: 500
    });

    const client = new ModbusClient(transport, 33, {
        timeout: 1000,
        crcAlgorithm: 'crc16Modbus',
        retryCount: 3,             // Кол-во попыток повтора запроса
        retryDelay: 300,           // Задержка между повторами,
    });

    await client.connect();

    const identification = await client.readDeviceIdentification();
    console.log('Identification:', identification);
    
    // poll.addTask({
    //     id: 'modbus-loop',
    //     interval: 1000,
    //     immediate: true,
    //     fn: [
    //       () => client.readHoldingRegisters(0, 2),
    //       () => client.readInputRegisters(4, 2)
    //     ],
    //     onData: ([holding, input]) => {
    //         log.info(JSON.stringify([holding, input]))
    //     },
    //     onError: (error, index, attempt) => {
    //       console.warn(`Error in fn[${index}], attempt ${attempt}: ${error.message}`);
    //     },
    //     onStart: () => console.log('Polling started'),
    //     onStop: () => console.log('Polling stopped'),
    //     maxRetries: 3,
    //     backoffDelay: 300,
    //     taskTimeout: 2000
    // });
}

main().catch(err => {
    console.error('Fatal error in main:', err);
});