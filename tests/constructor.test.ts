import { strict as assert } from "assert";
import { BigNumber as BN } from "../src/bn";

describe("BN.ts/Constructor", () => {
  describe("with Smi input", () => {
    it("should accept one limb number", () => {
      assert.equal(new BN(12345).toString(16), "3039");
    });

    it("should accept two-limb number", () => {
      assert.equal(new BN(0x4123456).toString(16), "4123456");
    });

    it("should accept 52 bits of precision", () => {
      const num = Math.pow(2, 52);
      assert.equal(new BN(num, 10).toString(10), num.toString(10));
    });

    it("should accept max safe integer", () => {
      const num = Math.pow(2, 53) - 1;
      assert.equal(new BN(num, 10).toString(10), num.toString(10));
    });

    it("should not accept an unsafe integer", () => {
      const num = Math.pow(2, 53);

      assert.throws(() => {
        return new BN(num, 10);
      }, /^Error: Assertion failed$/);
    });

    it("should accept two-limb LE number", () => {
      // TODO: Fix
      assert.equal(new BN(0x4123456, null as any, "le").toString(16), "56341204");
    });
  });

  describe("with String input", () => {
    it("should accept base-16", () => {
      assert.equal(new BN("1A6B765D8CDF", 16).toString(16), "1a6b765d8cdf");
      assert.equal(new BN("1A6B765D8CDF", 16).toString(), "29048849665247");
    });

    it("should accept base-hex", () => {
      assert.equal(new BN("FF", "hex").toString(), "255");
    });

    it("should accept base-16 with spaces", () => {
      const num = "a89c e5af8724 c0a23e0e 0ff77500";
      assert.equal(new BN(num, 16).toString(16), num.replace(/ /g, ""));
    });

    it("should accept long base-16", () => {
      const num = "123456789abcdef123456789abcdef123456789abcdef";
      assert.equal(new BN(num, 16).toString(16), num);
    });

    it("should accept positive base-10", () => {
      assert.equal(new BN("10654321").toString(), "10654321");
      assert.equal(new BN("29048849665247").toString(16), "1a6b765d8cdf");
    });

    it("should accept negative base-10", () => {
      assert.equal(new BN("-29048849665247").toString(16), "-1a6b765d8cdf");
    });

    it("should accept long base-10", () => {
      const num = "10000000000000000";
      assert.equal(new BN(num).toString(10), num);
    });

    it("should accept base-2", () => {
      const base2 = "11111111111111111111111111111111111111111111111111111";
      assert.equal(new BN(base2, 2).toString(2), base2);
    });

    it("should accept base-36", () => {
      const base36 = "zzZzzzZzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
      assert.equal(new BN(base36, 36).toString(36), base36.toLowerCase());
    });

    it("should not overflow limbs during base-10", () => {
      const num = "65820182292848241686198767302293" +
        "20890292528855852623664389292032";
      assert(new BN(num).words[0] < 0x4000000);
    });

    it("should accept base-16 LE integer", () => {
      assert.equal(new BN("1A6B765D8CDF", 16, "le").toString(16),
        "df8c5d766b1a");
    });

    it("should accept base-16 LE integer with leading zeros", () => {
      assert.equal(new BN("0010", 16, "le").toNumber(), 4096);
      assert.equal(new BN("-010", 16, "le").toNumber(), -4096);
      assert.equal(new BN("010", 16, "le").toNumber(), 4096);
    });

    it("should not accept wrong characters for base", () => {
      assert.throws(() => {
        return new BN("01FF");
      }, /^Error: Invalid character$/);
    });

    it("should not accept decimal", () => {
      assert.throws(() => {
        new BN("10.00", 10); // eslint-disable-line no-new
      }, /Invalid character/);

      assert.throws(() => {
        new BN("16.00", 16); // eslint-disable-line no-new
      }, /Invalid character/);
    });

    it("should not accept non-hex characters", () => {
      [
        "0000000z",
        "000000gg",
        "0000gg00",
        "fffggfff",
        "/0000000",
        "0-000000", // if -, is first, that is OK
        "ff.fffff",
        "hexadecimal"
      ].forEach(function (str) {
        assert.throws(() => {
          new BN(str, 16); // eslint-disable-line no-new
        }, /Invalid character in /);
      });
    });
  });

  describe("with Array input", () => {
    it("should not fail on empty array", () => {
      assert.equal(new BN([]).toString(16), "0");
    });

    it("should import/export big endian", () => {
      assert.equal(new BN([0, 1], 16).toString(16), "1");
      assert.equal(new BN([1, 2, 3]).toString(16), "10203");
      assert.equal(new BN([1, 2, 3, 4]).toString(16), "1020304");
      assert.equal(new BN([1, 2, 3, 4, 5]).toString(16), "102030405");
      assert.equal(new BN([1, 2, 3, 4, 5, 6, 7, 8]).toString(16),
        "102030405060708");
      assert.equal(new BN([1, 2, 3, 4]).toArray().join(","), "1,2,3,4");
      assert.equal(new BN([1, 2, 3, 4, 5, 6, 7, 8]).toArray().join(","),
        "1,2,3,4,5,6,7,8");
    });

    it("should import little endian", () => {
      assert.equal(new BN([0, 1], 16, "le").toString(16), "100");
      assert.equal(new BN([1, 2, 3], 16, "le").toString(16), "30201");
      assert.equal(new BN([1, 2, 3, 4], 16, "le").toString(16), "4030201");
      assert.equal(new BN([1, 2, 3, 4, 5], 16, "le").toString(16),
        "504030201");
      assert.equal(new BN([1, 2, 3, 4, 5, 6, 7, 8], "le").toString(16),
        "807060504030201");
      assert.equal(new BN([1, 2, 3, 4]).toArray("le").join(","), "4,3,2,1");
      assert.equal(new BN([1, 2, 3, 4, 5, 6, 7, 8]).toArray("le").join(","),
        "8,7,6,5,4,3,2,1");
    });

    it("should import big endian with implicit base", () => {
      assert.equal(new BN([1, 2, 3, 4, 5], "le").toString(16), "504030201");
    });
  });

  // the Array code is able to handle Buffer
  describe("with Buffer input", () => {
    it("should not fail on empty Buffer", () => {
      assert.equal(new BN(Buffer.alloc(0)).toString(16), "0");
    });

    it("should import/export big endian", () => {
      assert.equal(new BN(Buffer.from("010203", "hex")).toString(16), "10203");
    });

    it("should import little endian", () => {
      assert.equal(new BN(Buffer.from("010203", "hex"), "le").toString(16), "30201");
    });
  });

  describe("with BN input", () => {
    it("should clone BN", () => {
      const num = new BN(12345);
      assert.equal(new BN(num).toString(10), "12345");
    });
  });
});