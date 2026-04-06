// modbus/function-codes/functions.ts

// ====================== READ COILS (0x01) ======================

export const buildReadCoilsRequest = (startAddress: number, quantity: number): Uint8Array => {
  const pdu = new Uint8Array(5);
  pdu[0] = 0x01;
  pdu[1] = (startAddress >> 8) & 0xff;
  pdu[2] = startAddress & 0xff;
  pdu[3] = (quantity >> 8) & 0xff;
  pdu[4] = quantity & 0xff;
  return pdu;
};

export const parseReadCoilsResponse = (pdu: Uint8Array, expectedQuantity: number): boolean[] => {
  if (pdu.length < 2 || pdu[0] !== 0x01) throw new Error('Invalid ReadCoils PDU');
  const byteCount = pdu[1]!;
  const result: boolean[] = new Array(expectedQuantity);
  let bitIndex = 0;

  for (let i = 0; i < byteCount && bitIndex < expectedQuantity; i++) {
    const byte = pdu[2 + i]!;
    for (let bit = 0; bit < 8 && bitIndex < expectedQuantity; bit++) {
      result[bitIndex++] = (byte & (1 << bit)) !== 0;
    }
  }
  return result;
};

// ====================== READ DISCRETE INPUTS (0x02) ======================

export const buildReadDiscreteInputsRequest = (
  startAddress: number,
  quantity: number
): Uint8Array => {
  const pdu = new Uint8Array(5);
  pdu[0] = 0x02;
  pdu[1] = (startAddress >> 8) & 0xff;
  pdu[2] = startAddress & 0xff;
  pdu[3] = (quantity >> 8) & 0xff;
  pdu[4] = quantity & 0xff;
  return pdu;
};

export const parseReadDiscreteInputsResponse = (
  pdu: Uint8Array,
  expectedQuantity: number
): boolean[] => {
  if (pdu.length < 2 || pdu[0] !== 0x02) throw new Error('Invalid ReadDiscreteInputs PDU');
  const byteCount = pdu[1]!;
  const result: boolean[] = new Array(expectedQuantity);
  let bitIndex = 0;

  for (let i = 0; i < byteCount && bitIndex < expectedQuantity; i++) {
    const byte = pdu[2 + i]!;
    for (let bit = 0; bit < 8 && bitIndex < expectedQuantity; bit++) {
      result[bitIndex++] = (byte & (1 << bit)) !== 0;
    }
  }
  return result;
};

// ====================== READ HOLDING REGISTERS (0x03) ======================

export const buildReadHoldingRegistersRequest = (
  startAddress: number,
  quantity: number
): Uint8Array => {
  const pdu = new Uint8Array(5);
  pdu[0] = 0x03;
  pdu[1] = (startAddress >> 8) & 0xff;
  pdu[2] = startAddress & 0xff;
  pdu[3] = (quantity >> 8) & 0xff;
  pdu[4] = quantity & 0xff;
  return pdu;
};

export const parseReadHoldingRegistersResponse = (pdu: Uint8Array): number[] => {
  if (pdu.length < 2 || pdu[0] !== 0x03) throw new Error('Invalid ReadHoldingRegisters PDU');
  const byteCount = pdu[1]!;
  const regCount = Math.floor(byteCount / 2);
  const result: number[] = new Array(regCount);

  for (let i = 0; i < regCount; i++) {
    result[i] = (pdu[2 + i * 2]! << 8) | pdu[3 + i * 2]!;
  }
  return result;
};

// ====================== READ INPUT REGISTERS (0x04) ======================

export const buildReadInputRegistersRequest = (
  startAddress: number,
  quantity: number
): Uint8Array => {
  const pdu = new Uint8Array(5);
  pdu[0] = 0x04;
  pdu[1] = (startAddress >> 8) & 0xff;
  pdu[2] = startAddress & 0xff;
  pdu[3] = (quantity >> 8) & 0xff;
  pdu[4] = quantity & 0xff;
  return pdu;
};

