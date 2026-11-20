import { randomUUID } from "node:crypto";
import type { Currency, Quote } from "./model.js";
import type { SkailApiClient } from "./skail-api.js";

interface Run {
  id: string;
  currency: string;
  status: "running" | "stopping" | "stopped";
  quotes: { number: number; quote: Quote }[];
}

/**
 * What the page shows: the runs this app started or that reported a quote here, each with its quotes.
 * A run the app does not know (it was started before the app restarted) shows up with its next quote.
 */
export class QuoteDesk {
  private readonly runs: Run[] = [];

  constructor(private readonly skail: SkailApiClient) {}

  async start(currency: Currency): Promise<string> {
    const runId = randomUUID();
    await this.skail.trigger(runId, currency);
    this.runs.push({ id: runId, currency, status: "running", quotes: [] });
    print(runId, `started: 1 USD in ${currency} every minute, until you stop it`);
    return runId;
  }

  async stop(runId: string): Promise<boolean> {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) return false;
    await this.skail.fireStop(runId);
    if (run.status === "running") run.status = "stopping";
    print(runId, "STOP_TRACKING sent: the run ends during the current wait");
    return true;
  }

  addQuote(runId: string, quoteNumber: number, quote: Quote): void {
    this.find(runId, quote.currency).quotes.push({ number: quoteNumber, quote });
    const time = new Date(quote.fetchedAt).toTimeString().slice(0, 8);
    print(runId, `#${quoteNumber}`.padEnd(4) + ` 1 USD = ${quote.rate.toFixed(4)} ${quote.currency}  (fetched ${time})`);
  }

  stopped(runId: string, quoteCount: number): void {
    this.find(runId, "").status = "stopped";
    print(runId, `stopped after ${quoteCount} ${quoteCount === 1 ? "quote" : "quotes"}`);
  }

  view() {
    return [...this.runs].reverse().map((r) => ({
      id: r.id,
      currency: r.currency,
      status: r.status,
      quotes: r.quotes
        .map(({ number, quote }, i) => ({
          number,
          rate: quote.rate,
          at: quote.fetchedAt,
          // up, down or the same as the previous quote this page saw, at the 4 decimals the page shows
          trend: i === 0 ? "" : trend(quote.rate, r.quotes[i - 1]!.quote.rate),
        }))
        .reverse(),
    }));
  }

  // a run started before the app restarted: the page follows it from its next quote
  private find(runId: string, currency: string): Run {
    let run = this.runs.find((r) => r.id === runId);
    if (!run) {
      run = { id: runId, currency, status: "running", quotes: [] };
      this.runs.push(run);
    }
    return run;
  }
}

function trend(rate: number, previous: number): string {
  const change = Number(rate.toFixed(4)) - Number(previous.toFixed(4));
  return change > 0 ? "up" : change < 0 ? "down" : "same";
}

/** Each line starts with the first 8 characters of the run id. */
function print(runId: string, message: string): void {
  console.log(`[${runId.slice(0, 8)}] ${message}`);
}
