import { Red } from "./red";
import { Mont } from "./mont";
import { assert } from "./utils";
import { groupBases, groupSizes, zeros } from "./constants";
import type { BN, IPrimeName, Endianness, CmpResult, BNConstructor } from "./types";

export class BigNumber {
  static BN = this;
  static wordSize = 26 as const;

  static red(value: BigNumber | IPrimeName): Red {
    return new Red(value);
  }

  static mont(value: BigNumber | IPrimeName): Mont {
    return new Mont(value);
  }

  static isBN(value: any): value is BigNumber {
    if (value instanceof BigNumber) {
      return true;
    }

    // Keep for compatibility
    return (
      value !== null &&
      typeof value === "object" &&
      value.constructor.wordSize === BigNumber.wordSize &&
      Array.isArray(value.words)
    );
  }

  static max(left: BigNumber, right: BigNumber): BigNumber {
    if (left.cmp(right) > 0) {
      return left;
    }
    return right;
  }

  static min(left: BigNumber, right: BigNumber): BigNumber {
    if (left.cmp(right) < 0) {
      return left;
    }
    return right;
  }

  negative: number;
  words: number[];
  length: number;
  red: Red | null;

  constructor(
    number: number | string | number[] | Uint8Array | Buffer | BigNumber | BN | null,
    base?: number | "hex" | Endianness,
    endian?: Endianness
  ) {
    if (BigNumber.isBN(number)) {
      return number;
    }

    this.negative = 0;
    this.length = 0;
    this.red = null;

    if (number !== null) {
      if (base === "le" || base === "be") {
        endian = base;
        base = 10;
      }

      this._init(number || 0, base || 10, endian || "be");
    }
  }

  // BN interface methods

  clone(): BigNumber {
    const r = new BigNumber(null);
    this.copy(r);
    return r;
  }

  copy(dest: BigNumber) {
    dest.words = new Array(this.length);
    for (let i = 0; i < this.length; i++) {
      dest.words[i] = this.words[i];
    }
    dest.length = this.length;
    dest.negative = this.negative;
    dest.red = this.red;
  }

  toString(base?: number | "hex", padding?: number): string {
    base = base || 10;
    padding = (padding! | 0) || 1;

    let out: string;
    if (base === 16 || base === "hex") {
      out = "";
      let off = 0;
      let carry = 0;
      for (let i = 0; i < this.length; i++) {
        const w = this.words[i];
        const word = (((w << off) | carry) & 0xffffff).toString(16);
        carry = (w >>> (24 - off)) & 0xffffff;
        off += 2;
        if (off >= 26) {
          off -= 26;
          i--;
        }
        if (carry !== 0 || i !== this.length - 1) {
          out = zeros[6 - word.length] + word + out;
        } else {
          out = word + out;
        }
      }
      if (carry !== 0) {
        out = carry.toString(16) + out;
      }
      while (out.length % padding !== 0) {
        out = "0" + out;
      }
      if (this.negative !== 0) {
        out = "-" + out;
      }
      return out;
    }

    if (base === (base | 0) && base >= 2 && base <= 36) {
      // let groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
      const groupSize = groupSizes[base];
      // let groupBase = Math.pow(base, groupSize);
      const groupBase = groupBases[base];
      out = "";
      let c = this.clone();
      c.negative = 0;
      while (!c.isZero()) {
        const r = c.modrn(groupBase).toString(base);
        c = c.idivn(groupBase);

        if (!c.isZero()) {
          out = zeros[groupSize - r.length] + r + out;
        } else {
          out = r + out;
        }
      }
      if (this.isZero()) {
        out = "0" + out;
      }
      while (out.length % padding !== 0) {
        out = "0" + out;
      }
      if (this.negative !== 0) {
        out = "-" + out;
      }
      return out;
    }

    throw new Error("Base should be between 2 and 36");
  }

  toNumber(): number {
    let ret = this.words[0];
    if (this.length === 2) {
      ret += this.words[1] * 0x4000000;
    } else if (this.length === 3 && this.words[2] === 0x01) {
      // NOTE: at this stage it is known that the top bit is set
      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
    } else if (this.length > 2) {
      assert(false, "Number can only safely store up to 53 bits");
    }
    return (this.negative !== 0) ? -ret : ret;
  }

  toJSON(): string {
    return this.toString(16, 2);
  }

  toArray(endian?: Endianness, length?: number): number[] {
    return this.toArrayLike(Array, endian, length);
  }

  toArrayLike<T extends typeof Buffer | typeof Array>(
    ArrayType: T,
    endian?: Endianness,
    length?: number
  ): T extends typeof Buffer ? Buffer : number[] {
    this._strip();

    const byteLength = this.byteLength();
    const reqLength = length || Math.max(1, byteLength);

    assert(byteLength <= reqLength, "byte array longer than desired length");
    assert(reqLength > 0, "Requested array length <= 0");

    const res = allocate(ArrayType, reqLength);
    switch (endian ?? "be") {
      case "be":
        this._toArrayLikeBE(res);
        break;
      case "le":
        this._toArrayLikeLE(res);
        break;
    }
    return res;
  }

  toBuffer(endian?: Endianness, length?: number): Buffer {
    return this.toArrayLike(Buffer, endian, length);
  }

  bitLength(): number {
    const w = this.words[this.length - 1];
    const hi = this._countBits(w);
    return (this.length - 1) * 26 + hi;
  }

  zeroBits(): number {
    if (this.isZero()) return 0;

    let r = 0;
    for (let i = 0; i < this.length; i++) {
      const b = this._zeroBits(this.words[i]);
      r += b;
      if (b !== 26) break;
    }
    return r;
  }

  byteLength(): number {
    return Math.ceil(this.bitLength() / 8);
  }

  isNeg(): boolean {
    return this.negative !== 0;
  }

  isEven(): boolean {
    return (this.words[0] & 1) === 0;
  }

  isOdd(): boolean {
    return (this.words[0] & 1) === 1;
  }

  isZero(): boolean {
    return this.length === 1 && this.words[0] === 0;
  }

  cmp(value: BigNumber): CmpResult {
    if (this.negative !== 0 && value.negative === 0) return -1;
    if (this.negative === 0 && value.negative !== 0) return 1;

    const res = this.ucmp(value);
    if (this.negative !== 0) {
      return (-res | 0) as CmpResult;
    }
    return res;
  }

