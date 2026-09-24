import { describe, expect, it } from "vitest";
import {
  centsToDecimal,
  decimalToCents,
  sumDecimal,
} from "./benefitCycleModel";

describe("benefit cycle decimal helpers", () => {
  it("preserves cents without binary floating point aggregation", () => {
    expect(sumDecimal(["0.10", "0.20", "699.93", "0.07"])).toBe("700.30");
  });

  it("supports negative movement values and zero", () => {
    expect(decimalToCents("-12.34")).toBe(-1234n);
    expect(centsToDecimal(0n)).toBe("0.00");
    expect(sumDecimal(["100.00", "-40.25"])).toBe("59.75");
  });

  it("does not turn malformed historical values into a financial amount", () => {
    expect(decimalToCents(undefined)).toBe(0n);
    expect(decimalToCents("legacy")).toBe(0n);
  });
});
