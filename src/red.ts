import { BigNumber, move } from "./bn";
import { MPrime, prime } from "./primes";
import { assert } from "./utils";
import type { IPrimeName } from "./types";

export class Red {
  prime: MPrime | null;
  m: BigNumber;

  constructor(number: IPrimeName | BigNumber) {
    if (number instanceof BigNumber) {
      assert(number.gtn(1), "modulus must be greater than 1");
      this.prime = null;
      this.m = number;
    } else {
      this.prime = prime(number);
      this.m = this.prime.p;
    }
  }

  _verify1(a: BigNumber) {
    assert(a.negative === 0, "red works only with positives");
    assert(a.red, "red works only with red numbers");
  }

  _verify2 = function _verify2(a: BigNumber, b: BigNumber) {
    assert((a.negative | b.negative) === 0, "red works only with positives");
    assert(a.red && a.red === b.red, "red works only with red numbers");
  }

  imod(a: BigNumber) {
    if (this.prime) return this.prime.ireduce(a)._forceRed(this);

    move(a, a.umod(this.m)._forceRed(this));
    return a;
  }

  neg(a: BigNumber) {
    if (a.isZero()) {
      return a.clone();
    }

    return this.m.sub(a)._forceRed(this);
  }

  add(a: BigNumber, b: BigNumber) {
    this._verify2(a, b);

    const res = a.add(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res._forceRed(this);
  }

  iadd(a: BigNumber, b: BigNumber) {
    this._verify2(a, b);

    const res = a.iadd(b);
    if (res.cmp(this.m) >= 0) {
      res.isub(this.m);
    }
    return res;
  }

  sub(a: BigNumber, b: BigNumber) {
    this._verify2(a, b);

    const res = a.sub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res._forceRed(this);
  }

  isub(a: BigNumber, b: BigNumber) {
    this._verify2(a, b);

    const res = a.isub(b);
    if (res.cmpn(0) < 0) {
      res.iadd(this.m);
    }
    return res;
  }

  shl(a: BigNumber, num: number) {
    this._verify1(a);
    return this.imod(a.ushln(num));
  };

  imul(a: BigNumber, b: BigNumber) {
    this._verify2(a, b);
    return this.imod(a.imul(b));
  }

  mul(a: BigNumber, b: BigNumber) {
    this._verify2(a, b);
    return this.imod(a.mul(b));
  }

  isqr(a: BigNumber) {
    return this.imul(a, a.clone());
  }

  sqr(a: BigNumber) {
    return this.mul(a, a);
  }

  sqrt(a: BigNumber) {
    if (a.isZero()) return a.clone();

    const mod3 = this.m.andln(3);
    assert(mod3 % 2 === 1);

    // Fast case
    if (mod3 === 3) {
      const pow = this.m.add(new BigNumber(1)).iushrn(2);
      return this.pow(a, pow);
    }

    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
    //
    // Find Q and S, that Q * 2 ^ S = (P - 1)
    const q = this.m.subn(1);
    let s = 0;
    while (!q.isZero() && q.andln(1) === 0) {
      s++;
      q.iushrn(1);
    }
    assert(!q.isZero());

    const one = new BigNumber(1).toRed(this);
    const nOne = one.redNeg();

    // Find quadratic non-residue
    // NOTE: Max is such because of generalized Riemann hypothesis.
    const lpow = this.m.subn(1).iushrn(1);
    const bitLength = this.m.bitLength();
    const z = new BigNumber(2 * bitLength * bitLength).toRed(this);

    while (this.pow(z, lpow).cmp(nOne) !== 0) {
      z.redIAdd(nOne);
    }

    let c = this.pow(z, q);
    let r = this.pow(a, q.addn(1).iushrn(1));
    let t = this.pow(a, q);
    let m = s;
    while (t.cmp(one) !== 0) {
      let tmp = t;
      let i = 0;
      for (; tmp.cmp(one) !== 0; i++) {
        tmp = tmp.redSqr();
      }
      assert(i < m);
      const b = this.pow(c, new BigNumber(1).iushln(m - i - 1));

      r = r.redMul(b);
      c = b.redSqr();
      t = t.redMul(c);
      m = i;
    }

    return r;
  }

  invm(a: BigNumber) {
    const inv = a._invmp(this.m);
    if (inv.negative !== 0) {
      inv.negative = 0;
      return this.imod(inv).redNeg();
    } else {
      return this.imod(inv);
    }
  }

  pow(a: BigNumber, num: BigNumber) {
    if (num.isZero()) return new BigNumber(1).toRed(this);
    if (num.cmpn(1) === 0) return a.clone();

    const windowSize = 4;
    const wnd = new Array(1 << windowSize);
    wnd[0] = new BigNumber(1).toRed(this);
    wnd[1] = a;
    let i = 2;
    for (; i < wnd.length; i++) {
      wnd[i] = this.mul(wnd[i - 1], a);
    }

    let res = wnd[0];
    let current = 0;
    let currentLen = 0;
    let start = num.bitLength() % 26;
    if (start === 0) {
      start = 26;
    }

    for (i = num.length - 1; i >= 0; i--) {
      const word = num.words[i];
      for (let j = start - 1; j >= 0; j--) {
        const bit = (word >> j) & 1;
        if (res !== wnd[0]) {
          res = this.sqr(res);
        }

        if (bit === 0 && current === 0) {
          currentLen = 0;
          continue;
        }

        current <<= 1;
        current |= bit;
        currentLen++;
        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

        res = this.mul(res, wnd[current]);
        currentLen = 0;
        current = 0;
      }
      start = 26;
    }

    return res;
  }

  convertTo(num: BigNumber) {
    const r = num.umod(this.m);
    return r === num ? r.clone() : r;
  }

  convertFrom(num: BigNumber) {
    const res = num.clone();
    res.red = null;
    return res;
  }
}