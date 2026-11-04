import { describe, expect, it } from "vitest";
import type { RunEvent } from "@skail-usd-quote/contracts";
import { HttpProgressNotifier } from "../src/progress.js";

const event: RunEvent = { runId: "run 1", stage: "Quoted", quoteNumber: 2, quote: null, error: null };

describe("HttpProgressNotifier", () => {
  it("posts the event as JSON to internal/runs/{id}/events", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const notifier = new HttpProgressNotifier("http://web:8080", async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return new Response(null, { status: 204 });
    });

    await notifier.notify(event);

    expect(calls[0]!.url).toBe("http://web:8080/internal/runs/run%201/events");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(event);
    expect(new Headers(calls[0]!.init.headers).get("content-type")).toBe("application/json");
  });

  it("throws when the web app answers an error, so skail retries the command", async () => {
    const notifier = new HttpProgressNotifier("http://web:8080/", async () => new Response("no", { status: 500 }));
    await expect(notifier.notify(event)).rejects.toThrow(/500/);
  });
});
