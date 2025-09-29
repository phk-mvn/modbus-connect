// function-codes/index.js

const readHoldingRegisters = require('./read-holding-registers.js');
const readInputRegisters = require('./read-input-registers.js');
const writeSingleRegister = require('./write-single-register.js');
const writeMultipleRegisters = require('./write-multiple-registers.js');
const readCoils = require('./read-coils.js');
const readDiscreteInputs = require('./read-discrete-inputs.js');
const writeSingleCoil = require('./write-single-coil.js');
const writeMultipleCoils = require('./write-multiple-coils.js');
const reportSlaveId = require('./report-slave-id.js');
const readDeviceComment = require('./SGM130/read-device-comment.js');
const writeDeviceComment = require('./SGM130/write-device-comment.js');
const readDeviceIdentification = require('./SGM130/read-device-identification.js');
const readFileLength = require('./SGM130/read-file-length.js');
const openFile = require('./SGM130/openFile.js');
const closeFile = require('./SGM130/closeFile.js');
const restartController = require('./SGM130/restart-controller.js');
const getControllerTime = require('./SGM130/get-controller-time.js');
const setControllerTime = require('./SGM130/set-controller-time.js');

module.exports = {
  // read-holding-registers.js
  buildReadHoldingRegistersRequest: readHoldingRegisters.buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse: readHoldingRegisters.parseReadHoldingRegistersResponse,

  // read-input-registers.js
  buildReadInputRegistersRequest: readInputRegisters.buildReadInputRegistersRequest,
  parseReadInputRegistersResponse: readInputRegisters.parseReadInputRegistersResponse,

  // write-single-register.js
  buildWriteSingleRegisterRequest: writeSingleRegister.buildWriteSingleRegisterRequest,
  parseWriteSingleRegisterResponse: writeSingleRegister.parseWriteSingleRegisterResponse,

  // write-multiple-registers.js
  buildWriteMultipleRegistersRequest: writeMultipleRegisters.buildWriteMultipleRegistersRequest,
  parseWriteMultipleRegistersResponse: writeMultipleRegisters.parseWriteMultipleRegistersResponse,

  // read-coils.js
  buildReadCoilsRequest: readCoils.buildReadCoilsRequest,
  parseReadCoilsResponse: readCoils.parseReadCoilsResponse,

  // read-discrete-inputs.js
  buildReadDiscreteInputsRequest: readDiscreteInputs.buildReadDiscreteInputsRequest,
  parseReadDiscreteInputsResponse: readDiscreteInputs.parseReadDiscreteInputsResponse,

  // write-single-coil.js
  buildWriteSingleCoilRequest: writeSingleCoil.buildWriteSingleCoilRequest,
  parseWriteSingleCoilResponse: writeSingleCoil.parseWriteSingleCoilResponse,

  // write-multiple-coils.js
  buildWriteMultipleCoilsRequest: writeMultipleCoils.buildWriteMultipleCoilsRequest,
  parseWriteMultipleCoilsResponse: writeMultipleCoils.parseWriteMultipleCoilsResponse,

  // report-slave-id.js
  buildReportSlaveIdRequest: reportSlaveId.buildReportSlaveIdRequest,
  parseReportSlaveIdResponse: reportSlaveId.parseReportSlaveIdResponse,

  // SGM130/read-device-comment.js
  buildReadDeviceCommentRequest: readDeviceComment.buildReadDeviceCommentRequest,
  parseReadDeviceCommentResponse: readDeviceComment.parseReadDeviceCommentResponse,

  // SGM130/write-device-comment.js
  buildWriteDeviceCommentRequest: writeDeviceComment.buildWriteDeviceCommentRequest,
  parseWriteDeviceCommentResponse: writeDeviceComment.parseWriteDeviceCommentResponse,

  // SGM130/read-device-identification.js
  buildReadDeviceIdentificationRequest: readDeviceIdentification.buildReadDeviceIdentificationRequest,
  parseReadDeviceIdentificationResponse: readDeviceIdentification.parseReadDeviceIdentificationResponse,

  // SGM130/read-file-length.js
  buildReadFileLengthRequest: readFileLength.buildReadFileLengthRequest,
  parseReadFileLengthResponse: readFileLength.parseReadFileLengthResponse,

  // SGM130/openFile.js
  buildOpenFileRequest: openFile.buildOpenFileRequest,
  parseOpenFileResponse: openFile.parseOpenFileResponse,

  // SGM130/closeFile.js
  buildCloseFileRequest: closeFile.buildCloseFileRequest,
  parseCloseFileResponse: closeFile.parseCloseFileResponse,

  // SGM130/restart-controller.js
  buildRestartControllerRequest: restartController.buildRestartControllerRequest,
  parseRestartControllerResponse: restartController.parseRestartControllerResponse,

  // SGM130/get-controller-time.js
  buildGetControllerTimeRequest: getControllerTime.buildGetControllerTimeRequest,
  parseGetControllerTimeResponse: getControllerTime.parseGetControllerTimeResponse,

  // SGM130/set-controller-time.js
  buildSetControllerTimeRequest: setControllerTime.buildSetControllerTimeRequest,
  parseSetControllerTimeResponse: setControllerTime.parseSetControllerTimeResponse,
};