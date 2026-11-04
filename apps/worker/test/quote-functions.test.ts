import { beforeEach, describe, expect, it } from "vitest";
import { EventType, type Provider } from "@skail/runtime";
import { createSkailWorker, type SkailWorker } from "@skail/runtime/testing";
import { InMemorySkailPlatform } from "@skail/testing";
import { Events, QuoteLimits, type Currency, type Quote, type RunEvent } from "@skail-usd-quote/contracts";
import { QuoteFunctions } from "../src/quote-functions.js";
import type { QuoteProvider } from "../src/quotes.js";
import type { ProgressNotifier } from "../src/progress.js";

const WORKLOAD = "usd-quote:v0.0.1";
const URI = `${WORKLOAD}/TrackUsdQuote`;

class Harness {
  readonly requested: Currency[] = [];
  readonly events: RunEvent[] = [];
  failQuotes = 0; // transient failures before succeeding
  alwaysFail = false;
  readonly platform = new InMemorySkailPlatform();
  readonly worker: SkailWorker;
  taskId = "run-1";

  constructor() {
    const quotes: QuoteProvider = {
      get: async (currency) => {
        this.requested.push(currency);
        if (this.alwaysFail) throw new Error("quote api down");
        if (this.failQuotes > 0) {
          this.failQuotes--;
          throw new Error("transient");
        }
        return { currency, rate: 5 + this.requested.length / 100, at: "2026-01-01T00:00:00.000Z" } satisfies Quote;
      },
    };
    const notifier: ProgressNotifier = { notify: async (event) => void this.events.push(event) };
    const providers: Provider[] = [{ token: QuoteFunctions, useFactory: () => new QuoteFunctions(quotes, notifier) }];
    this.worker = createSkailWorker({ workload: WORKLOAD, types: [QuoteFunctions], providers, sidecar: this.platform });
  }

  start(currency: Currency = "BRL", taskId = this.taskId) {
    this.platform.start(URI, [taskId, currency], taskId);
  }

  async run() {
    return this.worker.runActivation((await this.platform.consume())!);
  }

  /** Index of the pending (unanswered) frame of the given type, i.e. where the function hibernated. */
  pending(eventType: EventType) {
    return this.platform.history(this.taskId).filter((f) => f.eventType === eventType && !f.targetResult);
  }

  /** Completes the pending 30s delay and runs the function until it hibernates/completes again. */
  async elapse() {
    const [delay] = this.pending(EventType.Delay);
    expect(delay).toBeDefined();
    this.platform.complete(this.taskId, delay!.index);
    return this.run();
  }

  stages() {
    return this.events.map((e) => [e.stage, e.quoteNumber]);
  }
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
});