export const parseReadInputRegistersResponse = (pdu: Uint8Array): number[] => {
  if (pdu.length < 2 || pdu[0] !== 0x04) throw new Error('Invalid ReadInputRegisters PDU');
  const byteCount = pdu[1]!;
  const regCount = Math.floor(byteCount / 2);
  const result: number[] = new Array(regCount);

  for (let i = 0; i < regCount; i++) {
    result[i] = (pdu[2 + i * 2]! << 8) | pdu[3 + i * 2]!;
  }
  return result;
};

// ====================== WRITE SINGLE COIL (0x05) ======================

export const buildWriteSingleCoilRequest = (address: number, value: boolean): Uint8Array => {
  const pdu = new Uint8Array(5);
  const coilRaw = value ? 0xff00 : 0x0000;
  pdu[0] = 0x05;
  pdu[1] = (address >> 8) & 0xff;
  pdu[2] = address & 0xff;
  pdu[3] = (coilRaw >> 8) & 0xff;
  pdu[4] = coilRaw & 0xff;
  return pdu;
};

export const parseWriteSingleCoilResponse = (
  pdu: Uint8Array
): { startAddress: number; value: boolean } => {
  if (pdu.length < 5 || pdu[0] !== 0x05) throw new Error('Invalid WriteSingleCoil PDU');
  return {
    startAddress: (pdu[1]! << 8) | pdu[2]!,
    value: ((pdu[3]! << 8) | pdu[4]!) === 0xff00,
  };
};

// ====================== WRITE SINGLE REGISTER (0x06) ======================

export const buildWriteSingleRegisterRequest = (address: number, value: number): Uint8Array => {
  const pdu = new Uint8Array(5);
  pdu[0] = 0x06;
  pdu[1] = (address >> 8) & 0xff;
  pdu[2] = address & 0xff;
  pdu[3] = (value >> 8) & 0xff;
  pdu[4] = value & 0xff;
  return pdu;
};

export const parseWriteSingleRegisterResponse = (
  pdu: Uint8Array
): { startAddress: number; value: number } => {
  if (pdu.length < 5 || pdu[0] !== 0x06) throw new Error('Invalid WriteSingleRegister PDU');
  return {
    startAddress: (pdu[1]! << 8) | pdu[2]!,
    value: (pdu[3]! << 8) | pdu[4]!,
  };
};

// ====================== WRITE MULTIPLE COILS (0x0F) ======================

export const buildWriteMultipleCoilsRequest = (address: number, values: boolean[]): Uint8Array => {
  const quantity = values.length;
  const byteCount = Math.ceil(quantity / 8);
  const pdu = new Uint8Array(6 + byteCount);

  pdu[0] = 0x0f;
  pdu[1] = (address >> 8) & 0xff;
  pdu[2] = address & 0xff;
  pdu[3] = (quantity >> 8) & 0xff;
  pdu[4] = quantity & 0xff;
  pdu[5] = byteCount;

  for (let i = 0; i < quantity; i++) {
    if (values[i]) {
      pdu[6 + Math.floor(i / 8)] |= 1 << (i % 8);
    }
  }
  return pdu;
};

export const parseWriteMultipleCoilsResponse = (
  pdu: Uint8Array
): { startAddress: number; quantity: number } => {
  if (pdu.length < 5 || pdu[0] !== 0x0f) throw new Error('Invalid WriteMultipleCoils PDU');
  return {
    startAddress: (pdu[1]! << 8) | pdu[2]!,
    quantity: (pdu[3]! << 8) | pdu[4]!,
  };
};

// ====================== WRITE MULTIPLE REGISTERS (0x10) ======================

