// utils/detect-port-settings.js

const createTransport = require('./factory.js');
const ModbusClient = require('../client.js');

const COMMON_BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const PARITIES = ['none', 'even', 'odd'];
const STOP_BITS = [1, 2];
const DATA_BITS = [7, 8];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attempts to automatically detect the correct port settings (baudRate, parity, stopBits, dataBits)
 * for a Modbus RTU connection using a series of trial and error attempts with different settings.
 *
 * @param {string} transportType - The type of transport, either 'node' or 'web'.
 * @param {object} options - Base options for the transport, must include the path or port.
 * @param {number} slaveId - The ID of the Modbus device, default is 1.
 * @param {Array<number>} baudRates - Optional list of baud rates to try, defaults to COMMON_BAUD_RATES.
 *
 * @returns {object|null} The detected settings if found, otherwise null.
 */
async function detectPortSettings(transportType, options, slaveId = 1, baudRates = COMMON_BAUD_RATES) {
    for (const baudRate of baudRates) {
        for (const parity of PARITIES) {
            for (const stopBits of STOP_BITS) {
                for (const dataBits of DATA_BITS) {
                    const settings = {
                        ...options,
                        baudRate,
                        parity,
                        stopBits,
                        dataBits,
                    };

                    let client;
                    try {
                        const transport = await createTransport(transportType, settings);
                        client = new ModbusClient(transport, slaveId, { timeout: 300 });

                        await client.connect();

                        // Попытка читать первый регистр — если успешно, значит настройки подходят
                        await client.readHoldingRegisters(0, 1);

                        await client.disconnect();

                        return settings;
                    } catch (err) {
                        if (client) {
                            try {
                                await client.disconnect();
                            } catch {}
                        }
                        // Error — игнорируем и пробуем следующую конфигурацию
                    }

                    await delay(100);
                }
            }
        }
    }

    return null;
}

module.exports = {
    detectPortSettings
}