describe("TrackUsdQuote", () => {
  it("fetches, reports the quote, hibernates on the 30s delay and fetches again, many times", async () => {
    h.start("EUR");
    expect(await h.run()).toMatchObject({ status: "hibernated" });
    expect(h.stages()).toEqual([["Quoted", 1]]);
    expect(h.pending(EventType.Delay)).toHaveLength(1);
    expect(h.pending(EventType.WaitExternalEvent)).toHaveLength(1);

    for (let i = 2; i <= 4; i++) {
      expect(await h.elapse()).toMatchObject({ status: "hibernated" });
    }

    expect(h.stages()).toEqual([
      ["Quoted", 1],
      ["Quoted", 2],
      ["Quoted", 3],
      ["Quoted", 4],
    ]);
    expect(h.requested).toEqual(["EUR", "EUR", "EUR", "EUR"]); // the currency is fixed per run
    expect(h.events.every((e) => e.runId === "run-1" && e.quote?.currency === "EUR")).toBe(true);
  });

  it("waits 30 seconds (durable delay)", async () => {
    h.start();
    await h.run();
    const [delay] = h.pending(EventType.Delay);
    const bytes = Uint8Array.from(Object.values(delay!.targetArguments[0]!.data as unknown as Record<string, number>));
    expect(new TextDecoder().decode(bytes)).toBe("30"); // seconds, JSON-encoded
  });

  it("stops on the STOP_TRACKING event during the wait: no new quote, reports Stopped", async () => {
    h.start();
    await h.run();
    await h.elapse();
    h.platform.signal(Events.stopTracking, "run-1", Events.stopPayload);

    expect(await h.run()).toEqual({ status: "completed", result: { quoteCount: 2, end: "Stopped" } });
    expect(h.requested).toHaveLength(2);
    expect(h.stages().at(-1)).toEqual(["Stopped", 2]);
  });

  it("serves every quote with a single waitForEvent (a stop fired after the 3rd quote works)", async () => {
    h.start();
    await h.run();
    await h.elapse();
    await h.elapse();
    expect(h.pending(EventType.WaitExternalEvent)).toHaveLength(1);
    expect(h.platform.history("run-1").filter((f) => f.eventType === EventType.WaitExternalEvent)).toHaveLength(1);

    h.platform.signal(Events.stopTracking, "run-1", Events.stopPayload);
    expect(await h.run()).toMatchObject({ status: "completed", result: { quoteCount: 3, end: "Stopped" } });
  });

  it("an event for another runId does not stop the run", async () => {
    h.start();
    await h.run();
    expect(() => h.platform.signal(Events.stopTracking, "other-run", Events.stopPayload)).toThrow();
    expect(h.pending(EventType.WaitExternalEvent)).toHaveLength(1);
  });

  it("does not treat the delay result as a stop", async () => {
    h.start();
    await h.run();
    await h.elapse();
    expect(h.stages().at(-1)).toEqual(["Quoted", 2]);
    expect(h.events.some((e) => e.stage === "Stopped")).toBe(false);
  });

  it("completes after exactly 20 quotes and 19 delays, without waiting after the 20th", async () => {
    h.start();
    await h.run();
    let outcome: Awaited<ReturnType<Harness["run"]>> | undefined;
    for (let i = 2; i <= QuoteLimits.maxQuotes; i++) outcome = await h.elapse();

    expect(outcome).toEqual({ status: "completed", result: { quoteCount: 20, end: "LimitReached" } });
    expect(h.requested).toHaveLength(20);
    expect(h.platform.history("run-1").filter((f) => f.eventType === EventType.Delay)).toHaveLength(19);
    expect(h.stages().at(-1)).toEqual(["Completed", 20]);
    expect(h.stages().at(-2)).toEqual(["Quoted", 20]);
  }, 60_000);

  it("a stop during the 19th wait still produces Stopped with 19", async () => {
    h.start();
    await h.run();
    for (let i = 2; i <= 19; i++) await h.elapse();
    h.platform.signal(Events.stopTracking, "run-1", Events.stopPayload);

    expect(await h.run()).toMatchObject({ status: "completed", result: { quoteCount: 19, end: "Stopped" } });
  }, 60_000);

  it("retries the quote command after a transient failure", async () => {
    h.failQuotes = 1;
    h.start();
    const first = await h.run();
    expect(first.status).toBe("hibernated"); // command failed, skail re-delivers
    h.platform.enqueue("run-1");
    await h.run();

    expect(h.requested.length).toBeGreaterThanOrEqual(2);
    expect(h.stages()[0]).toEqual(["Quoted", 1]);
  });

  it("reports the failure with the error message when the quote command fails for good", async () => {
    h.alwaysFail = true;
    h.start();
    // exhaust the command retries (retryCount: 3)
    for (let i = 0; i < 6 && !h.events.some((e) => e.stage === "Failed"); i++) {
      h.platform.enqueue("run-1");
      const activation = await h.platform.consume();
      if (!activation) break;
      await h.worker.runActivation(activation);
    }

    const failed = h.events.find((e) => e.stage === "Failed");
    expect(failed).toMatchObject({ runId: "run-1", quoteNumber: 1, error: "quote api down" });
  });
});
