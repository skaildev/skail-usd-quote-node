import { beforeEach, describe, expect, it } from "vitest";
import type { Currency, RunEvent } from "@skail-usd-quote/contracts";
import { createApp } from "../src/app.js";
import { SkailGatewayError, type SkailGateway } from "../src/gateway.js";
import { RunStore } from "../src/run-store.js";

class FakeGateway implements SkailGateway {
  triggers: Array<[string, Currency]> = [];
  stops: string[] = [];
  failTrigger = false;
  failStop = false;
  async trigger(runId: string, currency: Currency) {
    if (this.failTrigger) throw new SkailGatewayError("sidecar down");
    this.triggers.push([runId, currency]);
  }
  async fireStop(runId: string) {
    if (this.failStop) throw new SkailGatewayError("sidecar down");
    this.stops.push(runId);
  }
}

let store: RunStore;
let gateway: FakeGateway;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new RunStore();
  gateway = new FakeGateway();
  app = createApp({ store, gateway });
});

const start = async (payload?: object) => app.inject({ method: "POST", url: "/api/runs", payload });
const notify = (runId: string, event: Partial<RunEvent>) =>
  app.inject({ method: "POST", url: `/internal/runs/${runId}/events`, payload: { runId: "ignored", ...event } });

describe("web API", () => {
  it("answers /healthz", async () => {
    const res = await app.inject({ url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("POST /api/runs without currency triggers BRL and returns the run view with the button state", async () => {
    const res = await start();
    expect(res.statusCode).toBe(200);
    const view = res.json();
    expect(gateway.triggers).toEqual([[view.runId, "BRL"]]);
    expect(view).toMatchObject({
      currency: "BRL",
      stage: "Starting",
      quoteCount: 0,
      maxQuotes: 20,
      intervalSeconds: 30,
      stopRequested: false,
      ui: { action: "Stop", label: "Stop", enabled: true, currencyEnabled: false },
    });
  });

  it("POST /api/runs uses the chosen currency (case-insensitive) and a new runId each time", async () => {
    const a = (await start({ currency: "jpy" })).json();
    const b = (await start({ currency: "CNY" })).json();
    expect(a.currency).toBe("JPY");
    expect(b.currency).toBe("CNY");
    expect(a.runId).not.toBe(b.runId);
    expect(gateway.triggers.map(([, c]) => c)).toEqual(["JPY", "CNY"]);
  });

  it("rejects an unsupported currency with 400 and triggers nothing", async () => {
    const res = await start({ currency: "USD" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/USD/);
    expect(gateway.triggers).toHaveLength(0);
  });

  it("answers 502 and forgets the run when the trigger fails", async () => {
    gateway.failTrigger = true;
    const res = await start({ currency: "EUR" });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("sidecar down");
    expect(store.count).toBe(0); // the run was removed
  });

  it("GET /api/runs/{id} returns the state, 404 when unknown", async () => {
    const { runId } = (await start({ currency: "EUR" })).json();
    await notify(runId, {
      stage: "Quoted",
      quoteNumber: 1,
      quote: { currency: "EUR", rate: 0.9, at: "2026-01-01T00:00:00.000Z" },
    });

    const res = await app.inject({ url: `/api/runs/${runId}` });
    expect(res.json()).toMatchObject({ runId, currency: "EUR", stage: "Quoted", quoteCount: 1 });
    expect(res.json().quotes).toHaveLength(1);
    expect((await app.inject({ url: "/api/runs/nope" })).statusCode).toBe(404);
  });

  it("POST stop fires the event once (202), repeated stop is a no-op (202), unknown is 404", async () => {
    const { runId } = (await start()).json();
    expect((await app.inject({ method: "POST", url: `/api/runs/${runId}/stop` })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: `/api/runs/${runId}/stop` })).statusCode).toBe(202);
    expect(gateway.stops).toEqual([runId]);
    expect(store.get(runId)).toMatchObject({ stopRequested: true });
    expect((await app.inject({ method: "POST", url: "/api/runs/nope/stop" })).statusCode).toBe(404);

    const view = (await app.inject({ url: `/api/runs/${runId}` })).json();
    expect(view.ui).toMatchObject({ action: "Stop", label: "Stopping…", enabled: false });
  });

  it("stop on a finished run is 200 and does not fire", async () => {
    const { runId } = (await start()).json();
    await notify(runId, { stage: "Stopped", quoteNumber: 1 });
    const res = await app.inject({ method: "POST", url: `/api/runs/${runId}/stop` });
    expect(res.statusCode).toBe(200);
    expect(gateway.stops).toHaveLength(0);
    expect((await app.inject({ url: `/api/runs/${runId}` })).json().ui.action).toBe("Start");
  });

  it("when the fire fails: 502 and the Stop button is available again", async () => {
    const { runId } = (await start()).json();
    gateway.failStop = true;
    const res = await app.inject({ method: "POST", url: `/api/runs/${runId}/stop` });
    expect(res.statusCode).toBe(502);
    expect(store.get(runId)!.stopRequested).toBe(false);
  });

  it("internal events use the id of the URL and answer 204; repeated events are ignored", async () => {
    const { runId } = (await start()).json();
    const quote = { currency: "BRL", rate: 5, at: "2026-01-01T00:00:00.000Z" };
    expect((await notify(runId, { stage: "Quoted", quoteNumber: 1, quote })).statusCode).toBe(204);
    await notify(runId, { stage: "Quoted", quoteNumber: 1, quote });
    expect(store.get(runId)!.quotes).toHaveLength(1);
  });

  it("SSE sends the snapshot, then every change in order, and ends at the terminal stage", async () => {
    const { runId } = (await start()).json();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as { port: number };

    const response = await fetch(`http://127.0.0.1:${port}/api/runs/${runId}/stream`);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const stages: string[] = [];
    let buffer = "";
    const read = async (until: number) => {
      while (stages.length < until) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value);
        const parts = buffer.split("\n\n");
        buffer = parts.pop()!;
        for (const part of parts) stages.push(JSON.parse(part.replace(/^data: /, "")).stage);
      }
    };

    await read(1);
    await notify(runId, {
      stage: "Quoted",
      quoteNumber: 1,
      quote: { currency: "BRL", rate: 5, at: "2026-01-01T00:00:00.000Z" },
    });
    await read(2);
    await notify(runId, { stage: "Stopped", quoteNumber: 1 });
    await read(3);
    const end = await reader.read();

    expect(stages).toEqual(["Starting", "Quoted", "Stopped"]);
    expect(end.done).toBe(true);
    await app.close();
  });

  it("SSE of an unknown run is 404", async () => {
    expect((await app.inject({ url: "/api/runs/nope/stream" })).statusCode).toBe(404);
  });
});
