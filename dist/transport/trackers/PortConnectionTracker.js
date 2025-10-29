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
var PortConnectionTracker_exports = {};
__export(PortConnectionTracker_exports, {
  PortConnectionTracker: () => PortConnectionTracker
});
module.exports = __toCommonJS(PortConnectionTracker_exports);
var import_async_mutex = require("async-mutex");
var import_modbus_types = require("../../types/modbus-types.js");
class PortConnectionTracker {
  _handler;
  _state;
  _debounceMs;
  _mutex = new import_async_mutex.Mutex();
  _debounceTimeout = null;
  constructor(options = {}) {
    this._debounceMs = options.debounceMs ?? 300;
    this._state = {
      isConnected: false,
      slaveIds: [],
      timestamp: Date.now()
    };
  }
  /**
   * Устанавливает обработчик изменения состояния порта.
   * При установке — вызывает обработчик с текущим состоянием.
   */
  async setHandler(handler) {
    const release = await this._mutex.acquire();
    try {
      this._handler = handler;
      handler(
        this._state.isConnected,
        this._state.slaveIds,
        this._state.isConnected ? void 0 : { type: this._state.errorType, message: this._state.errorMessage }
      );
    } finally {
      release();
    }
  }
  /**
   * Уведомляет о подключении порта.
   * Игнорируется, если порт уже подключён.
   *
   * @param slaveIds — список slaveId, подключённых к порту
   */
  async notifyConnected(slaveIds = []) {
    const release = await this._mutex.acquire();
    try {
      if (this._state.isConnected && arraysEqual(this._state.slaveIds, slaveIds)) {
        return;
      }
      this._state = {
        isConnected: true,
        slaveIds: [...slaveIds],
        timestamp: Date.now()
      };
      if (this._debounceTimeout) {
        clearTimeout(this._debounceTimeout);
        this._debounceTimeout = null;
      }
      this._handler?.(true, this._state.slaveIds);
    } finally {
      release();
    }
  }
  /**
   * Уведомляет об отключении порта с trailing debounce.
   * Последний вызов в серии будет выполнен через `debounceMs`.
   *
   * @param errorType Тип ошибки, по умолчанию: `ConnectionErrorType.UnknownError`
   * @param errorMessage Подробное сообщение, по умолчанию: `'Port disconnected'`
   * @param slaveIds Список slaveId, которые были активны
   */
  notifyDisconnected(errorType = import_modbus_types.ConnectionErrorType.UnknownError, errorMessage = "Port disconnected", slaveIds = []) {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
    }
    this._debounceTimeout = setTimeout(() => {
      this._doNotifyDisconnected(errorType, errorMessage, slaveIds);
    }, this._debounceMs);
  }
  /**
   * Внутренний метод — фактическое уведомление об отключении.
   */
  async _doNotifyDisconnected(errorType, errorMessage, slaveIds) {
    const release = await this._mutex.acquire();
    try {
      if (!this._state.isConnected) return;
      this._state = {
        isConnected: false,
        errorType,
        errorMessage,
        slaveIds: [...slaveIds],
        timestamp: Date.now()
      };
      this._handler?.(false, this._state.slaveIds, { type: errorType, message: errorMessage });
    } finally {
      release();
    }
  }
  /**
   * Возвращает копию текущего состояния порта.
   */
  async getState() {
    const release = await this._mutex.acquire();
    try {
      return { ...this._state, slaveIds: [...this._state.slaveIds] };
    } finally {
      release();
    }
  }
  /**
   * Очищает таймер дебонса и сбрасывает состояние.
   * Вызывается при `destroy()` или полном сбросе.
   */
  async clear() {
    const release = await this._mutex.acquire();
    try {
      if (this._debounceTimeout) {
        clearTimeout(this._debounceTimeout);
        this._debounceTimeout = null;
      }
      this._state = {
        isConnected: false,
        slaveIds: [],
        timestamp: Date.now()
      };
    } finally {
      release();
    }
  }
  /**
   * Проверяет, подключён ли порт.
   */
  async isConnected() {
    const release = await this._mutex.acquire();
    try {
      return this._state.isConnected;
    } finally {
      release();
    }
  }
  /**
   * Сбрасывает таймер дебонса (только для тестов).
   * @internal
   */
  __resetDebounce() {
    if (this._debounceTimeout) {
      clearTimeout(this._debounceTimeout);
      this._debounceTimeout = null;
    }
  }
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PortConnectionTracker
});
