"use strict";
// modbus/types/modbus-types.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.EConnectionErrorType = void 0;
var EConnectionErrorType;
(function (EConnectionErrorType) {
    EConnectionErrorType["UnknownError"] = "Unknown Error";
    EConnectionErrorType["PortClosed"] = "Port closed";
    EConnectionErrorType["Timeout"] = "Timeout";
    EConnectionErrorType["CRCError"] = "CRC Error";
    EConnectionErrorType["ConnectionLost"] = "Connection Lost";
    EConnectionErrorType["DeviceOffline"] = "Device Offline";
    EConnectionErrorType["MaxReconnect"] = "Max reconnect";
    EConnectionErrorType["ManualDisconnect"] = "Manual disconnect";
    EConnectionErrorType["Destroyed"] = "Destroyed";
})(EConnectionErrorType || (exports.EConnectionErrorType = EConnectionErrorType = {}));
//# sourceMappingURL=modbus-types.js.map