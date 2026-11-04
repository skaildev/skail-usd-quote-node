import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonRules, type RunState, type RunView } from "@skail-usd-quote/contracts";
import { App } from "../src/App";

const view = (patch: Partial<RunState> = {}): RunView => {
  const run: RunState = {
    runId: "run-1",
    currency: "BRL",
    stage: "Starting",
    quoteCount: 0,
    quotes: [],
    error: null,
    stopRequested: false,
    ...patch,
  };
  return { ...run, maxQuotes: 20, intervalSeconds: 30, ui: buttonRules(run) };
};

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: RunView) {
    act(() => this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent));
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let calls: Array<{ url: string; method: string; body?: any }>;
let answers: Record<string, () => Response>;

beforeEach(() => {
  calls = [];
  answers = {};
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const answer = answers[`${method} ${url}`];
    if (!answer) throw new Error(`unexpected ${method} ${url}`);
    return answer();
  });
});
afterEach(() => vi.unstubAllGlobals());

const button = () => screen.getByRole("button");
const select = () => screen.getByLabelText("Currency") as HTMLSelectElement;

describe("App", () => {
  it("starts idle: Real selected, dropdown enabled, button says Start", () => {
    render(<App />);
    expect(button()).toHaveTextContent("Start");
    expect(button()).toBeEnabled();
    expect(select().value).toBe("BRL");
    expect(select()).toBeEnabled();
    expect([...select().options].map((o) => o.textContent)).toEqual([
      "Real (BRL)",
      "Euro (EUR)",
      "Yuan (CNY)",
      "Yen (JPY)",
    ]);
  });

  it("Start sends the chosen currency, becomes Stop and locks the dropdown", async () => {
    answers["POST /api/runs"] = () => json(view({ currency: "EUR" }));
    render(<App />);
    await userEvent.selectOptions(select(), "EUR");
    await userEvent.click(button());

    await waitFor(() => expect(button()).toHaveTextContent("Stop"));
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/runs", body: { currency: "EUR" } });
    expect(select()).toBeDisabled();
    expect(select().value).toBe("EUR");
    expect(FakeEventSource.instances[0]!.url).toBe("/api/runs/run-1/stream");
    expect(screen.getByText("run-1")).toBeInTheDocument();
  });

  it("shows the quote, the history, the counter and the variation from the stream", async () => {
    answers["POST /api/runs"] = () => json(view());
    render(<App />);
    await userEvent.click(button());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    const quotes = [5, 5.5].map((rate, i) => ({ currency: "BRL" as const, rate, at: `2026-01-01T00:00:0${i}.000Z` }));
    FakeEventSource.instances[0]!.emit(view({ stage: "Quoted", quoteCount: 2, quotes }));

    expect(screen.getByText("USD → BRL")).toBeInTheDocument();
    expect(screen.getByText("R$ 5.5000", { selector: ".rate" })).toBeInTheDocument();
    expect(screen.getByText("▲ 0.5000 (10.000%)")).toBeInTheDocument();
    expect(screen.getByText("2/20")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText(/next quote in 30s/)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 quotes
  });

  it("Stop fires the stop, shows a disabled Stopping… and goes back to Start when Stopped arrives", async () => {
    answers["POST /api/runs"] = () => json(view());
    answers["POST /api/runs/run-1/stop"] = () => new Response(null, { status: 202 });
    answers["GET /api/runs/run-1"] = () => json(view({ stage: "Quoted", quoteCount: 1, stopRequested: true }));
    render(<App />);
    await userEvent.click(button());
    await waitFor(() => expect(button()).toHaveTextContent("Stop"));
    await userEvent.click(button());

    await waitFor(() => expect(button()).toHaveTextContent("Stopping…"));
    expect(button()).toBeDisabled();

    FakeEventSource.instances[0]!.emit(view({ stage: "Stopped", quoteCount: 1, stopRequested: true }));
    expect(button()).toHaveTextContent("Start");
    expect(button()).toBeEnabled();
    expect(select()).toBeEnabled();
    expect(screen.getByText("Stopped", { selector: ".badge" })).toBeInTheDocument();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });

  it("shows the error and re-enables Start when the trigger fails", async () => {
    answers["POST /api/runs"] = () => json({ error: "sidecar down" }, 502);
    render(<App />);
    await userEvent.click(button());

    expect(await screen.findByText(/Could not start: sidecar down/)).toBeInTheDocument();
    expect(button()).toHaveTextContent("Start");
    expect(button()).toBeEnabled();
  });

  it("shows the failure of a run", async () => {
    answers["POST /api/runs"] = () => json(view());
    render(<App />);
    await userEvent.click(button());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0]!.emit(view({ stage: "Failed", quoteCount: 1, error: "quote api down" }));

    expect(screen.getByText("quote api down")).toBeInTheDocument();
    expect(screen.getByText("Failed", { selector: ".badge" })).toBeInTheDocument();
    expect(button()).toHaveTextContent("Start");
  });

  it("a reload restores the active run from the server: Stop button, locked currency, stream reconnected", async () => {
    localStorage.setItem("usd-quote.runId", "run-9");
    answers["GET /api/runs/run-9"] = () =>
      json(view({ runId: "run-9", currency: "JPY", stage: "Quoted", quoteCount: 3 }));
    render(<App />);

    await waitFor(() => expect(button()).toHaveTextContent("Stop"));
    expect(select().value).toBe("JPY");
    expect(select()).toBeDisabled();
    expect(FakeEventSource.instances[0]!.url).toBe("/api/runs/run-9/stream");
  });

  it("a reload with a finished run goes back to Start", async () => {
    localStorage.setItem("usd-quote.runId", "run-9");
    answers["GET /api/runs/run-9"] = () => json(view({ runId: "run-9", stage: "Completed", quoteCount: 20 }));
    render(<App />);

    await waitFor(() => expect(localStorage.getItem("usd-quote.runId")).toBeNull());
    expect(button()).toHaveTextContent("Start");
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("after Stop the currency can be changed and the next Start uses the new one", async () => {
    answers["POST /api/runs"] = () => json(view({ currency: "EUR" }));
    render(<App />);
    await userEvent.selectOptions(select(), "EUR");
    await userEvent.click(button());
    await waitFor(() => expect(button()).toHaveTextContent("Stop"));
    FakeEventSource.instances[0]!.emit(view({ currency: "EUR", stage: "Stopped", quoteCount: 1 }));

    expect(select()).toBeEnabled();
    expect(select().value).toBe("EUR"); // keeps the last choice
    await userEvent.selectOptions(select(), "CNY");
    expect(select().value).toBe("CNY");

    answers["POST /api/runs"] = () => json(view({ runId: "run-2", currency: "CNY" }));
    await userEvent.click(button());
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/runs")).toHaveLength(2));
    expect(calls.filter((c) => c.url === "/api/runs")[1]!.body).toEqual({ currency: "CNY" });
  });
});
