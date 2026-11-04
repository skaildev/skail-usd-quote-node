import { describe, expect, it } from "vitest";
import {
  Currencies,
  Events,
  QuoteLimits,
  buttonRules,
  isStopSignal,
  parseCurrency,
  type RunState,
} from "../src/index.js";

const run = (patch: Partial<RunState> = {}): RunState => ({
  runId: "r1",
  currency: "BRL",
  stage: "Starting",
  quoteCount: 0,
  quotes: [],
  stopRequested: false,
  ...patch,
});

describe("constants", () => {
  it("keeps the shared limits and the event name", () => {
    expect(QuoteLimits.maxQuotes).toBe(20);
    expect(QuoteLimits.intervalSeconds).toBe(30);
    expect(Events.stopTracking).toBe("STOP_TRACKING");
  });
});

describe("currencies", () => {
  it("lists BRL first (default), EUR, CNY and JPY with display metadata", () => {
    expect(Currencies.default).toBe("BRL");
    expect(Currencies.all.map((c) => [c.code, c.name, c.symbol])).toEqual([
      ["BRL", "Real", "R$"],
      ["EUR", "Euro", "€"],
      ["CNY", "Yuan", "¥"],
      ["JPY", "Yen", "¥"],
    ]);
  });

  it("parses codes case-insensitively and rejects unknown ones", () => {
    expect(parseCurrency("eur")).toBe("EUR");
    expect(parseCurrency("JPY")).toBe("JPY");
    expect(parseCurrency("USD")).toBeUndefined();
    expect(parseCurrency(undefined)).toBeUndefined();
  });
});

describe("isStopSignal", () => {
  it("is true for any payload delivered by the stop event, never for the delay result", () => {
    expect(isStopSignal(Events.stopPayload)).toBe(true);
    expect(isStopSignal({})).toBe(true); // the empty JSON object the web app fires
    expect(isStopSignal(true)).toBe(true);
    expect(isStopSignal(undefined)).toBe(false);
    expect(isStopSignal(null)).toBe(false);
  });
});

describe("buttonRules (single Start/Stop toggle)", () => {
  it("shows Start when there is no run or the run is terminal", () => {
    const start = { action: "Start", label: "Start", enabled: true, currencyEnabled: true };
    expect(buttonRules(undefined)).toEqual(start);
    for (const stage of ["Stopped", "Completed", "Failed"] as const) {
      expect(buttonRules(run({ stage }))).toEqual(start);
    }
  });

  it("shows Stop while the run is active and locks the currency", () => {
    for (const stage of ["Starting", "Quoted"] as const) {
      expect(buttonRules(run({ stage }))).toEqual({
        action: "Stop",
        label: "Stop",
        enabled: true,
        currencyEnabled: false,
      });
    }
  });

  it("shows a disabled Stopping… after Stop was requested, until a terminal stage", () => {
    expect(buttonRules(run({ stage: "Quoted", stopRequested: true }))).toEqual({
      action: "Stop",
      label: "Stopping…",
      enabled: false,
      currencyEnabled: false,
    });
    expect(buttonRules(run({ stage: "Stopped", stopRequested: true })).action).toBe("Start");
  });
});
