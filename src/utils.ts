export function assert(value: any, message?: string): asserts value is true {
  if (!value) {
    throw new Error(message || "Assertion failed");
  }
}
