import { BigNumber } from "./bn";
import { Red } from "./red";
import type { IPrimeName } from "./types";

export class Mont extends Red {
  shift: number;
  r: BigNumber;
  r2: BigNumber;
  rinv: BigNumber;
  minv: BigNumber;

  public constructor(m: BigNumber | IPrimeName) {
    super(m);

    this.shift = this.m.bitLength();
    if (this.shift % 26 !== 0) {
      this.shift += 26 - (this.shift % 26);
    }
  
    this.r = new BigNumber(1).iushln(this.shift);
    this.r2 = this.imod(this.r.sqr());
    this.rinv = this.r._invmp(this.m);
  
    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
    this.minv = this.minv.umod(this.r);
    this.minv = this.r.sub(this.minv);
  }

  convertTo(num: BigNumber) {
    return this.imod(num.ushln(this.shift));
  }
  
  convertFrom(num: BigNumber) {
    const r = this.imod(num.mul(this.rinv));
    r.red = null;
    return r;
  }
  
  imul(a: BigNumber, b: BigNumber): BigNumber {
    if (a.isZero() || b.isZero()) {
      a.words[0] = 0;
      a.length = 1;
      return a;
    }
  
    const t = a.imul(b);
    const c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    const u = t.isub(c).iushrn(this.shift);
    let res = u;
  
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }
  
    return res._forceRed(this);
  }
  
  mul(a: BigNumber, b: BigNumber): BigNumber {
    if (a.isZero() || b.isZero()) {
      return new BigNumber(0)._forceRed(this);
    }
  
    const t = a.mul(b);
    const c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
    const u = t.isub(c).iushrn(this.shift);
    let res = u;
    if (u.cmp(this.m) >= 0) {
      res = u.isub(this.m);
    } else if (u.cmpn(0) < 0) {
      res = u.iadd(this.m);
    }
  
    return res._forceRed(this);
  }
  
  invm(a: BigNumber): BigNumber {
    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
    const res = this.imod(a._invmp(this.m).mul(this.r2));
    return res._forceRed(this);
  }
}
