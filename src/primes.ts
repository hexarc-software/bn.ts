import { BigNumber } from "./bn";
import type { IPrimeName } from "./types";

export class MPrime {
  name: string;
  p: BigNumber;
  n: number;
  k: BigNumber;
  tmp: BigNumber;

  public constructor(name: string, p: string) {
    this.name = name;
    this.p = new BigNumber(p, 16);
    this.n = this.p.bitLength();
    this.k = new BigNumber(1).iushln(this.n).isub(this.p);
    this.tmp = this._tmp();
  }

  _tmp() {
    const tmp = new BigNumber(null);
    tmp.words = new Array(Math.ceil(this.n / 13));
    return tmp;
  };

  public ireduce(num: BigNumber) {
    // Assumes that `num` is less than `P^2`
    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
    let r = num;
    let rlen: number;

    do {
      this.split(r, this.tmp);
      r = this.imulK(r);
      r = r.iadd(this.tmp);
      rlen = r.bitLength();
    } while (rlen > this.n);

    const cmp = rlen < this.n ? -1 : r.ucmp(this.p);
    if (cmp === 0) {
      r.words[0] = 0;
      r.length = 1;
    } else if (cmp > 0) {
      r.isub(this.p);
    } else {
      if ("strip" in r) {
        // r is a BN v4 instance
        // TODO: FIX
        (r["strip"] as any)();
      } else {
        // r is a BN v5 instance
        r._strip();
      }
    }

    return r;
  }

  split(input: BigNumber, out: BigNumber) {
    input.iushrn(this.n, 0, out);
  }

  imulK(num: BigNumber) {
    return num.imul(this.k);
  }
}

class K256 extends MPrime {
  public constructor() {
    super("k256", "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f");
  }
}

class P224 extends MPrime {
  public constructor() {
    super("p224", "ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001");
  }
}

class P192 extends MPrime {
  public constructor() {
    super("p192", "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff");
  }
}

class P25519 extends MPrime {
  public constructor() {
    super("25519", "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed");
  }
}

const primes = new Map<IPrimeName, MPrime>();

export function prime(name: IPrimeName) {
  let cached = primes.get(name);
  if (cached != null) {
    return cached;
  }

  switch (name) {
    case "k256":
      cached = new K256();
      break;
    case "p224":
      cached = new P224();
      break;
    case "p192":
      cached = new P192();
      break;
    case "p25519":
      cached = new P25519();
      break;
    default:
      throw new Error(`Unknown prime ${name}`);
  }
  primes.set(name, cached);

  return cached;
}