export const buildWriteMultipleRegistersRequest = (
  address: number,
  values: number[]
): Uint8Array => {
  const quantity = values.length;
  const byteCount = quantity * 2;
  const pdu = new Uint8Array(6 + byteCount);

  pdu[0] = 0x10;
  pdu[1] = (address >> 8) & 0xff;
  pdu[2] = address & 0xff;
  pdu[3] = (quantity >> 8) & 0xff;
  pdu[4] = quantity & 0xff;
  pdu[5] = byteCount;

  for (let i = 0; i < quantity; i++) {
    const val = values[i] || 0;
    pdu[6 + i * 2] = (val >> 8) & 0xff;
    pdu[7 + i * 2] = val & 0xff;
  }
  return pdu;
};

export const parseWriteMultipleRegistersResponse = (
  pdu: Uint8Array
): { startAddress: number; quantity: number } => {
  if (pdu.length < 5 || pdu[0] !== 0x10) throw new Error('Invalid WriteMultipleRegisters PDU');
  return {
    startAddress: (pdu[1]! << 8) | pdu[2]!,
    quantity: (pdu[3]! << 8) | pdu[4]!,
  };
};

// ====================== REPORT SLAVE ID (0x11) ======================

export const buildReportSlaveIdRequest = (): Uint8Array => {
  return new Uint8Array([0x11]);
};

export const parseReportSlaveIdResponse = (
  pdu: Uint8Array
): { slaveId: number; isRunning: boolean; data: Uint8Array } => {
  if (pdu.length < 4 || pdu[0] !== 0x11) throw new Error('Invalid ReportSlaveID PDU');
  const byteCount = pdu[1]!;
  return {
    slaveId: pdu[2]!,
    isRunning: pdu[3] === 0xff,
    data: byteCount > 2 ? pdu.slice(4, 2 + byteCount) : new Uint8Array(0),
  };
};

// ====================== READ DEVICE IDENTIFICATION (0x2B) ======================

export const buildReadDeviceIdentificationRequest = (
  categoryId: number,
  objectId: number
): Uint8Array => {
  const pdu = new Uint8Array(4);
  pdu[0] = 0x2b;
  pdu[1] = 0x0e;
  pdu[2] = categoryId & 0xff;
  pdu[3] = objectId & 0xff;
  return pdu;
};

export const parseReadDeviceIdentificationResponse = (pdu: Uint8Array): any => {
  if (pdu.length < 7 || pdu[0] !== 0x2b) return null;
  const res: any = {
    functionCode: pdu[0],
    meiType: pdu[1],
    category: pdu[2],
    conformityLevel: pdu[3],
    moreFollows: pdu[4],
    nextObjectId: pdu[5],
    numberOfObjects: pdu[6],
    objects: {},
  };

  let offset = 7;
  const numObj = pdu[6]!;
  for (let i = 0; i < numObj && offset + 2 <= pdu.length; i++) {
    const id = pdu[offset]!;
    const len = pdu[offset + 1]!;
    offset += 2;
    if (offset + len > pdu.length) break;
    res.objects[id] = pdu.slice(offset, offset + len);
    offset += len;
  }
  return res;
};

// Final Isomorphic Export Default for Vite/ESM compatibility
export default {
  buildReadCoilsRequest,
  parseReadCoilsResponse,
  buildReadDiscreteInputsRequest,
  parseReadDiscreteInputsResponse,
  buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse,
  buildReadInputRegistersRequest,
  parseReadInputRegistersResponse,
  buildWriteSingleCoilRequest,
  parseWriteSingleCoilResponse,
  buildWriteSingleRegisterRequest,
  parseWriteSingleRegisterResponse,
  buildWriteMultipleCoilsRequest,
  parseWriteMultipleCoilsResponse,
  buildWriteMultipleRegistersRequest,
  parseWriteMultipleRegistersResponse,
  buildReportSlaveIdRequest,
  parseReportSlaveIdResponse,
  buildReadDeviceIdentificationRequest,
  parseReadDeviceIdentificationResponse,
};
