import { describe, expect, it } from "vitest";
import { formatRate, variation } from "../src/format";

describe("formatRate", () => {
  it("uses the currency symbol and 4 decimals (2 for JPY)", () => {
    expect(formatRate("BRL", 5.4321, "en-US")).toBe("R$ 5.4321");
    expect(formatRate("EUR", 0.92, "en-US")).toBe("€ 0.9200");
    expect(formatRate("CNY", 7.1, "en-US")).toBe("¥ 7.1000");
    expect(formatRate("JPY", 150.5, "en-US")).toBe("¥ 150.50");
  });
});

describe("variation", () => {
  it("is empty without a previous quote", () => {
    expect(variation(undefined, 5)).toBeNull();
  });

  it("gives direction, absolute and percentual change", () => {
    expect(variation(5, 5.5)).toEqual({ up: true, text: "▲ 0.5000 (10.000%)" });
    expect(variation(5, 4.5)).toEqual({ up: false, text: "▼ -0.5000 (-10.000%)" });
  });
});
