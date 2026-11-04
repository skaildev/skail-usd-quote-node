import { Skail, SkailCommand, SkailFunction } from "@skail/runtime";
import {
  Events,
  QuoteLimits,
  isStopSignal,
  parseCurrency,
  type Currency,
  type Quote,
  type RunResult,
} from "@skail-usd-quote/contracts";
import type { ProgressNotifier } from "./progress.js";
import type { QuoteProvider } from "./quotes.js";

// Method names are PascalCase on purpose: the skail address is <workload>/<method>, and the web app triggers
// <workload>/TrackUsdQuote.
export class QuoteFunctions {
  constructor(
    private readonly quotes: QuoteProvider,
    private readonly notifier: ProgressNotifier,
  ) {}

  /**
   * Tracks the USD quote: fetches it, waits 30 seconds with a durable delay and fetches again, up to 20 quotes.
   * The STOP_TRACKING event, fired with the run id as instance id, ends the run during any wait.
   */
  @SkailFunction()
  async TrackUsdQuote(runId: string, currency: Currency): Promise<RunResult> {
    // one wait for the stop event, created without await and reused by every whenAny below
    const stopEvent = Skail.waitForEvent<unknown>(Events.stopTracking, runId);

    for (let quoteNumber = 1; quoteNumber <= QuoteLimits.maxQuotes; quoteNumber++) {
      let quote: Quote;
      try {
        quote = await this.FetchQuote(currency);
      } catch (error) {
        await this.ReportFailure(runId, quoteNumber, error instanceof Error ? error.message : String(error));
        throw error;
      }

      await this.ReportQuote(runId, quoteNumber, quote);

      if (quoteNumber === QuoteLimits.maxQuotes) break; // last quote: no wait after it

      // whenAny returns the winning value: the stop event delivers its payload, the delay completes with undefined
      const winner = await Skail.whenAny([stopEvent, Skail.delaySeconds(QuoteLimits.intervalSeconds)]);
      if (isStopSignal(winner)) {
        await this.ReportStopped(runId, quoteNumber);
        return { quoteCount: quoteNumber, end: "Stopped" };
      }
    }

    await this.ReportCompleted(runId, QuoteLimits.maxQuotes);
    return { quoteCount: QuoteLimits.maxQuotes, end: "LimitReached" };
  }

  // The commands are the demo's I/O. Each one does a single thing, because a retry runs the whole command again.
  // The Report* commands are idempotent: the web app ignores a repeated event (same run, stage and quote number).

  @SkailCommand({ retryCount: 3 })
  async FetchQuote(currency: Currency): Promise<Quote> {
    const parsed = parseCurrency(currency);
    if (!parsed) throw new Error(`Invalid currency: ${currency}`);
    return this.quotes.get(parsed);
  }

  @SkailCommand({ retryCount: 3 })
  async ReportQuote(runId: string, quoteNumber: number, quote: Quote): Promise<void> {
    await this.notifier.notify({ runId, stage: "Quoted", quoteNumber, quote });
  }

  @SkailCommand({ retryCount: 3 })
  async ReportStopped(runId: string, quoteCount: number): Promise<void> {
    await this.notifier.notify({ runId, stage: "Stopped", quoteNumber: quoteCount });
  }

  @SkailCommand({ retryCount: 3 })
  async ReportCompleted(runId: string, quoteCount: number): Promise<void> {
    await this.notifier.notify({ runId, stage: "Completed", quoteNumber: quoteCount });
  }

  @SkailCommand({ retryCount: 3 })
  async ReportFailure(runId: string, quoteNumber: number, error: string): Promise<void> {
    await this.notifier.notify({ runId, stage: "Failed", quoteNumber, error });
  }
}
