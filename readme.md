Modern big number implementation in TypeScript
===========
# <img src="./bn.png" alt="bn.ts" width="128" height="128" />

[![Version](http://img.shields.io/npm/v/bn.ts.svg)](https://www.npmjs.org/package/bn.ts)
[![License](http://img.shields.io/:license-mit-blue.svg)](http://badges.mit-license.org)
[![Downloads](http://img.shields.io/npm/dm/bn.ts.svg)](https://npmjs.org/package/bn.ts)
[![Downloads](http://img.shields.io/npm/dt/bn.ts.svg)](https://npmjs.org/package/bn.ts)

A big number implementation in TypeScript. It's based on [bn.js](https://github.com/indutny/bn.js) but overhauled and refactored using modern JavaScript/TypeScript with type annotations out of the box.

## Install with npm:

```sh
npm install --save bn.ts
```

## Usage

```ts
import BN from "bn.ts";

const a = new BN("dead", 16);
const b = new BN("101010", 2);

const res = a.add(b);
console.log(res.toString(10));  // 57047
```

## Compatibility
As this library is fully compatible with `bn.js` you can use in the [same way](https://github.com/indutny/bn.js#instructions).

## License

[MIT](LICENSE)
