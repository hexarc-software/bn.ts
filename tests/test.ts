import BN from "../src";

const b: BN = new BN(1);
const c: BN = new BN(2);
const d = b.add(c);

console.log(d.toNumber() === 3);