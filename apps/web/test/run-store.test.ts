import { describe, expect, it } from "vitest";
import type { Quote, RunEvent, RunState } from "@skail-usd-quote/contracts";
import { RunStore } from "../src/run-store.js";

const quote = (rate: number): Quote => ({ currency: "BRL", rate, at: "2026-01-01T00:00:00.000Z" });
const event = (stage: RunEvent["stage"], quoteNumber: number, q?: Quote): RunEvent => ({
  runId: "r1",
  stage,
  quoteNumber,
  quote: q ?? null,
});

describe("RunStore", () => {
  it("creates a run in Starting with the chosen currency", () => {
    const store = new RunStore();
    expect(store.create("r1", "EUR")).toEqual({
      runId: "r1",
      currency: "EUR",
      stage: "Starting",
      quoteCount: 0,
      quotes: [],
      error: null,
      stopRequested: false,
    });
    expect(store.get("r1")?.currency).toBe("EUR");
    expect(store.get("nope")).toBeUndefined();
  });

  it("applies Quoted events: appends the quote and advances the quote count", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    expect(store.apply(event("Quoted", 1, quote(5.1)))).toBe(true);
    expect(store.apply(event("Quoted", 2, quote(5.2)))).toBe(true);
    const run = store.get("r1")!;
    expect(run.stage).toBe("Quoted");
    expect(run.quoteCount).toBe(2);
    expect(run.quotes.map((q) => q.rate)).toEqual([5.1, 5.2]);
  });

  it("ignores a repeated event for the same run, stage and quote number (command retries)", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    store.apply(event("Quoted", 1, quote(5.1)));
    expect(store.apply(event("Quoted", 1, quote(5.1)))).toBe(false);
    expect(store.get("r1")!.quotes).toHaveLength(1);
  });

  it("ignores events for unknown runs and for finished runs", () => {
    const store = new RunStore();
    expect(store.apply(event("Quoted", 1, quote(1)))).toBe(false);
    store.create("r1", "BRL");
    store.apply(event("Stopped", 1));
    expect(store.apply(event("Quoted", 2, quote(1)))).toBe(false);
    expect(store.get("r1")!.stage).toBe("Stopped");
  });

  it("keeps the error of a Failed event", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    store.apply({ runId: "r1", stage: "Failed", quoteNumber: 1, error: "quote api down" });
    expect(store.get("r1")).toMatchObject({ stage: "Failed", error: "quote api down" });
  });

  it("a failure keeps the count of quotes received", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    store.apply(event("Quoted", 1, { currency: "BRL", rate: 5, at: "2026-01-01T00:00:00.000Z" }));
    store.apply({ runId: "r1", stage: "Failed", quoteNumber: 2, error: "quote api down" });
    expect(store.get("r1")).toMatchObject({ stage: "Failed", quoteCount: 1 });
  });

  it("requestStop: Requested once, then AlreadyRequested; AlreadyFinished and NotFound", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    expect(store.requestStop("r1")).toBe("Requested");
    expect(store.get("r1")!.stopRequested).toBe(true);
    expect(store.requestStop("r1")).toBe("AlreadyRequested");
    store.apply(event("Stopped", 1));
    expect(store.requestStop("r1")).toBe("AlreadyFinished");
    expect(store.requestStop("zzz")).toBe("NotFound");
  });

  it("cancelStopRequest lets the user try Stop again", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    store.requestStop("r1");
    store.cancelStopRequest("r1");
    expect(store.get("r1")!.stopRequested).toBe(false);
    expect(store.requestStop("r1")).toBe("Requested");
  });

  it("remove forgets the run", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    store.remove("r1");
    expect(store.get("r1")).toBeUndefined();
  });

  it("publishes every change to subscribers until the run is terminal, then closes them", async () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    const seen: RunState[] = [];
    let closed = false;
    store.subscribe(
      "r1",
      (state) => seen.push(state),
      () => (closed = true),
    );

    store.apply(event("Quoted", 1, quote(5)));
    store.requestStop("r1");
    store.apply(event("Stopped", 1));

    expect(seen.map((s) => [s.stage, s.stopRequested])).toEqual([
      ["Quoted", false],
      ["Quoted", true],
      ["Stopped", true],
    ]);
    expect(closed).toBe(true);
  });

  it("unsubscribe stops notifications", () => {
    const store = new RunStore();
    store.create("r1", "BRL");
    const seen: RunState[] = [];
    const unsubscribe = store.subscribe(
      "r1",
      (s) => seen.push(s),
      () => {},
    );
    unsubscribe();
    store.apply(event("Quoted", 1, quote(5)));
    expect(seen).toHaveLength(0);
  });
});
