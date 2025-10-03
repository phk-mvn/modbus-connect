// test-node.js
const ModbusClient = require('./client.js');
const { createTransport } = require('./transport/factory.js');
const logger = require('./logger.js');

const log = logger.createLogger('main');

async function readCompleteFile(client, filename) {
    let allFileData = [];
    let chunkNumber = 0;
    let totalBytesRead = 0;
    
    // Открываем файл
    const fileArchive = await client.openFile(filename, 2000);
    const totalFileSize = fileArchive.fileLength;
    console.log(`Размер файла: ${totalFileSize} байт`);
    
    while (totalBytesRead < totalFileSize) {
        let chunksReadInThisSession = 0;
        
        // Читаем до таймаута
        while (totalBytesRead < totalFileSize) {
            try {
                const chunk = await client.readFileChunk(chunkNumber, 2000);
                console.log(`Порция ${chunkNumber}: размер ${chunk.chunkSize} байт (реальных данных: ${chunk.data.length})`);
                
                allFileData.push(...chunk.data);
                totalBytesRead += chunk.data.length;
                chunkNumber++;
                chunksReadInThisSession++;
                
                console.log(`Прочитано всего: ${totalBytesRead}/${totalFileSize} байт`);
                
                if (totalBytesRead >= totalFileSize) {
                    console.log('Все данные файла прочитаны');
                    return allFileData;
                }
                
                await new Promise(resolve => setTimeout(resolve, 10));
                
            } catch (error) {
                console.error(`Ошибка при чтении порции ${chunkNumber}:`, error.message);
                
                if (error.message.includes('timeout')) {
                    console.log('Переподключаюсь для продолжения чтения...');
                    
                    // Закрываем текущий файл
                    try {
                        await client.closeFile();
                    } catch (e) {
                        // Игнорируем ошибки закрытия
                    }
                    
                    // Открываем заново
                    await client.openFile(filename, 2000);
                    console.log(`Файл снова открыт, продолжаем с порции ${chunkNumber}`);
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    break; // выходим из внутреннего цикла
                }
                
                throw error;
            }
        }
        
        if (chunksReadInThisSession === 0) {
            console.log('Не удалось прочитать ни одной порции в сессии');
            break;
        }
    }
    
    return allFileData;
}

async function main() {
    const transport = await createTransport('node', {
        port: 'COM3',
        baudRate: 9600,
        parity: 'none',
        dataBits: 8,
        stopBits: 1,
    });

    const client = new ModbusClient(transport, 13, {
        timeout: 2000,
        crcAlgorithm: 'crc16Modbus',
        retryCount: 1,
        retryDelay: 100,
    });

    await client.connect();

    try {
        const fileData = await readCompleteFile(client, 'ch1.arh');
        console.log(`Файл ch1.arh полностью прочитан: ${fileData.length} байт`);
        
        await client.closeFile();
    } finally {
        await client.disconnect();
    }
}

main().catch(err => {
    console.error('Fatal error in main:', err);
});