  ucmp(value: BigNumber): CmpResult {
    // At this point both numbers have the same sign
    if (this.length > value.length) return 1;
    if (this.length < value.length) return -1;

    let res: CmpResult = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      const a = this.words[i] | 0;
      const b = value.words[i] | 0;

      if (a === b) continue;

      if (a < b) {
        res = -1;
      } else if (a > b) {
        res = 1;
      }
      break;
    }
    return res;
  }

  cmpn(value: number): CmpResult {
    const negative = value < 0;

    if (this.negative !== 0 && !negative) return -1;
    if (this.negative === 0 && negative) return 1;

    this._strip();

    let res: CmpResult;
    if (this.length > 1) {
      res = 1;
    } else {
      if (negative) {
        value = -value;
      }

      assert(value <= 0x3ffffff, "Number is too big");

      const w = this.words[0] | 0;
      res = w === value ? 0 : w < value ? -1 : 1;
    }

    if (this.negative !== 0) {
      return (-res | 0) as CmpResult;
    }
    return res;
  }

  lt(value: BigNumber): boolean {
    return this.cmp(value) === -1;
  }

  ltn(value: number): boolean {
    return this.cmpn(value) === -1;
  }

  lte(value: BigNumber): boolean {
    return this.cmp(value) <= 0;
  }

  lten(value: number): boolean {
    return this.cmpn(value) <= 0;
  }

  gt(value: BigNumber): boolean {
    return this.cmp(value) === 1;
  }

  gtn(value: number): boolean {
    return this.cmpn(value) === 1;
  }

  gte(value: BigNumber): boolean {
    return this.cmp(value) >= 0;
  }

  gten(value: number): boolean {
    return this.cmpn(value) >= 0;
  }

  eq(value: BigNumber): boolean {
    return this.cmp(value) === 0;
  }

  eqn(value: number): boolean {
    return this.cmpn(value) === 0;
  }

  toTwos(width: number): BigNumber {
    if (this.negative !== 0) {
      return this.abs().inotn(width).iaddn(1);
    }
    return this.clone();
  }

  fromTwos(width: number): BigNumber {
    if (this.testn(width - 1)) {
      return this.notn(width).iaddn(1).ineg();
    }
    return this.clone();
  }

  neg(): BigNumber {
    return this.clone().ineg();
  }

  ineg(): BigNumber {
    if (!this.isZero()) {
      this.negative ^= 1;
    }
    return this;
  }

  abs(): BigNumber {
    return this.clone().iabs();
  }

  iabs(): BigNumber {
    this.negative = 0;
    return this;
  }

  add(value: BigNumber): BigNumber {
    let res: BigNumber;
    if (value.negative !== 0 && this.negative === 0) {
      value.negative = 0;
      res = this.sub(value);
      value.negative ^= 1;
      return res;
    } else if (value.negative === 0 && this.negative !== 0) {
      this.negative = 0;
      res = value.sub(this);
      this.negative = 1;
      return res;
    }

    if (this.length > value.length) {
      return this.clone().iadd(value);
    }

    return value.clone().iadd(this);
  }

  iadd(value: BigNumber): BigNumber {
    let r: BigNumber;

    // negative + positive
    if (this.negative !== 0 && value.negative === 0) {
      this.negative = 0;
      r = this.isub(value);
      this.negative ^= 1;
      return this._normSign();

      // positive + negative
    } else if (this.negative === 0 && value.negative !== 0) {
      value.negative = 0;
      r = this.isub(value);
      value.negative = 1;
      return r._normSign();
    }

    // a.length > b.length
    let a: BigNumber, b: BigNumber;
    if (this.length > value.length) {
      a = this;
      b = value;
    } else {
      a = value;
      b = this;
    }

    let carry = 0;
    let i = 0;
    for (; i < b.length; i++) {
      let r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }
    for (; carry !== 0 && i < a.length; i++) {
      let r = (a.words[i] | 0) + carry;
      this.words[i] = r & 0x3ffffff;
      carry = r >>> 26;
    }

    this.length = a.length;
    if (carry !== 0) {
      this.words[this.length] = carry;
      this.length++;
      // Copy the rest of the words
    } else if (a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    return this;
  }

  addn(value: number): BigNumber {
    return this.clone().iaddn(value);

  }

  iaddn(value: number): BigNumber {
    assert(typeof value === "number");
    assert(value < 0x4000000);
    if (value < 0) return this.isubn(-value);

    // Possible sign change
    if (this.negative !== 0) {
      if (this.length === 1 && (this.words[0] | 0) <= value) {
        this.words[0] = value - (this.words[0] | 0);
        this.negative = 0;
        return this;
      }

      this.negative = 0;
      this.isubn(value);
      this.negative = 1;
      return this;
    }

    // Add without checks
    return this._iaddn(value);
  }

  sub(value: BigNumber): BigNumber {
    return this.clone().isub(value);
  }

  isub(value: BigNumber): BigNumber {
    // this - (-num) = this + num
    if (value.negative !== 0) {
      value.negative = 0;
      let r = this.iadd(value);
      value.negative = 1;
      return r._normSign();

      // -this - num = -(this + num)
    } else if (this.negative !== 0) {
      this.negative = 0;
      this.iadd(value);
      this.negative = 1;
      return this._normSign();
    }

    // At this point both numbers are positive
    const cmp = this.cmp(value);

    // Optimization - zeroify
    if (cmp === 0) {
      this.negative = 0;
      this.length = 1;
      this.words[0] = 0;
      return this;
    }

    // a > b
    let a: BigNumber, b: BigNumber;
    if (cmp > 0) {
      a = this;
      b = value;
    } else {
      a = value;
      b = this;
    }

    let carry = 0;
    let i: number;
    for (i = 0; i < b.length; i++) {
      let r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }
    for (; carry !== 0 && i < a.length; i++) {
      let r = (a.words[i] | 0) + carry;
      carry = r >> 26;
      this.words[i] = r & 0x3ffffff;
    }

    // Copy rest of the words
    if (carry === 0 && i < a.length && a !== this) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = Math.max(this.length, i);

    if (a !== this) {
      this.negative = 1;
    }

    return this._strip();
  }

  subn(value: number): BigNumber {
    return this.clone().isubn(value);
  }

  isubn(value: number): BigNumber {
    assert(typeof value === "number");
    assert(value < 0x4000000);
    if (value < 0) return this.iaddn(-value);

    if (this.negative !== 0) {
      this.negative = 0;
      this.iaddn(value);
      this.negative = 1;
      return this;
    }

    this.words[0] -= value;

    if (this.length === 1 && this.words[0] < 0) {
      this.words[0] = -this.words[0];
      this.negative = 1;
    } else {
      // Carry
      for (let i = 0; i < this.length && this.words[i] < 0; i++) {
        this.words[i] += 0x4000000;
        this.words[i + 1] -= 1;
      }
    }

    return this._strip();
  }

  mulTo(num: BigNumber, out: BigNumber) {
    let res: BigNumber;
    let len = this.length + num.length;

    if (this.length === 10 && num.length === 10) {
      res = comb10MulTo(this, num, out);
    } else if (len < 63) {
      res = smallMulTo(this, num, out);
    } else if (len < 1024) {
      res = bigMulTo(this, num, out);
    } else {
      res = jumboMulTo(this, num, out);
    }

    return res;
  };

  mul(value: BigNumber): BigNumber {
    const out = new BigNumber(null);
    out.words = new Array(this.length + value.length);
    return this.mulTo(value, out);
  }

  imul(value: BigNumber): BigNumber {
    return this.clone().mulTo(value, this);
  }

  mulf(num: BigNumber): BigNumber {
    var out = new BigNumber(null);
    out.words = new Array(this.length + num.length);
    return jumboMulTo(this, num, out);
  }

  muln(value: number): BigNumber {
    return this.clone().imuln(value);
  }

  imuln(value: number): BigNumber {
    const isNegNum = value < 0;
    if (isNegNum) value = -value;

    assert(typeof value === "number");
    assert(value < 0x4000000);

    // Carry
    let carry = 0;
    let i = 0;
    for (; i < this.length; i++) {
      const w = (this.words[i] | 0) * value;
      const lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
      carry >>= 26;
      carry += (w / 0x4000000) | 0;
      // NOTE: lo is 27bit maximum
      carry += lo >>> 26;
      this.words[i] = lo & 0x3ffffff;
    }

    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }

    return isNegNum ? this.ineg() : this;
  }

  sqr(): BigNumber {
    return this.mul(this);
  }

  isqr(): BigNumber {
    return this.imul(this.clone());
  }

  pow(value: BigNumber): BigNumber {
    const w = value._toBitArray();
    if (w.length === 0) return new BigNumber(1);

    // Skip leading zeroes
    let res: BigNumber = this;
    let i = 0
    for (; i < w.length; i++, res = res.sqr()) {
      if (w[i] !== 0) break;
    }

    if (++i < w.length) {
      for (let q = res.sqr(); i < w.length; i++, q = q.sqr()) {
        if (w[i] === 0) continue;

        res = res.mul(q);
      }
    }

    return res;
  }

  div(value: BigNumber): BigNumber {
    return this.divmod(value, "div", false).div;
  }

  divn(value: number): BigNumber {
    return this.clone().idivn(value);
  }

  idivn(value: number): BigNumber {
    const isNegNum = value < 0;
    if (isNegNum) value = -value;

    assert(value <= 0x3ffffff);

    let carry = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      const w = (this.words[i] | 0) + carry * 0x4000000;
      this.words[i] = (w / value) | 0;
      carry = w % value;
    }

    this._strip();
    return isNegNum ? this.ineg() : this;
  }

  divmod(value: BigNumber, mode?: "div" | "mod", positive?: boolean): { div: BigNumber; mod: BigNumber } {
    assert(!value.isZero());

    if (this.isZero()) {
      return {
        div: new BigNumber(0),
        mod: new BigNumber(0)
      };
    }

    let div: BigNumber, mod: BigNumber, res: { div: BigNumber; mod: BigNumber };
    if (this.negative !== 0 && value.negative === 0) {
      res = this.neg().divmod(value, mode);

      if (mode !== "mod") {
        div = res.div.neg();
      }

      if (mode !== "div") {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.iadd(value);
        }
      }

      return {
        div: div!,
        mod: mod!
      };
    }

    if (this.negative === 0 && value.negative !== 0) {
      res = this.divmod(value.neg(), mode);

      if (mode !== "mod") {
        div = res.div.neg();
      }

      return {
        div: div!,
        mod: res.mod
      };
    }

    if ((this.negative & value.negative) !== 0) {
      res = this.neg().divmod(value.neg(), mode);

      if (mode !== "div") {
        mod = res.mod.neg();
        if (positive && mod.negative !== 0) {
          mod.isub(value);
        }
      }

      return {
        div: res.div,
        mod: mod!
      };
    }

    // Both numbers are positive at this point

    // Strip both numbers to approximate shift value
    if (value.length > this.length || this.cmp(value) < 0) {
      return {
        div: new BigNumber(0),
        mod: this
      };
    }

    // Very short reduction
    if (value.length === 1) {
      if (mode === "div") {
        return {
          div: this.divn(value.words[0]),
          mod: null!
        };
      }

      if (mode === "mod") {
        return {
          div: null!,
          mod: new BigNumber(this.modrn(value.words[0]))
        };
      }

      return {
        div: this.divn(value.words[0]),
        mod: new BigNumber(this.modrn(value.words[0]))
      };
    }

    return this._wordDiv(value, mode);
  }

  mod(value: BigNumber): BigNumber {
    return this.divmod(value, "mod", false).mod;
  }

  umod(value: BigNumber): BigNumber {
    return this.divmod(value, "mod", true).mod;
  }

  // TODO: deprecated
  modn(value: number): number {
    return this.modrn(value);
  }

  modrn(value: number): number {
    const isNegNum = value < 0;
    if (isNegNum) value = -value;

    assert(value <= 0x3ffffff);
    const p = (1 << 26) % value;

    let acc = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      acc = (p * acc + (this.words[i] | 0)) % value;
    }

    return isNegNum ? -acc : acc;
  }

  divRound(value: BigNumber): BigNumber {
    const dm = this.divmod(value);

    // Fast case - exact division
    if (dm.mod.isZero()) return dm.div;

    const mod = dm.div.negative !== 0 ? dm.mod.isub(value) : dm.mod;

    const half = value.ushrn(1);
    const r2 = value.andln(1);
    const cmp = mod.cmp(half);

    // Round down
    if (cmp < 0 || (r2 === 1 && cmp === 0)) return dm.div;

    // Round up
    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  }

  or(value: BigNumber): BigNumber {
    if (this.length > value.length) {
      return this.clone().ior(value);
    }
    return value.clone().ior(this);
  }

  ior(value: BigNumber): BigNumber {
    assert((this.negative | value.negative) === 0);
    return this.iuor(value);
  }

  uor(value: BigNumber): BigNumber {
    if (this.length > value.length) {
      return this.clone().iuor(value);
    }
    return value.clone().iuor(this);
  }

  iuor(value: BigNumber): BigNumber {
    while (this.length < value.length) {
      this.words[this.length++] = 0;
    }

    for (let i = 0; i < value.length; i++) {
      this.words[i] = this.words[i] | value.words[i];
    }

    return this._strip();
  }

  and(value: BigNumber): BigNumber {
    if (this.length > value.length) return this.clone().iand(value);
    return value.clone().iand(this);
  }

  iand(value: BigNumber): BigNumber {
    assert((this.negative | value.negative) === 0);
    return this.iuand(value);
  }

  uand(value: BigNumber): BigNumber {
    if (this.length > value.length) return this.clone().iuand(value);
    return value.clone().iuand(this);
  }

  iuand(value: BigNumber): BigNumber {
    // b = min-length(num, this)
    let b: BigNumber;
    if (this.length > value.length) {
      b = value;
    } else {
      b = this;
    }

    for (let i = 0; i < b.length; i++) {
      this.words[i] = this.words[i] & value.words[i];
    }

    this.length = b.length;

    return this._strip();
  }

  andln(value: number): number {
    return this.words[0] & value;
  }

  xor(value: BigNumber): BigNumber {
    if (this.length > value.length) return this.clone().ixor(value);
    return value.clone().ixor(this);
  }

  ixor(value: BigNumber): BigNumber {
    assert((this.negative | value.negative) === 0);
    return this.iuxor(value);
  }

  uxor(value: BigNumber): BigNumber {
    if (this.length > value.length) return this.clone().iuxor(value);
    return value.clone().iuxor(this);
  }

  iuxor(value: BigNumber): BigNumber {
    // a.length > b.length
    let a: BigNumber;
    let b: BigNumber;
    if (this.length > value.length) {
      a = this;
      b = value;
    } else {
      a = value;
      b = this;
    }

    let i = 0;
    for (; i < b.length; i++) {
      this.words[i] = a.words[i] ^ b.words[i];
    }

    if (this !== a) {
      for (; i < a.length; i++) {
        this.words[i] = a.words[i];
      }
    }

    this.length = a.length;

    return this._strip();
  }

  setn(bit: number, value: boolean): BigNumber {
    assert(typeof bit === "number" && bit >= 0);

    const off = (bit / 26) | 0;
    const wbit = bit % 26;

    this._expand(off + 1);

    if (value) {
      this.words[off] = this.words[off] | (1 << wbit);
    } else {
      this.words[off] = this.words[off] & ~(1 << wbit);
    }

    return this._strip();
  }

  shln(bits: number): BigNumber {
    return this.clone().ishln(bits);
  }

  ishln(bits: number): BigNumber {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushln(bits);
  }

  ushln(bits: number): BigNumber {
    return this.clone().iushln(bits);
  }

  iushln(bits: number): BigNumber {
    assert(typeof bits === "number" && bits >= 0);
    const r = bits % 26;
    const s = (bits - r) / 26;
    const carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
    let i = 0;

    if (r !== 0) {
      let carry = 0;

      for (; i < this.length; i++) {
        const newCarry = this.words[i] & carryMask;
        const c = ((this.words[i] | 0) - newCarry) << r;
        this.words[i] = c | carry;
        carry = newCarry >>> (26 - r);
      }

      if (carry) {
        this.words[i] = carry;
        this.length++;
      }
    }

    if (s !== 0) {
      for (i = this.length - 1; i >= 0; i--) {
        this.words[i + s] = this.words[i];
      }

      for (i = 0; i < s; i++) {
        this.words[i] = 0;
      }

      this.length += s;
    }

    return this._strip();
  }

  shrn(bits: number): BigNumber {
    return this.clone().ishrn(bits);
  }

  ishrn(bits: number, hint?: number, extended?: BigNumber): BigNumber {
    // TODO(indutny): implement me
    assert(this.negative === 0);
    return this.iushrn(bits, hint, extended);
  }

  ushrn(bits: number): BigNumber {
    return this.clone().iushrn(bits);
  }

  iushrn(bits: number, hint?: number, extended?: BigNumber): BigNumber {
    assert(typeof bits === "number" && bits >= 0);
    let h: number;
    if (hint) {
      h = (hint - (hint % 26)) / 26;
    } else {
      h = 0;
    }

    const r = bits % 26;
    const s = Math.min((bits - r) / 26, this.length);
    const mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
    const maskedWords = extended;

    h -= s;
    h = Math.max(0, h);

    // Extended mode, copy masked part
    let i = 0
    if (maskedWords) {
      for (; i < s; i++) {
        maskedWords.words[i] = this.words[i];
      }
      maskedWords.length = s;
    }

    if (s === 0) {
      // No-op, we should not move anything at all
    } else if (this.length > s) {
      this.length -= s;
      for (i = 0; i < this.length; i++) {
        this.words[i] = this.words[i + s];
      }
    } else {
      this.words[0] = 0;
      this.length = 1;
    }

    let carry = 0;
    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
      const word = this.words[i] | 0;
      this.words[i] = (carry << (26 - r)) | (word >>> r);
      carry = word & mask;
    }

    // Push carried bits as a mask
    if (maskedWords && carry !== 0) {
      maskedWords.words[maskedWords.length++] = carry;
    }

    if (this.length === 0) {
      this.words[0] = 0;
      this.length = 1;
    }

    return this._strip();
  }

  testn(bit: number): boolean {
    assert(typeof bit === "number" && bit >= 0);
    const r = bit % 26;
    const s = (bit - r) / 26;
    const q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) return false;

    // Check bit and return
    const w = this.words[s];

    return !!(w & q);
  }

  maskn(bits: number): BigNumber {
    return this.clone().imaskn(bits);
  }

  imaskn(bits: number): BigNumber {
    assert(typeof bits === "number" && bits >= 0);
    const r = bits % 26;
    let s = (bits - r) / 26;

    assert(this.negative === 0, "imaskn works only with positive numbers");

    if (this.length <= s) {
      return this;
    }

    if (r !== 0) {
      s++;
    }
    this.length = Math.min(s, this.length);

    if (r !== 0) {
      const mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
      this.words[this.length - 1] &= mask;
    }

    return this._strip();
  }

  bincn(bit: number): BigNumber {
    assert(typeof bit === "number");
    const r = bit % 26;
    const s = (bit - r) / 26;
    const q = 1 << r;

    // Fast case: bit is much higher than all existing words
    if (this.length <= s) {
      this._expand(s + 1);
      this.words[s] |= q;
      return this;
    }

    // Add bit and propagate, if needed
    let carry = q;
    let i = s;
    for (; carry !== 0 && i < this.length; i++) {
      let w = this.words[i] | 0;
      w += carry;
      carry = w >>> 26;
      w &= 0x3ffffff;
      this.words[i] = w;
    }
    if (carry !== 0) {
      this.words[i] = carry;
      this.length++;
    }
    return this;
  }

  notn(width: number): BigNumber {
    return this.clone().inotn(width);
  }

  inotn(width: number): BigNumber {
    assert(typeof width === "number" && width >= 0);

    let bytesNeeded = Math.ceil(width / 26) | 0;
    const bitsLeft = width % 26;

    // Extend the buffer with leading zeroes
    this._expand(bytesNeeded);

    if (bitsLeft > 0) {
      bytesNeeded--;
    }

    // Handle complete words
    let i = 0;
    for (; i < bytesNeeded; i++) {
      this.words[i] = ~this.words[i] & 0x3ffffff;
    }

    // Handle the residue
    if (bitsLeft > 0) {
      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
    }

    // And remove leading zeroes
    return this._strip();
  }

  gcd(value: BigNumber): BigNumber {
    if (this.isZero()) return value.abs();
    if (value.isZero()) return this.abs();

    let a = this.clone();
    let b = value.clone();
    a.negative = 0;
    b.negative = 0;

    // Remove common factor of two
    let shift = 0;
    for (; a.isEven() && b.isEven(); shift++) {
      a.iushrn(1);
      b.iushrn(1);
    }

    do {
      while (a.isEven()) {
        a.iushrn(1);
      }
      while (b.isEven()) {
        b.iushrn(1);
      }

      const r = a.cmp(b);
      if (r < 0) {
        // Swap `a` and `b` to make `a` always bigger than `b`
        const t = a;
        a = b;
        b = t;
      } else if (r === 0 || b.cmpn(1) === 0) {
        break;
      }

      a.isub(b);
    } while (true);

    return b.iushln(shift);
  }

  egcd(p: BigNumber): { a: BigNumber; b: BigNumber; gcd: BigNumber } {
    assert(p.negative === 0);
    assert(!p.isZero());

    let x: BigNumber = this;
    let y = p.clone();

    if (x.negative !== 0) {
      x = x.umod(p);
    } else {
      x = x.clone();
    }

    // A * x + B * y = x
    const A = new BigNumber(1);
    const B = new BigNumber(0);

    // C * x + D * y = y
    const C = new BigNumber(0);
    const D = new BigNumber(1);

    let g = 0;

    while (x.isEven() && y.isEven()) {
      x.iushrn(1);
      y.iushrn(1);
      ++g;
    }

    const yp = y.clone();
    const xp = x.clone();

    while (!x.isZero()) {
      let i = 0;
      let im = 1;
      for (; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        x.iushrn(i);
        while (i-- > 0) {
          if (A.isOdd() || B.isOdd()) {
            A.iadd(yp);
            B.isub(xp);
          }

          A.iushrn(1);
          B.iushrn(1);
        }
      }
      let j = 0;
      let jm = 1;
      for (; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        y.iushrn(j);
        while (j-- > 0) {
          if (C.isOdd() || D.isOdd()) {
            C.iadd(yp);
            D.isub(xp);
          }

          C.iushrn(1);
          D.iushrn(1);
        }
      }

      if (x.cmp(y) >= 0) {
        x.isub(y);
        A.isub(C);
        B.isub(D);
      } else {
        y.isub(x);
        C.isub(A);
        D.isub(B);
      }
    }

    return {
      a: C,
      b: D,
      gcd: y.iushln(g)
    };
  }

  invm(value: BigNumber): BigNumber {
    return this.egcd(value).a.umod(value);
  }

  toRed(reductionContext: Red): BigNumber {
    assert(!this.red, "Already a number in reduction context");
    assert(this.negative === 0, "red works only with positives");
    return reductionContext.convertTo(this)._forceRed(reductionContext);
  }

  // BNRed interface methods

  fromRed(): BigNumber {
    assert(this.red, "fromRed works only with numbers in reduction context");
    return this.red.convertFrom(this);
  }

  redAdd(b: BigNumber): BigNumber {
    assert(this.red, "redAdd works only with red numbers");
    return this.red.add(this, b);
  }

  redIAdd(b: BigNumber): BigNumber {
    assert(this.red, "redIAdd works only with red numbers");
    return this.red.iadd(this, b);
  }

  redSub(b: BigNumber): BigNumber {
    assert(this.red, "redSub works only with red numbers");
    return this.red.sub(this, b);
  }

  redISub(b: BigNumber): BigNumber {
    assert(this.red, "redISub works only with red numbers");
    return this.red.isub(this, b);
  }

  redShl(num: number): BigNumber {
    assert(this.red, "redShl works only with red numbers");
    return this.red.shl(this, num);
  }

  redMul(b: BigNumber): BigNumber {
    assert(this.red, "redMul works only with red numbers");
    this.red._verify2(this, b);
    return this.red.mul(this, b);
  }

  redIMul(b: BigNumber): BigNumber {
    assert(this.red, "redMul works only with red numbers");
    this.red._verify2(this, b);
    return this.red.imul(this, b);
  }

  redSqr(): BigNumber {
    assert(this.red, "redSqr works only with red numbers");
    this.red._verify1(this);
    return this.red.sqr(this);
  }

  redISqr(): BigNumber {
    assert(this.red, "redISqr works only with red numbers");
    this.red._verify1(this);
    return this.red.isqr(this);
  }

  redSqrt(): BigNumber {
    assert(this.red, "redSqrt works only with red numbers");
    this.red._verify1(this);
    return this.red.sqrt(this);
  }

  redInvm(): BigNumber {
    assert(this.red, "redInvm works only with red numbers");
    this.red._verify1(this);
    return this.red.invm(this);
  }

  redNeg(): BigNumber {
    assert(this.red, "redNeg works only with red numbers");
    this.red._verify1(this);
    return this.red.neg(this);
  }

  redPow(num: BigNumber): BigNumber {
    assert(this.red && !num.red, "redPow(normalNum)");
    this.red!._verify1(this);
    return this.red!.pow(this, num);
  }

  // Private methods

  _init(
    number: number | string | number[] | Uint8Array | Buffer | BigNumber | BN,
    base: number | "hex",
    endian: Endianness
  ) {
    if (typeof number === "number") {
      return this._initNumber(number, base, endian);
    }

    if (typeof number === "object") {
      return this._initArray(number as any, base, endian);
    }

    if (base === "hex") {
      base = 16;
    }
    assert(base === (base | 0) && base >= 2 && base <= 36);

    number = number.toString().replace(/\s+/g, "");
    let start = 0;
    if (number[0] === "-") {
      start++;
      this.negative = 1;
    }

    if (start < number.length) {
      if (base === 16) {
        this._parseHex(number, start, endian);
      } else {
        this._parseBase(number, base, start);
        if (endian === "le") {
          this._initArray(this.toArray(), base, endian);
        }
      }
    }
  }

  _parseHex(number: string, start: number, endian: Endianness) {
    // Create possibly bigger array to ensure that it fits the number
    this.length = Math.ceil((number.length - start) / 6);
    this.words = new Array(this.length).fill(0);

    // 24-bits chunks
    let off = 0;
    let j = 0;

    let w: number;
    if (endian === "be") {
      for (let i = number.length - 1; i >= start; i -= 2) {
        w = parseHexByte(number, start, i) << off;
        this.words[j] |= w & 0x3ffffff;
        if (off >= 18) {
          off -= 18;
          j += 1;
          this.words[j] |= w >>> 26;
        } else {
          off += 8;
        }
      }
    } else {
      const parseLength = number.length - start;
      for (let i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
        w = parseHexByte(number, start, i) << off;
        this.words[j] |= w & 0x3ffffff;
        if (off >= 18) {
          off -= 18;
          j += 1;
          this.words[j] |= w >>> 26;
        } else {
          off += 8;
        }
      }
    }

    this._strip();
  }

  _parseBase(number: string, base: number, start: number) {
    // Initialize as zero
    this.words = [0];
    this.length = 1;

    // Find length of limb in base
    let limbLen = 0;
    let limbPow = 1;
    for (; limbPow <= 0x3ffffff; limbPow *= base) {
      limbLen++;
    }
    limbLen--;
    limbPow = (limbPow / base) | 0;

    const total = number.length - start;
    const mod = total % limbLen;
    const end = Math.min(total, total - mod) + start;

    let word = 0;
    let i = start;
    for (; i < end; i += limbLen) {
      word = parseBase(number, i, i + limbLen, base);

      this.imuln(limbPow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    if (mod !== 0) {
      let pow = 1;
      word = parseBase(number, i, number.length, base);

      for (i = 0; i < mod; i++) {
        pow *= base;
      }

      this.imuln(pow);
      if (this.words[0] + word < 0x4000000) {
        this.words[0] += word;
      } else {
        this._iaddn(word);
      }
    }

    this._strip();
  }

  _initNumber(
    number: number,
    base: number | "hex",
    endian: Endianness
  ) {
    if (number < 0) {
      this.negative = 1;
      number = -number;
    }

    if (number < 0x4000000) {
      this.words = [number & 0x3ffffff];
      this.length = 1;
    } else if (number < 0x10000000000000) {
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff
      ];
      this.length = 2;
    } else {
      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
      this.words = [
        number & 0x3ffffff,
        (number / 0x4000000) & 0x3ffffff,
        1
      ];
      this.length = 3;
    }

    if (endian !== "le") return;

    // Reverse the bytes
    this._initArray(this.toArray(), base, endian);
  }

  _initArray(
    number: number[] | Uint8Array | Buffer,
    base: number | "hex",
    endian: Endianness
  ) {
    // Perhaps a Uint8Array
    assert(typeof number.length === "number");
    if (number.length <= 0) {
      this.words = [0];
      this.length = 1;
      return this;
    }

    this.length = Math.ceil(number.length / 3);
    this.words = new Array(this.length).fill(0);

    let w: number;
    let off = 0;
    if (endian === "be") {
      for (let i = number.length - 1, j = 0; i >= 0; i -= 3) {
        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    } else if (endian === "le") {
      for (let i = 0, j = 0; i < number.length; i += 3) {
        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
        this.words[j] |= (w << off) & 0x3ffffff;
        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
        off += 24;
        if (off >= 26) {
          off -= 26;
          j++;
        }
      }
    }

    return this._strip();
  }

  _move(dest: BigNumber) {
    move(dest, this);
  }

  _expand(size: number) {
    while (this.length < size) {
      this.words[this.length++] = 0;
    }
    return this;
  }

  _strip() {
    while (this.length > 1 && this.words[this.length - 1] === 0) {
      this.length--;
    }
    return this._normSign();
  }

  _normSign() {
    // -0 = 0
    if (this.length === 1 && this.words[0] === 0) {
      this.negative = 0;
    }
    return this;
  }

  _toArrayLikeLE(res: Buffer | number[]) {
    let position = 0;
    let carry = 0;

    for (let i = 0, shift = 0; i < this.length; i++) {
      const word = (this.words[i] << shift) | carry;

      res[position++] = word & 0xff;
      if (position < res.length) {
        res[position++] = (word >> 8) & 0xff;
      }
      if (position < res.length) {
        res[position++] = (word >> 16) & 0xff;
      }

      if (shift === 6) {
        if (position < res.length) {
          res[position++] = (word >> 24) & 0xff;
        }
        carry = 0;
        shift = 0;
      } else {
        carry = word >>> 24;
        shift += 2;
      }
    }

    if (position < res.length) {
      res[position++] = carry;

      while (position < res.length) {
        res[position++] = 0;
      }
    }
  }

  _toArrayLikeBE(res: Buffer | number[]) {
    let position = res.length - 1;
    let carry = 0;

    for (let i = 0, shift = 0; i < this.length; i++) {
      const word = (this.words[i] << shift) | carry;

      res[position--] = word & 0xff;
      if (position >= 0) {
        res[position--] = (word >> 8) & 0xff;
      }
      if (position >= 0) {
        res[position--] = (word >> 16) & 0xff;
      }

      if (shift === 6) {
        if (position >= 0) {
          res[position--] = (word >> 24) & 0xff;
        }
        carry = 0;
        shift = 0;
      } else {
        carry = word >>> 24;
        shift += 2;
      }
    }

    if (position >= 0) {
      res[position--] = carry;

      while (position >= 0) {
        res[position--] = 0;
      }
    }
  }

  _iaddn(num: number) {
    this.words[0] += num;

    // Carry
    let i = 0;
    for (; i < this.length && this.words[i] >= 0x4000000; i++) {
      this.words[i] -= 0x4000000;
      if (i === this.length - 1) {
        this.words[i + 1] = 1;
      } else {
        this.words[i + 1]++;
      }
    }
    this.length = Math.max(this.length, i + 1);

    return this;
  }

  _countBits(w: number) {
    return 32 - Math.clz32(w);
  }

  _zeroBits(w: number) {
    // Short-cut
    if (w === 0) return 26;

    let t = w;
    let r = 0;
    if ((t & 0x1fff) === 0) {
      r += 13;
      t >>>= 13;
    }
    if ((t & 0x7f) === 0) {
      r += 7;
      t >>>= 7;
    }
    if ((t & 0xf) === 0) {
      r += 4;
      t >>>= 4;
    }
    if ((t & 0x3) === 0) {
      r += 2;
      t >>>= 2;
    }
    if ((t & 0x1) === 0) {
      r++;
    }
    return r;
  }

  _toBitArray() {
    const w = new Array(this.bitLength());

    for (let bit = 0; bit < w.length; bit++) {
      const off = (bit / 26) | 0;
      const wbit = bit % 26;

      w[bit] = (this.words[off] >>> wbit) & 0x01;
    }

    return w;
  }

  _ishlnsubmul(num: BigNumber, mul: number, shift: number) {
    const len = num.length + shift;
    let i = 0;

    this._expand(len);

    let w: number;
    let carry = 0;
    for (; i < num.length; i++) {
      w = (this.words[i + shift] | 0) + carry;
      const right = (num.words[i] | 0) * mul;
      w -= right & 0x3ffffff;
      carry = (w >> 26) - ((right / 0x4000000) | 0);
      this.words[i + shift] = w & 0x3ffffff;
    }
    for (; i < this.length - shift; i++) {
      w = (this.words[i + shift] | 0) + carry;
      carry = w >> 26;
      this.words[i + shift] = w & 0x3ffffff;
    }

    if (carry === 0) return this._strip();

    // Subtraction overflow
    assert(carry === -1);
    carry = 0;
    for (i = 0; i < this.length; i++) {
      w = -(this.words[i] | 0) + carry;
      carry = w >> 26;
      this.words[i] = w & 0x3ffffff;
    }
    this.negative = 1;

    return this._strip();
  }

  // TODO: Res
  _wordDiv(num: BigNumber, mode?: "div" | "mod"): { div: BigNumber; mod: BigNumber } {
    let shift = this.length - num.length;

    let a = this.clone();
    let b = num;

    // Normalize
    let bhi = b.words[b.length - 1] | 0;
    const bhiBits = this._countBits(bhi);
    shift = 26 - bhiBits;
    if (shift !== 0) {
      b = b.ushln(shift);
      a.iushln(shift);
      bhi = b.words[b.length - 1] | 0;
    }

    // Initialize quotient
    const m = a.length - b.length;
    let q: BigNumber | undefined;

    if (mode !== "mod") {
      q = new BigNumber(null);
      q.length = m + 1;
      q.words = new Array(q.length);
      for (let i = 0; i < q.length; i++) {
        q.words[i] = 0;
      }
    }

    const diff = a.clone()._ishlnsubmul(b, 1, m);
    if (diff.negative === 0) {
      a = diff;
      if (q != null) {
        q.words[m] = 1;
      }
    }

    for (let j = m - 1; j >= 0; j--) {
      let qj = (a.words[b.length + j] | 0) * 0x4000000 +
        (a.words[b.length + j - 1] | 0);

      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
      // (0x7ffffff)
      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

      a._ishlnsubmul(b, qj, j);
      while (a.negative !== 0) {
        qj--;
        a.negative = 0;
        a._ishlnsubmul(b, 1, j);
        if (!a.isZero()) {
          a.negative ^= 1;
        }
      }
      if (q) {
        q.words[j] = qj;
      }
    }
    if (q) {
      q._strip();
    }
    a._strip();

    // Denormalize
    if (mode !== "div" && shift !== 0) {
      a.iushrn(shift);
    }

    return {
      div: q || null!,
      mod: a
    };
  }

  // This is reduced incarnation of the binary EEA
  // above, designated to invert members of the
  // _prime_ fields F(p) at a maximal speed
  _invmp(p: BigNumber) {
    assert(p.negative === 0);
    assert(!p.isZero());

    let a: BigNumber = this;
    var b = p.clone();

    if (a.negative !== 0) {
      a = a.umod(p);
    } else {
      a = a.clone();
    }

    const x1 = new BigNumber(1);
    const x2 = new BigNumber(0);

    const delta = b.clone();

    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
      let i = 0;
      let im = 1;
      for (; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
      if (i > 0) {
        a.iushrn(i);
        while (i-- > 0) {
          if (x1.isOdd()) {
            x1.iadd(delta);
          }

          x1.iushrn(1);
        }
      }
      let j = 0;
      let jm = 1;
      for (; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
      if (j > 0) {
        b.iushrn(j);
        while (j-- > 0) {
          if (x2.isOdd()) {
            x2.iadd(delta);
          }

          x2.iushrn(1);
        }
      }

      if (a.cmp(b) >= 0) {
        a.isub(b);
        x1.isub(x2);
      } else {
        b.isub(a);
        x2.isub(x1);
      }
    }

    let res: BigNumber;
    if (a.cmpn(1) === 0) {
      res = x1;
    } else {
      res = x2;
    }

    if (res.cmpn(0) < 0) {
      res.iadd(p);
    }

    return res;
  }

  _forceRed(reductionContext: Red) {
    this.red = reductionContext;
    return this;
  }
}

export function move(dest: BigNumber, src: BigNumber) {
  dest.words = src.words;
  dest.length = src.length;
  dest.negative = src.negative;
  dest.red = src.red;
}

function comb10MulTo(self: BigNumber, num: BigNumber, out: BigNumber) {
  const a = self.words;
  const b = num.words;
  const o = out.words;
  let c = 0;
  let lo: number;
  let mid: number;
  let hi: number;
  const a0 = a[0] | 0;
  const al0 = a0 & 0x1fff;
  const ah0 = a0 >>> 13;
  const a1 = a[1] | 0;
  const al1 = a1 & 0x1fff;
  const ah1 = a1 >>> 13;
  const a2 = a[2] | 0;
  const al2 = a2 & 0x1fff;
  const ah2 = a2 >>> 13;
  const a3 = a[3] | 0;
  const al3 = a3 & 0x1fff;
  const ah3 = a3 >>> 13;
  const a4 = a[4] | 0;
  const al4 = a4 & 0x1fff;
  const ah4 = a4 >>> 13;
  const a5 = a[5] | 0;
  const al5 = a5 & 0x1fff;
  const ah5 = a5 >>> 13;
  const a6 = a[6] | 0;
  const al6 = a6 & 0x1fff;
  const ah6 = a6 >>> 13;
  const a7 = a[7] | 0;
  const al7 = a7 & 0x1fff;
  const ah7 = a7 >>> 13;
  const a8 = a[8] | 0;
  const al8 = a8 & 0x1fff;
  const ah8 = a8 >>> 13;
  const a9 = a[9] | 0;
  const al9 = a9 & 0x1fff;
  const ah9 = a9 >>> 13;
  const b0 = b[0] | 0;
  const bl0 = b0 & 0x1fff;
  const bh0 = b0 >>> 13;
  const b1 = b[1] | 0;
  const bl1 = b1 & 0x1fff;
  const bh1 = b1 >>> 13;
  const b2 = b[2] | 0;
  const bl2 = b2 & 0x1fff;
  const bh2 = b2 >>> 13;
  const b3 = b[3] | 0;
  const bl3 = b3 & 0x1fff;
  const bh3 = b3 >>> 13;
  const b4 = b[4] | 0;
  const bl4 = b4 & 0x1fff;
  const bh4 = b4 >>> 13;
  const b5 = b[5] | 0;
  const bl5 = b5 & 0x1fff;
  const bh5 = b5 >>> 13;
  const b6 = b[6] | 0;
  const bl6 = b6 & 0x1fff;
  const bh6 = b6 >>> 13;
  const b7 = b[7] | 0;
  const bl7 = b7 & 0x1fff;
  const bh7 = b7 >>> 13;
  const b8 = b[8] | 0;
  const bl8 = b8 & 0x1fff;
  const bh8 = b8 >>> 13;
  const b9 = b[9] | 0;
  const bl9 = b9 & 0x1fff;
  const bh9 = b9 >>> 13;

  out.negative = self.negative ^ num.negative;
  out.length = 19;
  /* k = 0 */
  lo = Math.imul(al0, bl0);
  mid = Math.imul(al0, bh0);
  mid = (mid + Math.imul(ah0, bl0)) | 0;
  hi = Math.imul(ah0, bh0);
  let w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
  w0 &= 0x3ffffff;
  /* k = 1 */
  lo = Math.imul(al1, bl0);
  mid = Math.imul(al1, bh0);
  mid = (mid + Math.imul(ah1, bl0)) | 0;
  hi = Math.imul(ah1, bh0);
  lo = (lo + Math.imul(al0, bl1)) | 0;
  mid = (mid + Math.imul(al0, bh1)) | 0;
  mid = (mid + Math.imul(ah0, bl1)) | 0;
  hi = (hi + Math.imul(ah0, bh1)) | 0;
  let w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
  w1 &= 0x3ffffff;
  /* k = 2 */
  lo = Math.imul(al2, bl0);
  mid = Math.imul(al2, bh0);
  mid = (mid + Math.imul(ah2, bl0)) | 0;
  hi = Math.imul(ah2, bh0);
  lo = (lo + Math.imul(al1, bl1)) | 0;
  mid = (mid + Math.imul(al1, bh1)) | 0;
  mid = (mid + Math.imul(ah1, bl1)) | 0;
  hi = (hi + Math.imul(ah1, bh1)) | 0;
  lo = (lo + Math.imul(al0, bl2)) | 0;
  mid = (mid + Math.imul(al0, bh2)) | 0;
  mid = (mid + Math.imul(ah0, bl2)) | 0;
  hi = (hi + Math.imul(ah0, bh2)) | 0;
  let w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
  w2 &= 0x3ffffff;
  /* k = 3 */
  lo = Math.imul(al3, bl0);
  mid = Math.imul(al3, bh0);
  mid = (mid + Math.imul(ah3, bl0)) | 0;
  hi = Math.imul(ah3, bh0);
  lo = (lo + Math.imul(al2, bl1)) | 0;
  mid = (mid + Math.imul(al2, bh1)) | 0;
  mid = (mid + Math.imul(ah2, bl1)) | 0;
  hi = (hi + Math.imul(ah2, bh1)) | 0;
  lo = (lo + Math.imul(al1, bl2)) | 0;
  mid = (mid + Math.imul(al1, bh2)) | 0;
  mid = (mid + Math.imul(ah1, bl2)) | 0;
  hi = (hi + Math.imul(ah1, bh2)) | 0;
  lo = (lo + Math.imul(al0, bl3)) | 0;
  mid = (mid + Math.imul(al0, bh3)) | 0;
  mid = (mid + Math.imul(ah0, bl3)) | 0;
  hi = (hi + Math.imul(ah0, bh3)) | 0;
  let w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
  w3 &= 0x3ffffff;
  /* k = 4 */
  lo = Math.imul(al4, bl0);
  mid = Math.imul(al4, bh0);
  mid = (mid + Math.imul(ah4, bl0)) | 0;
  hi = Math.imul(ah4, bh0);
  lo = (lo + Math.imul(al3, bl1)) | 0;
  mid = (mid + Math.imul(al3, bh1)) | 0;
  mid = (mid + Math.imul(ah3, bl1)) | 0;
  hi = (hi + Math.imul(ah3, bh1)) | 0;
  lo = (lo + Math.imul(al2, bl2)) | 0;
  mid = (mid + Math.imul(al2, bh2)) | 0;
  mid = (mid + Math.imul(ah2, bl2)) | 0;
  hi = (hi + Math.imul(ah2, bh2)) | 0;
  lo = (lo + Math.imul(al1, bl3)) | 0;
  mid = (mid + Math.imul(al1, bh3)) | 0;
  mid = (mid + Math.imul(ah1, bl3)) | 0;
  hi = (hi + Math.imul(ah1, bh3)) | 0;
  lo = (lo + Math.imul(al0, bl4)) | 0;
  mid = (mid + Math.imul(al0, bh4)) | 0;
  mid = (mid + Math.imul(ah0, bl4)) | 0;
  hi = (hi + Math.imul(ah0, bh4)) | 0;
  let w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
  w4 &= 0x3ffffff;
  /* k = 5 */
  lo = Math.imul(al5, bl0);
  mid = Math.imul(al5, bh0);
  mid = (mid + Math.imul(ah5, bl0)) | 0;
  hi = Math.imul(ah5, bh0);
  lo = (lo + Math.imul(al4, bl1)) | 0;
  mid = (mid + Math.imul(al4, bh1)) | 0;
  mid = (mid + Math.imul(ah4, bl1)) | 0;
  hi = (hi + Math.imul(ah4, bh1)) | 0;
  lo = (lo + Math.imul(al3, bl2)) | 0;
  mid = (mid + Math.imul(al3, bh2)) | 0;
  mid = (mid + Math.imul(ah3, bl2)) | 0;
  hi = (hi + Math.imul(ah3, bh2)) | 0;
  lo = (lo + Math.imul(al2, bl3)) | 0;
  mid = (mid + Math.imul(al2, bh3)) | 0;
  mid = (mid + Math.imul(ah2, bl3)) | 0;
  hi = (hi + Math.imul(ah2, bh3)) | 0;
  lo = (lo + Math.imul(al1, bl4)) | 0;
  mid = (mid + Math.imul(al1, bh4)) | 0;
  mid = (mid + Math.imul(ah1, bl4)) | 0;
  hi = (hi + Math.imul(ah1, bh4)) | 0;
  lo = (lo + Math.imul(al0, bl5)) | 0;
  mid = (mid + Math.imul(al0, bh5)) | 0;
  mid = (mid + Math.imul(ah0, bl5)) | 0;
  hi = (hi + Math.imul(ah0, bh5)) | 0;
  let w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
  w5 &= 0x3ffffff;
  /* k = 6 */
  lo = Math.imul(al6, bl0);
  mid = Math.imul(al6, bh0);
  mid = (mid + Math.imul(ah6, bl0)) | 0;
  hi = Math.imul(ah6, bh0);
  lo = (lo + Math.imul(al5, bl1)) | 0;
  mid = (mid + Math.imul(al5, bh1)) | 0;
  mid = (mid + Math.imul(ah5, bl1)) | 0;
  hi = (hi + Math.imul(ah5, bh1)) | 0;
  lo = (lo + Math.imul(al4, bl2)) | 0;
  mid = (mid + Math.imul(al4, bh2)) | 0;
  mid = (mid + Math.imul(ah4, bl2)) | 0;
  hi = (hi + Math.imul(ah4, bh2)) | 0;
  lo = (lo + Math.imul(al3, bl3)) | 0;
  mid = (mid + Math.imul(al3, bh3)) | 0;
  mid = (mid + Math.imul(ah3, bl3)) | 0;
  hi = (hi + Math.imul(ah3, bh3)) | 0;
  lo = (lo + Math.imul(al2, bl4)) | 0;
  mid = (mid + Math.imul(al2, bh4)) | 0;
  mid = (mid + Math.imul(ah2, bl4)) | 0;
  hi = (hi + Math.imul(ah2, bh4)) | 0;
  lo = (lo + Math.imul(al1, bl5)) | 0;
  mid = (mid + Math.imul(al1, bh5)) | 0;
  mid = (mid + Math.imul(ah1, bl5)) | 0;
  hi = (hi + Math.imul(ah1, bh5)) | 0;
  lo = (lo + Math.imul(al0, bl6)) | 0;
  mid = (mid + Math.imul(al0, bh6)) | 0;
  mid = (mid + Math.imul(ah0, bl6)) | 0;
  hi = (hi + Math.imul(ah0, bh6)) | 0;
  let w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
  w6 &= 0x3ffffff;
  /* k = 7 */
  lo = Math.imul(al7, bl0);
  mid = Math.imul(al7, bh0);
  mid = (mid + Math.imul(ah7, bl0)) | 0;
  hi = Math.imul(ah7, bh0);
  lo = (lo + Math.imul(al6, bl1)) | 0;
  mid = (mid + Math.imul(al6, bh1)) | 0;
  mid = (mid + Math.imul(ah6, bl1)) | 0;
  hi = (hi + Math.imul(ah6, bh1)) | 0;
  lo = (lo + Math.imul(al5, bl2)) | 0;
  mid = (mid + Math.imul(al5, bh2)) | 0;
  mid = (mid + Math.imul(ah5, bl2)) | 0;
  hi = (hi + Math.imul(ah5, bh2)) | 0;
  lo = (lo + Math.imul(al4, bl3)) | 0;
  mid = (mid + Math.imul(al4, bh3)) | 0;
  mid = (mid + Math.imul(ah4, bl3)) | 0;
  hi = (hi + Math.imul(ah4, bh3)) | 0;
  lo = (lo + Math.imul(al3, bl4)) | 0;
  mid = (mid + Math.imul(al3, bh4)) | 0;
  mid = (mid + Math.imul(ah3, bl4)) | 0;
  hi = (hi + Math.imul(ah3, bh4)) | 0;
  lo = (lo + Math.imul(al2, bl5)) | 0;
  mid = (mid + Math.imul(al2, bh5)) | 0;
  mid = (mid + Math.imul(ah2, bl5)) | 0;
  hi = (hi + Math.imul(ah2, bh5)) | 0;
  lo = (lo + Math.imul(al1, bl6)) | 0;
  mid = (mid + Math.imul(al1, bh6)) | 0;
  mid = (mid + Math.imul(ah1, bl6)) | 0;
  hi = (hi + Math.imul(ah1, bh6)) | 0;
  lo = (lo + Math.imul(al0, bl7)) | 0;
  mid = (mid + Math.imul(al0, bh7)) | 0;
  mid = (mid + Math.imul(ah0, bl7)) | 0;
  hi = (hi + Math.imul(ah0, bh7)) | 0;
  let w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
  w7 &= 0x3ffffff;
  /* k = 8 */
  lo = Math.imul(al8, bl0);
  mid = Math.imul(al8, bh0);
  mid = (mid + Math.imul(ah8, bl0)) | 0;
  hi = Math.imul(ah8, bh0);
  lo = (lo + Math.imul(al7, bl1)) | 0;
  mid = (mid + Math.imul(al7, bh1)) | 0;
  mid = (mid + Math.imul(ah7, bl1)) | 0;
  hi = (hi + Math.imul(ah7, bh1)) | 0;
  lo = (lo + Math.imul(al6, bl2)) | 0;
  mid = (mid + Math.imul(al6, bh2)) | 0;
  mid = (mid + Math.imul(ah6, bl2)) | 0;
  hi = (hi + Math.imul(ah6, bh2)) | 0;
  lo = (lo + Math.imul(al5, bl3)) | 0;
  mid = (mid + Math.imul(al5, bh3)) | 0;
  mid = (mid + Math.imul(ah5, bl3)) | 0;
  hi = (hi + Math.imul(ah5, bh3)) | 0;
  lo = (lo + Math.imul(al4, bl4)) | 0;
  mid = (mid + Math.imul(al4, bh4)) | 0;
  mid = (mid + Math.imul(ah4, bl4)) | 0;
  hi = (hi + Math.imul(ah4, bh4)) | 0;
  lo = (lo + Math.imul(al3, bl5)) | 0;
  mid = (mid + Math.imul(al3, bh5)) | 0;
  mid = (mid + Math.imul(ah3, bl5)) | 0;
  hi = (hi + Math.imul(ah3, bh5)) | 0;
  lo = (lo + Math.imul(al2, bl6)) | 0;
  mid = (mid + Math.imul(al2, bh6)) | 0;
  mid = (mid + Math.imul(ah2, bl6)) | 0;
  hi = (hi + Math.imul(ah2, bh6)) | 0;
  lo = (lo + Math.imul(al1, bl7)) | 0;
  mid = (mid + Math.imul(al1, bh7)) | 0;
  mid = (mid + Math.imul(ah1, bl7)) | 0;
  hi = (hi + Math.imul(ah1, bh7)) | 0;
  lo = (lo + Math.imul(al0, bl8)) | 0;
  mid = (mid + Math.imul(al0, bh8)) | 0;
  mid = (mid + Math.imul(ah0, bl8)) | 0;
  hi = (hi + Math.imul(ah0, bh8)) | 0;
  let w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
  w8 &= 0x3ffffff;
  /* k = 9 */
  lo = Math.imul(al9, bl0);
  mid = Math.imul(al9, bh0);
  mid = (mid + Math.imul(ah9, bl0)) | 0;
  hi = Math.imul(ah9, bh0);
  lo = (lo + Math.imul(al8, bl1)) | 0;
  mid = (mid + Math.imul(al8, bh1)) | 0;
  mid = (mid + Math.imul(ah8, bl1)) | 0;
  hi = (hi + Math.imul(ah8, bh1)) | 0;
  lo = (lo + Math.imul(al7, bl2)) | 0;
  mid = (mid + Math.imul(al7, bh2)) | 0;
  mid = (mid + Math.imul(ah7, bl2)) | 0;
  hi = (hi + Math.imul(ah7, bh2)) | 0;
  lo = (lo + Math.imul(al6, bl3)) | 0;
  mid = (mid + Math.imul(al6, bh3)) | 0;
  mid = (mid + Math.imul(ah6, bl3)) | 0;
  hi = (hi + Math.imul(ah6, bh3)) | 0;
  lo = (lo + Math.imul(al5, bl4)) | 0;
  mid = (mid + Math.imul(al5, bh4)) | 0;
  mid = (mid + Math.imul(ah5, bl4)) | 0;
  hi = (hi + Math.imul(ah5, bh4)) | 0;
  lo = (lo + Math.imul(al4, bl5)) | 0;
  mid = (mid + Math.imul(al4, bh5)) | 0;
  mid = (mid + Math.imul(ah4, bl5)) | 0;
  hi = (hi + Math.imul(ah4, bh5)) | 0;
  lo = (lo + Math.imul(al3, bl6)) | 0;
  mid = (mid + Math.imul(al3, bh6)) | 0;
  mid = (mid + Math.imul(ah3, bl6)) | 0;
  hi = (hi + Math.imul(ah3, bh6)) | 0;
  lo = (lo + Math.imul(al2, bl7)) | 0;
  mid = (mid + Math.imul(al2, bh7)) | 0;
  mid = (mid + Math.imul(ah2, bl7)) | 0;
  hi = (hi + Math.imul(ah2, bh7)) | 0;
  lo = (lo + Math.imul(al1, bl8)) | 0;
  mid = (mid + Math.imul(al1, bh8)) | 0;
  mid = (mid + Math.imul(ah1, bl8)) | 0;
  hi = (hi + Math.imul(ah1, bh8)) | 0;
  lo = (lo + Math.imul(al0, bl9)) | 0;
  mid = (mid + Math.imul(al0, bh9)) | 0;
  mid = (mid + Math.imul(ah0, bl9)) | 0;
  hi = (hi + Math.imul(ah0, bh9)) | 0;
  let w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
  w9 &= 0x3ffffff;
  /* k = 10 */
  lo = Math.imul(al9, bl1);
  mid = Math.imul(al9, bh1);
  mid = (mid + Math.imul(ah9, bl1)) | 0;
  hi = Math.imul(ah9, bh1);
  lo = (lo + Math.imul(al8, bl2)) | 0;
  mid = (mid + Math.imul(al8, bh2)) | 0;
  mid = (mid + Math.imul(ah8, bl2)) | 0;
  hi = (hi + Math.imul(ah8, bh2)) | 0;
  lo = (lo + Math.imul(al7, bl3)) | 0;
  mid = (mid + Math.imul(al7, bh3)) | 0;
  mid = (mid + Math.imul(ah7, bl3)) | 0;
  hi = (hi + Math.imul(ah7, bh3)) | 0;
  lo = (lo + Math.imul(al6, bl4)) | 0;
  mid = (mid + Math.imul(al6, bh4)) | 0;
  mid = (mid + Math.imul(ah6, bl4)) | 0;
  hi = (hi + Math.imul(ah6, bh4)) | 0;
  lo = (lo + Math.imul(al5, bl5)) | 0;
  mid = (mid + Math.imul(al5, bh5)) | 0;
  mid = (mid + Math.imul(ah5, bl5)) | 0;
  hi = (hi + Math.imul(ah5, bh5)) | 0;
  lo = (lo + Math.imul(al4, bl6)) | 0;
  mid = (mid + Math.imul(al4, bh6)) | 0;
  mid = (mid + Math.imul(ah4, bl6)) | 0;
  hi = (hi + Math.imul(ah4, bh6)) | 0;
  lo = (lo + Math.imul(al3, bl7)) | 0;
  mid = (mid + Math.imul(al3, bh7)) | 0;
  mid = (mid + Math.imul(ah3, bl7)) | 0;
  hi = (hi + Math.imul(ah3, bh7)) | 0;
  lo = (lo + Math.imul(al2, bl8)) | 0;
  mid = (mid + Math.imul(al2, bh8)) | 0;
  mid = (mid + Math.imul(ah2, bl8)) | 0;
  hi = (hi + Math.imul(ah2, bh8)) | 0;
  lo = (lo + Math.imul(al1, bl9)) | 0;
  mid = (mid + Math.imul(al1, bh9)) | 0;
  mid = (mid + Math.imul(ah1, bl9)) | 0;
  hi = (hi + Math.imul(ah1, bh9)) | 0;
  let w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
  w10 &= 0x3ffffff;
  /* k = 11 */
  lo = Math.imul(al9, bl2);
  mid = Math.imul(al9, bh2);
  mid = (mid + Math.imul(ah9, bl2)) | 0;
  hi = Math.imul(ah9, bh2);
  lo = (lo + Math.imul(al8, bl3)) | 0;
  mid = (mid + Math.imul(al8, bh3)) | 0;
  mid = (mid + Math.imul(ah8, bl3)) | 0;
  hi = (hi + Math.imul(ah8, bh3)) | 0;
  lo = (lo + Math.imul(al7, bl4)) | 0;
  mid = (mid + Math.imul(al7, bh4)) | 0;
  mid = (mid + Math.imul(ah7, bl4)) | 0;
  hi = (hi + Math.imul(ah7, bh4)) | 0;
  lo = (lo + Math.imul(al6, bl5)) | 0;
  mid = (mid + Math.imul(al6, bh5)) | 0;
  mid = (mid + Math.imul(ah6, bl5)) | 0;
  hi = (hi + Math.imul(ah6, bh5)) | 0;
  lo = (lo + Math.imul(al5, bl6)) | 0;
  mid = (mid + Math.imul(al5, bh6)) | 0;
  mid = (mid + Math.imul(ah5, bl6)) | 0;
  hi = (hi + Math.imul(ah5, bh6)) | 0;
  lo = (lo + Math.imul(al4, bl7)) | 0;
  mid = (mid + Math.imul(al4, bh7)) | 0;
  mid = (mid + Math.imul(ah4, bl7)) | 0;
  hi = (hi + Math.imul(ah4, bh7)) | 0;
  lo = (lo + Math.imul(al3, bl8)) | 0;
  mid = (mid + Math.imul(al3, bh8)) | 0;
  mid = (mid + Math.imul(ah3, bl8)) | 0;
  hi = (hi + Math.imul(ah3, bh8)) | 0;
  lo = (lo + Math.imul(al2, bl9)) | 0;
  mid = (mid + Math.imul(al2, bh9)) | 0;
  mid = (mid + Math.imul(ah2, bl9)) | 0;
  hi = (hi + Math.imul(ah2, bh9)) | 0;
  let w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
  w11 &= 0x3ffffff;
  /* k = 12 */
  lo = Math.imul(al9, bl3);
  mid = Math.imul(al9, bh3);
  mid = (mid + Math.imul(ah9, bl3)) | 0;
  hi = Math.imul(ah9, bh3);
  lo = (lo + Math.imul(al8, bl4)) | 0;
  mid = (mid + Math.imul(al8, bh4)) | 0;
  mid = (mid + Math.imul(ah8, bl4)) | 0;
  hi = (hi + Math.imul(ah8, bh4)) | 0;
  lo = (lo + Math.imul(al7, bl5)) | 0;
  mid = (mid + Math.imul(al7, bh5)) | 0;
  mid = (mid + Math.imul(ah7, bl5)) | 0;
  hi = (hi + Math.imul(ah7, bh5)) | 0;
  lo = (lo + Math.imul(al6, bl6)) | 0;
  mid = (mid + Math.imul(al6, bh6)) | 0;
  mid = (mid + Math.imul(ah6, bl6)) | 0;
  hi = (hi + Math.imul(ah6, bh6)) | 0;
  lo = (lo + Math.imul(al5, bl7)) | 0;
  mid = (mid + Math.imul(al5, bh7)) | 0;
  mid = (mid + Math.imul(ah5, bl7)) | 0;
  hi = (hi + Math.imul(ah5, bh7)) | 0;
  lo = (lo + Math.imul(al4, bl8)) | 0;
  mid = (mid + Math.imul(al4, bh8)) | 0;
  mid = (mid + Math.imul(ah4, bl8)) | 0;
  hi = (hi + Math.imul(ah4, bh8)) | 0;
  lo = (lo + Math.imul(al3, bl9)) | 0;
  mid = (mid + Math.imul(al3, bh9)) | 0;
  mid = (mid + Math.imul(ah3, bl9)) | 0;
  hi = (hi + Math.imul(ah3, bh9)) | 0;
  let w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
  w12 &= 0x3ffffff;
  /* k = 13 */
  lo = Math.imul(al9, bl4);
  mid = Math.imul(al9, bh4);
  mid = (mid + Math.imul(ah9, bl4)) | 0;
  hi = Math.imul(ah9, bh4);
  lo = (lo + Math.imul(al8, bl5)) | 0;
  mid = (mid + Math.imul(al8, bh5)) | 0;
  mid = (mid + Math.imul(ah8, bl5)) | 0;
  hi = (hi + Math.imul(ah8, bh5)) | 0;
  lo = (lo + Math.imul(al7, bl6)) | 0;
  mid = (mid + Math.imul(al7, bh6)) | 0;
  mid = (mid + Math.imul(ah7, bl6)) | 0;
  hi = (hi + Math.imul(ah7, bh6)) | 0;
  lo = (lo + Math.imul(al6, bl7)) | 0;
  mid = (mid + Math.imul(al6, bh7)) | 0;
  mid = (mid + Math.imul(ah6, bl7)) | 0;
  hi = (hi + Math.imul(ah6, bh7)) | 0;
  lo = (lo + Math.imul(al5, bl8)) | 0;
  mid = (mid + Math.imul(al5, bh8)) | 0;
  mid = (mid + Math.imul(ah5, bl8)) | 0;
  hi = (hi + Math.imul(ah5, bh8)) | 0;
  lo = (lo + Math.imul(al4, bl9)) | 0;
  mid = (mid + Math.imul(al4, bh9)) | 0;
  mid = (mid + Math.imul(ah4, bl9)) | 0;
  hi = (hi + Math.imul(ah4, bh9)) | 0;
  let w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
  w13 &= 0x3ffffff;
  /* k = 14 */
  lo = Math.imul(al9, bl5);
  mid = Math.imul(al9, bh5);
  mid = (mid + Math.imul(ah9, bl5)) | 0;
  hi = Math.imul(ah9, bh5);
  lo = (lo + Math.imul(al8, bl6)) | 0;
  mid = (mid + Math.imul(al8, bh6)) | 0;
  mid = (mid + Math.imul(ah8, bl6)) | 0;
  hi = (hi + Math.imul(ah8, bh6)) | 0;
  lo = (lo + Math.imul(al7, bl7)) | 0;
  mid = (mid + Math.imul(al7, bh7)) | 0;
  mid = (mid + Math.imul(ah7, bl7)) | 0;
  hi = (hi + Math.imul(ah7, bh7)) | 0;
  lo = (lo + Math.imul(al6, bl8)) | 0;
  mid = (mid + Math.imul(al6, bh8)) | 0;
  mid = (mid + Math.imul(ah6, bl8)) | 0;
  hi = (hi + Math.imul(ah6, bh8)) | 0;
  lo = (lo + Math.imul(al5, bl9)) | 0;
  mid = (mid + Math.imul(al5, bh9)) | 0;
  mid = (mid + Math.imul(ah5, bl9)) | 0;
  hi = (hi + Math.imul(ah5, bh9)) | 0;
  let w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
  w14 &= 0x3ffffff;
  /* k = 15 */
  lo = Math.imul(al9, bl6);
  mid = Math.imul(al9, bh6);
  mid = (mid + Math.imul(ah9, bl6)) | 0;
  hi = Math.imul(ah9, bh6);
  lo = (lo + Math.imul(al8, bl7)) | 0;
  mid = (mid + Math.imul(al8, bh7)) | 0;
  mid = (mid + Math.imul(ah8, bl7)) | 0;
  hi = (hi + Math.imul(ah8, bh7)) | 0;
  lo = (lo + Math.imul(al7, bl8)) | 0;
  mid = (mid + Math.imul(al7, bh8)) | 0;
  mid = (mid + Math.imul(ah7, bl8)) | 0;
  hi = (hi + Math.imul(ah7, bh8)) | 0;
  lo = (lo + Math.imul(al6, bl9)) | 0;
  mid = (mid + Math.imul(al6, bh9)) | 0;
  mid = (mid + Math.imul(ah6, bl9)) | 0;
  hi = (hi + Math.imul(ah6, bh9)) | 0;
  let w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
  w15 &= 0x3ffffff;
  /* k = 16 */
  lo = Math.imul(al9, bl7);
  mid = Math.imul(al9, bh7);
  mid = (mid + Math.imul(ah9, bl7)) | 0;
  hi = Math.imul(ah9, bh7);
  lo = (lo + Math.imul(al8, bl8)) | 0;
  mid = (mid + Math.imul(al8, bh8)) | 0;
  mid = (mid + Math.imul(ah8, bl8)) | 0;
  hi = (hi + Math.imul(ah8, bh8)) | 0;
  lo = (lo + Math.imul(al7, bl9)) | 0;
  mid = (mid + Math.imul(al7, bh9)) | 0;
  mid = (mid + Math.imul(ah7, bl9)) | 0;
  hi = (hi + Math.imul(ah7, bh9)) | 0;
  let w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
  w16 &= 0x3ffffff;
  /* k = 17 */
  lo = Math.imul(al9, bl8);
  mid = Math.imul(al9, bh8);
  mid = (mid + Math.imul(ah9, bl8)) | 0;
  hi = Math.imul(ah9, bh8);
  lo = (lo + Math.imul(al8, bl9)) | 0;
  mid = (mid + Math.imul(al8, bh9)) | 0;
  mid = (mid + Math.imul(ah8, bl9)) | 0;
  hi = (hi + Math.imul(ah8, bh9)) | 0;
  let w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
  w17 &= 0x3ffffff;
  /* k = 18 */
  lo = Math.imul(al9, bl9);
  mid = Math.imul(al9, bh9);
  mid = (mid + Math.imul(ah9, bl9)) | 0;
  hi = Math.imul(ah9, bh9);
  let w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
  w18 &= 0x3ffffff;
  o[0] = w0;
  o[1] = w1;
  o[2] = w2;
  o[3] = w3;
  o[4] = w4;
  o[5] = w5;
  o[6] = w6;
  o[7] = w7;
  o[8] = w8;
  o[9] = w9;
  o[10] = w10;
  o[11] = w11;
  o[12] = w12;
  o[13] = w13;
  o[14] = w14;
  o[15] = w15;
  o[16] = w16;
  o[17] = w17;
  o[18] = w18;
  if (c !== 0) {
    o[19] = c;
    out.length++;
  }
  return out;
}

function smallMulTo(self: BigNumber, num: BigNumber, out: BigNumber) {
  out.negative = num.negative ^ self.negative;
  let len = (self.length + num.length) | 0;
  out.length = len;
  len = (len - 1) | 0;

  // Peel one iteration (compiler can"t do it, because of code complexity)
  let a = self.words[0] | 0;
  let b = num.words[0] | 0;
  let r = a * b;

  const lo = r & 0x3ffffff;
  let carry = (r / 0x4000000) | 0;
  out.words[0] = lo;

  let k = 1
  for (; k < len; k++) {
    // Sum all words with the same `i + j = k` and accumulate `ncarry`,
    // note that ncarry could be >= 0x3ffffff
    let ncarry = carry >>> 26;
    let rword = carry & 0x3ffffff;
    const maxJ = Math.min(k, num.length - 1);
    for (let j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
      const i = (k - j) | 0;
      a = self.words[i] | 0;
      b = num.words[j] | 0;
      r = a * b + rword;
      ncarry += (r / 0x4000000) | 0;
      rword = r & 0x3ffffff;
    }
    out.words[k] = rword | 0;
    carry = ncarry | 0;
  }
  if (carry !== 0) {
    out.words[k] = carry | 0;
  } else {
    out.length--;
  }

  return out._strip();
}

function bigMulTo(self: BigNumber, num: BigNumber, out: BigNumber) {
  out.negative = num.negative ^ self.negative;
  out.length = self.length + num.length;

  let carry = 0;
  let hncarry = 0;
  let k = 0;

  for (; k < out.length - 1; k++) {
    // Sum all words with the same `i + j = k` and accumulate `ncarry`,
    // note that ncarry could be >= 0x3ffffff
    let ncarry = hncarry;
    hncarry = 0;
    let rword = carry & 0x3ffffff;
    const maxJ = Math.min(k, num.length - 1);
    for (let j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
      let i = k - j;
      let a = self.words[i] | 0;
      let b = num.words[j] | 0;
      let r = a * b;

      let lo = r & 0x3ffffff;
      ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
      lo = (lo + rword) | 0;
      rword = lo & 0x3ffffff;
      ncarry = (ncarry + (lo >>> 26)) | 0;

      hncarry += ncarry >>> 26;
      ncarry &= 0x3ffffff;
    }
    out.words[k] = rword;
    carry = ncarry;
    ncarry = hncarry;
  }
  if (carry !== 0) {
    out.words[k] = carry;
  } else {
    out.length--;
  }

  return out._strip();
}

function jumboMulTo(self: BigNumber, num: BigNumber, out: BigNumber) {
  return bigMulTo(self, num, out);
}

function allocate(ArrayType: typeof Array, size: number): number[];
function allocate(ArrayType: typeof Buffer, size: number): Buffer;
function allocate<T extends typeof Buffer | typeof Array>(
  ArrayType: T,
  size: number
): T extends typeof Buffer ? Buffer : number[];
function allocate(ArrayType: typeof Buffer | typeof Array, size: number): Buffer | number[] {
  if ("allocUnsafe" in ArrayType) {
    return ArrayType.allocUnsafe(size);
  }
  return new ArrayType(size);
}

function parseHex4Bits(string: string, index: number): number {
  const char = string.charCodeAt(index);
  // "0" - "9"
  if (char >= 48 && char <= 57) {
    return char - 48;
    // "A" - "F"
  } else if (char >= 65 && char <= 70) {
    return char - 55;
    // "a" - "f"
  } else if (char >= 97 && char <= 102) {
    return char - 87;
  } else {
    throw new Error(`Invalid character in ${string}`);
  }
}

function parseBase(str: string, start: number, end: number, mul: number) {
  let r = 0;
  let b = 0;
  let len = Math.min(str.length, end);
  for (let i = start; i < len; i++) {
    let c = str.charCodeAt(i) - 48;

    r *= mul;

    // "a"
    if (c >= 49) {
      b = c - 49 + 0xa;

      // "A"
    } else if (c >= 17) {
      b = c - 17 + 0xa;

      // "0" - "9"
    } else {
      b = c;
    }
    assert(c >= 0 && b < mul, "Invalid character");
    r += b;
  }
  return r;
}

function parseHexByte(string: string, lowerBound: number, index: number): number {
  let value = parseHex4Bits(string, index);
  if (index - 1 >= lowerBound) {
    value |= parseHex4Bits(string, index - 1) << 4;
  }
  return value;
}

const BN: BNConstructor = BigNumber;
export default BN;