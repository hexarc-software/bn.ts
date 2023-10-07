export type Endianness = "le" | "be";
export type IPrimeName = "k256" | "p224" | "p192" | "p25519";
export type CmpResult = -1 | 0 | 1;

export interface MPrime {
  name: string;
  p: BN;
  n: number;
  k: BN;
}

export interface ReductionContext {
  m: BN;
  prime: MPrime | null;
}

export interface BNConstructor {
  BN: BNConstructor;
  wordSize: 26;

  red(value: BN | IPrimeName): ReductionContext;

  mont(value: BN | IPrimeName): ReductionContext;

  isBN(value: any): value is BN;

  max(left: BN, right: BN): BN;

  min(left: BN, right: BN): BN;

  new(
    number: number | string | number[] | Uint8Array | Buffer | BN,
    base?: number | "hex",
    endian?: Endianness
  ): BN;

  new(
    number: number | string | number[] | Uint8Array | Buffer | BN,
    endian?: Endianness
  ): BN;
}

export interface BN {
  clone(): BN;

  copy(dest: BN): void;

  toString(base?: number | "hex", padding?: number): string;

  toNumber(): number;

  toJSON(): string;

  toArray(endian?: Endianness, length?: number): number[];

  toArrayLike<T extends typeof Buffer | typeof Array>(
    ArrayType: T,
    endian?: Endianness,
    length?: number
  ): T extends typeof Buffer ? Buffer : number[];

  toBuffer(endian?: Endianness, length?: number): Buffer;

  bitLength(): number;

  zeroBits(): number;

  byteLength(): number;

  isNeg(): boolean;

  isEven(): boolean;

  isOdd(): boolean;

  isZero(): boolean;

  cmp(value: BN): CmpResult;

  ucmp(value: BN): CmpResult;

  cmpn(value: number): CmpResult;

  lt(value: BN): boolean;

  ltn(value: number): boolean;

  lte(value: BN): boolean;

  lten(value: number): boolean;

  gt(value: BN): boolean;

  gtn(value: number): boolean;

  gte(value: BN): boolean;

  gten(value: number): boolean;

  eq(value: BN): boolean;

  eqn(value: number): boolean;

  toTwos(width: number): BN;

  fromTwos(width: number): BN;

  neg(): BN;

  ineg(): BN;

  abs(): BN;

  iabs(): BN;

  add(value: BN): BN;

  iadd(value: BN): BN;

  addn(value: number): BN;

  iaddn(value: number): BN;

  sub(value: BN): BN;

  isub(value: BN): BN;

  subn(value: number): BN;

  isubn(value: number): BN;

  mulTo(num: BN, out: BN): void;

  mul(value: BN): BN;

  mulf(value: BN): BN;

  imul(value: BN): BN;

  muln(value: number): BN;

  imuln(value: number): BN;

  sqr(): BN;

  isqr(): BN;

  pow(exponent: BN): BN;

  div(value: BN): BN;

  divn(value: number): BN;

  idivn(value: number): BN;

  divmod(value: BN, mode?: "div" | "mod", positive?: boolean): { div: BN; mod: BN };

  mod(value: BN): BN;

  umod(value: BN): BN;

  modn(value: number): number;

  modrn(value: number): number;

  divRound(value: BN): BN;

  or(value: BN): BN;

  ior(value: BN): BN;

  uor(value: BN): BN;

  iuor(value: BN): BN;

  and(value: BN): BN;

  iand(value: BN): BN;

  uand(value: BN): BN;

  iuand(value: BN): BN;

  andln(value: number): number;

  xor(value: BN): BN;

  ixor(value: BN): BN;

  uxor(value: BN): BN;

  iuxor(value: BN): BN;

  setn(bit: number, value: boolean): BN;

  shln(b: number): BN;

  ishln(b: number): BN;

  ushln(b: number): BN;

  iushln(b: number): BN;

  shrn(b: number): BN;

  ishrn(bits: number, hint?: number, extended?: BN): BN;

  ushrn(b: number): BN;

  iushrn(bits: number, hint?: number, extended?: BN): BN;

  testn(b: number): boolean;

  maskn(b: number): BN;

  imaskn(b: number): BN;

  bincn(b: number): BN;

  notn(w: number): BN;

  inotn(w: number): BN;

  gcd(b: BN): BN;

  egcd(b: BN): { a: BN; b: BN; gcd: BN };

  invm(b: BN): BN;

  toRed(reductionContext: ReductionContext): RedBN;
}

export interface RedBN extends BN {
  clone(): RedBN;

  fromRed(): BN;

  redAdd(value: RedBN): RedBN;

  redIAdd(value: RedBN): RedBN;

  redSub(value: RedBN): RedBN;

  redISub(value: RedBN): RedBN;

  redShl(value: number): RedBN;

  redMul(value: RedBN): RedBN;

  redIMul(value: RedBN): RedBN;

  redSqr(): RedBN;

  redISqr(): RedBN;

  redSqrt(): RedBN;

  redInvm(): RedBN;

  redNeg(): RedBN;

  redPow(exponent: BN): RedBN;
}
