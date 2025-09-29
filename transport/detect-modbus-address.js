// utils/detect-modbus-address.js

const createTransport = require('./factory.js');
const ModbusClient = require('../client.js');

const DEFAULT_SLAVE_IDS = Array.from({ length: 247 }, (_, i) => i + 1); // 1..247

/**
 * Detects a Modbus slave address by trying to read a holding register
 * from each address in the given list.
 *
 * @param {string} transportType - Transport type (e.g. 'serialport', 'tcp')
 * @param {object} options - Options for the transport (e.g. serial port name, TCP host/port)
 * @param {number[]} [slaveIds=DEFAULT_SLAVE_IDS] - List of slave IDs to try
 * @return {number|null} - The first slave ID that responded, or null if none did
 */
async function detectModbusAddress(transportType, options, slaveIds = DEFAULT_SLAVE_IDS) {
    let transport;

    try {
        transport = await createTransport(transportType, options);
        await transport.connect();

        for (const slaveId of slaveIds) {
            const client = new ModbusClient(transport, slaveId, { timeout: 200 });

            try {
                await client.readHoldingRegisters(0, 1);
                return slaveId;
            } catch {
                // ignore error repsonse
            }
        }
    } finally {
        if (transport) {
            try {
                await transport.disconnect();
            } catch {}
        }
    }

    return null;
}

module.exports = {
    detectModbusAddress
}