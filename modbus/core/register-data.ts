// modbus/core/register-data.ts

type TWordOrder = 'BE' | 'LE';

/**
 * RegisterData wraps an array of 16-bit Modbus register values and provides
 * type-conversion and sub-selection methods.
 *
 * Extends Array<number> so existing code (index access, .length, .map, etc.)
 * continues to work without changes.
 */
class RegisterData extends Array<number> {
  /**
   * Creates a RegisterData from a plain number[] returned by the protocol parser.
   * Uses push() to avoid Array constructor ambiguity: new Array(0) creates []
   * instead of [0], so spreading [0] into super() breaks.
   */
  static from(registers: number[]): RegisterData {
    const instance = new RegisterData();
    instance.push(...registers);
    return instance;
  }

  constructor(...args: number[]) {
    super(...args);
    Object.setPrototypeOf(this, RegisterData.prototype);
  }

  // ── Sub-selection ───────────────────────────────────────────

  /**
   * Returns a new RegisterData containing `count` registers starting at `offset`.
   * If `count` is omitted, selects 1 register.
   */
  sub(offset: number, count?: number): RegisterData {
    const len = count ?? 1;
    if (offset < 0 || offset + len > this.length) {
      throw new RangeError(`sub(${offset}, ${len}) out of range for ${this.length} registers`);
    }
    return RegisterData.from(this.slice(offset, offset + len) as number[]);
  }

  /**
   * Returns a new RegisterData containing only the registers at the specified indices.
   * Indices can be non-contiguous — the order you pass determines the order in the result.
   *
   * **Important**: For multi-register conversions (UInt32, Int32, Float32, Float64),
   * the order of indices determines the word order. For example, `.pick(1, 0)` with
   * `asFloat32()` will treat register 1 as the high word and register 0 as the low word
   * (equivalent to word-swap / LE word order).
   */
  pick(...indices: number[]): RegisterData {
    if (indices.length === 0) {
      throw new RangeError('pick() requires at least one index');
    }
    for (const idx of indices) {
      if (idx < 0 || idx >= this.length) {
        throw new RangeError(`pick index ${idx} out of range for ${this.length} registers`);
      }
    }
    return RegisterData.from(indices.map(i => this[i]!));
  }

  // ── Array conversions ──────────────────────────────────────

  /** Each register as unsigned 16-bit (identity — same as raw values). */
  asUInt16(): number[] {
    return Array.from(this);
  }

  /** Each register as signed 16-bit (−32768 … 32767). */
  asInt16(): number[] {
    const result: number[] = new Array(this.length);
    for (let i = 0; i < this.length; i++) {
      const v = this[i]!;
      result[i] = v > 0x7fff ? v - 0x10000 : v;
    }
    return result;
  }

  /** Pairs of registers → unsigned 32-bit values. */
  asUInt32(wordOrder: TWordOrder = 'BE'): number[] {
    this._assertEven('asUInt32');
    const view = this._buildBuffer(wordOrder, 2);
    const count = this.length >> 1;
    const result: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = view.getUint32(i * 4, false);
    }
    return result;
  }

  /** Pairs of registers → signed 32-bit values. */
  asInt32(wordOrder: TWordOrder = 'BE'): number[] {
    this._assertEven('asInt32');
    const view = this._buildBuffer(wordOrder, 2);
    const count = this.length >> 1;
    const result: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = view.getInt32(i * 4, false);
    }
    return result;
  }

  /** Pairs of registers → IEEE 754 single-precision floats. */
  asFloat32(wordOrder: TWordOrder = 'BE'): number[] {
    this._assertEven('asFloat32');
    const view = this._buildBuffer(wordOrder, 2);
    const count = this.length >> 1;
    const result: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = view.getFloat32(i * 4, false);
    }
    return result;
  }

  /** Groups of 4 registers → IEEE 754 double-precision floats. */
  asFloat64(wordOrder: TWordOrder = 'BE'): number[] {
    this._assertMultipleOf4('asFloat64');
    const view = this._buildBuffer(wordOrder, 4);
    const count = this.length >> 2;
    const result: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      result[i] = view.getFloat64(i * 8, false);
    }
    return result;
  }

  // ── Scalar conversions (first value only) ──────────────────

  asUInt16Scalar(): number {
    this._assertNonEmpty('asUInt16Scalar');
    return this[0]!;
  }

  asInt16Scalar(): number {
    this._assertNonEmpty('asInt16Scalar');
    const v = this[0]!;
    return v > 0x7fff ? v - 0x10000 : v;
  }

  asUInt32Scalar(wordOrder: TWordOrder = 'BE'): number {
    return this.sub(0, 2).asUInt32(wordOrder)[0]!;
  }

  asInt32Scalar(wordOrder: TWordOrder = 'BE'): number {
    return this.sub(0, 2).asInt32(wordOrder)[0]!;
  }

  asFloat32Scalar(wordOrder: TWordOrder = 'BE'): number {
    return this.sub(0, 2).asFloat32(wordOrder)[0]!;
  }

  asFloat64Scalar(wordOrder: TWordOrder = 'BE'): number {
    return this.sub(0, 4).asFloat64(wordOrder)[0]!;
  }

  // ── Internal helpers ───────────────────────────────────────

  private _assertNonEmpty(method: string): void {
    if (this.length === 0) {
      throw new RangeError(`${method} requires at least 1 register, got 0`);
    }
  }

  private _assertEven(method: string): void {
    if (this.length === 0 || this.length % 2 !== 0) {
      throw new RangeError(
        `${method} requires an even number of registers (≥2), got ${this.length}`
      );
    }
  }

  private _assertMultipleOf4(method: string): void {
    if (this.length === 0 || this.length % 4 !== 0) {
      throw new RangeError(`${method} requires a multiple of 4 registers (≥4), got ${this.length}`);
    }
  }

  /**
   * Builds an ArrayBuffer with registers written as big-endian byte pairs,
   * optionally swapping word order within each multi-register value group.
   */
  private _buildBuffer(wordOrder: TWordOrder, regsPerValue: number): DataView {
    const byteCount = this.length * 2;
    const buf = new ArrayBuffer(byteCount);
    const u8 = new Uint8Array(buf);

    for (let i = 0; i < this.length; i++) {
      u8[i * 2] = (this[i]! >> 8) & 0xff;
      u8[i * 2 + 1] = this[i]! & 0xff;
    }

    if (wordOrder === 'LE' && regsPerValue > 1) {
      for (let v = 0; v < this.length; v += regsPerValue) {
        for (let w = 0; w < regsPerValue >> 1; w++) {
          const a = v + w;
          const b = v + regsPerValue - 1 - w;
          if (a < b) {
            const t0 = u8[a * 2]!,
              t1 = u8[a * 2 + 1]!;
            u8[a * 2] = u8[b * 2]!;
            u8[a * 2 + 1] = u8[b * 2 + 1]!;
            u8[b * 2] = t0;
            u8[b * 2 + 1] = t1;
          }
        }
      }
    }

    return new DataView(buf);
  }
}

export default RegisterData;
