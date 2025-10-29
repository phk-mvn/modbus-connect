"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var DeviceConnectionTracker_exports = {};
__export(DeviceConnectionTracker_exports, {
  DeviceConnectionTracker: () => DeviceConnectionTracker
});
module.exports = __toCommonJS(DeviceConnectionTracker_exports);
var import_async_mutex = require("async-mutex");
var import_modbus_types = require("../../types/modbus-types.js");
class DeviceConnectionTracker {
  _handler;
  _states = /* @__PURE__ */ new Map();
  _debounceMs;
  _validateSlaveId;
  _mutex = new import_async_mutex.Mutex();
  _debounceTimeouts = /* @__PURE__ */ new Map();
  /**
   * Создаёт экземпляр трекера состояний.
   *
   * @param options Настройки трекера
   * @param options.debounceMs Интервал дебонса уведомлений об отключении (мс), по умолчанию: `500`
   * @param options.validateSlaveId Валидировать `slaveId` (1–255), по умолчанию: `true`
   */
  constructor(options = {}) {
    this._debounceMs = options.debounceMs ?? 500;
    this._validateSlaveId = options.validateSlaveId ?? true;
  }
  /**
   * Устанавливает обработчик изменения состояния устройства.
   * При установке — вызывает обработчик для всех текущих состояний.
   *
   * @param handler Функция: `(slaveId: number, connected: boolean, error?) => void`
   */
  async setHandler(handler) {
    const release = await this._mutex.acquire();
    try {
      this._handler = handler;
      for (const state of this._states.values()) {
        handler(
          state.slaveId,
          state.hasConnectionDevice,
          state.hasConnectionDevice ? void 0 : { type: state.errorType, message: state.errorMessage }
        );
      }
    } finally {
      release();
    }
  }
  /**
   * Удаляет обработчик изменения состояния.
   * После вызова — уведомления прекращаются.
   */
  async removeHandler() {
    const release = await this._mutex.acquire();
    try {
      this._handler = void 0;
    } finally {
      release();
    }
  }
  /**
   * Уведомляет о подключении устройства.
   * Игнорируется, если устройство уже подключено.
   *
   * @param slaveId Идентификатор устройства (1–255)
   */
  async notifyConnected(slaveId) {
    if (this._validateSlaveId && (slaveId < 1 || slaveId > 255)) return;
    const release = await this._mutex.acquire();
    try {
      const existing = this._states.get(slaveId);
      if (existing?.hasConnectionDevice) return;
      const state = {
        slaveId,
        hasConnectionDevice: true
      };
      this._states.set(slaveId, state);
      this._debounceTimeouts.delete(slaveId);
      this._handler?.(slaveId, true);
    } finally {
      release();
    }
  }
  /**
   * Уведомляет об отключении устройства с **trailing debounce**.
   * Последний вызов в серии будет выполнен через `debounceMs`.
   *
   * @param slaveId Идентификатор устройства (1–255)
   * @param errorType Тип ошибки, по умолчанию: `UnknownError`
   * @param errorMessage Подробное сообщение, по умолчанию: `'Device disconnected'`
   */
  notifyDisconnected(slaveId, errorType = import_modbus_types.ConnectionErrorType.UnknownError, errorMessage = "Device disconnected") {
    if (this._validateSlaveId && (slaveId < 1 || slaveId > 255)) return;
    const existingTimeout = this._debounceTimeouts.get(slaveId);
    if (existingTimeout) clearTimeout(existingTimeout);
    const timeout = setTimeout(() => {
      this._debounceTimeouts.delete(slaveId);
      this._doNotifyDisconnected(slaveId, errorType, errorMessage);
    }, this._debounceMs);
    this._debounceTimeouts.set(slaveId, timeout);
  }
  /**
   * Выполняет фактическое уведомление об отключении (внутренний метод).
   */
  async _doNotifyDisconnected(slaveId, errorType, errorMessage) {
    const release = await this._mutex.acquire();
    try {
      const existing = this._states.get(slaveId);
      if (!existing || existing.hasConnectionDevice) {
        const state = {
          slaveId,
          hasConnectionDevice: false,
          errorType,
          errorMessage
        };
        this._states.set(slaveId, state);
        this._handler?.(slaveId, false, { type: errorType, message: errorMessage });
      }
    } finally {
      release();
    }
  }
  /**
   * Возвращает копию состояния конкретного устройства.
   */
  async getState(slaveId) {
    const release = await this._mutex.acquire();
    try {
      const state = this._states.get(slaveId);
      return state ? { ...state } : void 0;
    } finally {
      release();
    }
  }
  /**
   * Возвращает копии всех текущих состояний устройств.
   */
  async getAllStates() {
    const release = await this._mutex.acquire();
    try {
      return Array.from(
        this._states.values(),
        ({ slaveId, hasConnectionDevice, errorType, errorMessage }) => ({
          slaveId,
          hasConnectionDevice,
          errorType,
          errorMessage
        })
      );
    } finally {
      release();
    }
  }
  /**
   * Очищает все состояния и отменяет все таймеры дебонса.
   */
  async clear() {
    const release = await this._mutex.acquire();
    try {
      this._states.clear();
      this._debounceTimeouts.forEach(clearTimeout);
      this._debounceTimeouts.clear();
      this._handler = void 0;
    } finally {
      release();
    }
  }
  /**
   * Проверяет, отслеживается ли устройство.
   */
  hasState(slaveId) {
    return this._states.has(slaveId);
  }
  /**
   * Возвращает список `slaveId` всех подключённых устройств.
   */
  getConnectedSlaveIds() {
    return Array.from(this._states.entries()).filter(([, s]) => s.hasConnectionDevice).map(([id]) => id);
  }
  /**
   * Сбрасывает таймер дебонса для указанного устройства.
   * **Только для тестов.**
   *
   * @internal
   */
  __resetDebounce(slaveId) {
    const timeout = this._debounceTimeouts.get(slaveId);
    if (timeout) clearTimeout(timeout);
    this._debounceTimeouts.delete(slaveId);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeviceConnectionTracker
});
