import { Skail, SkailCommand, SkailFunction } from "@skail/runtime";
import { Events, isStopSignal, parseCurrency, type Currency, type Quote } from "./model.js";
import type { AwesomeApiQuoteProvider } from "./quotes.js";

const INTERVAL_SECONDS = 30;

// Method names are PascalCase on purpose: the skail address is <workload>/<method>, and the trigger calls
// <workload>/TrackUsdQuote.
export class QuoteFunctions {
  constructor(private readonly quotes: AwesomeApiQuoteProvider) {}

  /**
   * Fetches the USD quote every 30 seconds, with a durable delay between fetches, until STOP_TRACKING is fired with
   * the run id as instance id. Returns how many quotes it fetched.
   * The name and the parameters are the trigger contract: ["{runId}", "{currency}"].
   *
   * retryCount: 0 because skail already retries FetchQuote; a failure that outlasts those retries ends the run as
   * Failed in the Monitor.
   */
  @SkailFunction({ retryCount: 0 })
  async TrackUsdQuote(runId: string, currency: Currency): Promise<number> {
    // one wait for the stop event, created without await and reused by every whenAny below
    const stopEvent = Skail.waitForEvent<unknown>(Events.stopTracking, runId);

    for (let quoteNumber = 1; ; quoteNumber++) {
      const quote = await this.FetchQuote(currency);
      await this.ReportQuote(runId, quoteNumber, quote);

      // whenAny returns the winning value: the stop event delivers its payload, the delay completes with undefined
      const winner = await Skail.whenAny([stopEvent, Skail.delaySeconds(INTERVAL_SECONDS)]);
      if (isStopSignal(winner)) {
        await this.ReportStopped(runId, quoteNumber);
        return quoteNumber;
      }
    }
  }

  // The commands are the I/O. Once a command completes, skail records it and never runs it again, so a replay of the
  // function does not fetch again nor print the same line twice.

  /**
   * The quote API answers 429 when its quota runs out. A GET is safe to repeat, so skail retries it, with a growing
   * wait (15 s, 30 s, 1 min, 2 min, 4 min), up to 5 times.
   */
  @SkailCommand({ retryCount: 5 })
  async FetchQuote(currency: Currency): Promise<Quote> {
    const parsed = parseCurrency(currency);
    if (!parsed) throw new Error(`Invalid currency: ${currency}`);
    const quote = await this.quotes.get(parsed);

    // the clock is read inside the command: the time is recorded with the result and stays the same on replay
    return { ...quote, fetchedAt: new Date().toISOString() };
  }

  @SkailCommand()
  async ReportQuote(runId: string, quoteNumber: number, quote: Quote): Promise<void> {
    const number = `#${quoteNumber}`.padEnd(3);
    print(
      runId,
      `${number} 1 USD = ${quote.rate.toFixed(4)} ${quote.currency}  ` +
        `(fetched ${time(quote.fetchedAt)}, source ${time(quote.sourceTime)})`,
    );
  }

  @SkailCommand()
  async ReportStopped(runId: string, quoteCount: number): Promise<void> {
    print(runId, `Stopped after ${quoteCount} ${quoteCount === 1 ? "quote" : "quotes"}.`);
  }
}

/** Each line starts with the first 8 characters of the run id. */
function print(runId: string, message: string): void {
  console.log(`[${runId.slice(0, 8)}] ${message}`);
}

/** Local time as HH:mm:ss. */
function time(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 8);
}
