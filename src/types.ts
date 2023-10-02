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

  cmp(b: BN): CmpResult;

  ucmp(b: BN): CmpResult;

  cmpn(b: number): CmpResult;

  lt(b: BN): boolean;

  ltn(b: number): boolean;

  lte(b: BN): boolean;

  lten(b: number): boolean;

  gt(b: BN): boolean;

  gtn(b: number): boolean;

  gte(b: BN): boolean;

  gten(b: number): boolean;

  eq(b: BN): boolean;

  eqn(b: number): boolean;

  toTwos(width: number): BN;

  fromTwos(width: number): BN;

  neg(): BN;

  ineg(): BN;

  abs(): BN;

  iabs(): BN;

  add(b: BN): BN;

  iadd(b: BN): BN;

  addn(b: number): BN;

  iaddn(b: number): BN;

  sub(b: BN): BN;

  isub(b: BN): BN;

  subn(b: number): BN;

  isubn(b: number): BN;

  mulTo(num: BN, out: BN): void;

  mul(b: BN): BN;

  mulf(b: BN): BN;

  imul(b: BN): BN;

  muln(b: number): BN;

  imuln(b: number): BN;

  sqr(): BN;

  isqr(): BN;

  pow(b: BN): BN;

  div(b: BN): BN;

  divn(b: number): BN;

  idivn(b: number): BN;

  divmod(b: BN, mode?: "div" | "mod", positive?: boolean): { div: BN; mod: BN };

  mod(b: BN): BN;

  umod(b: BN): BN;

  modn(b: number): number;

  modrn(b: number): number;

  divRound(b: BN): BN;

  or(b: BN): BN;

  ior(b: BN): BN;

  uor(b: BN): BN;

  iuor(b: BN): BN;

  and(b: BN): BN;

  iand(b: BN): BN;

  uand(b: BN): BN;

  iuand(b: BN): BN;

  andln(b: number): number;

  xor(b: BN): BN;

  ixor(b: BN): BN;

  uxor(b: BN): BN;

  iuxor(b: BN): BN;

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

  redAdd(b: RedBN): RedBN;

  redIAdd(b: RedBN): RedBN;

  redSub(b: RedBN): RedBN;

  redISub(b: RedBN): RedBN;

  redShl(num: number): RedBN;

  redMul(b: RedBN): RedBN;

  redIMul(b: RedBN): RedBN;

  redSqr(): RedBN;

  redISqr(): RedBN;

  redSqrt(): RedBN;

  redInvm(): RedBN;

  redNeg(): RedBN;

  redPow(exponent: BN): RedBN;
}
