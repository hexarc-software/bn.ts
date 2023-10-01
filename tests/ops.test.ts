import { strict as assert } from "assert";
import BN from "../src";

describe("Basic tests", () => {
  it("Sum two numbers", () => {
    const a: BN = new BN(1);
    const b: BN = new BN(2);
    const c = a.add(b);
    assert(c.toNumber() === 3);
  });

  it("Subtract two numbers", () => {
    const a: BN = new BN(1);
    const b: BN = new BN(2);
    const c = a.sub(b);
    assert(c.toNumber() === -1);
  });
});
