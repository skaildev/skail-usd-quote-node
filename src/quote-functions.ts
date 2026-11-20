import { Skail, SkailCommand, SkailFunction } from "@skail/runtime";
import { Events, isStopSignal, parseCurrency, type Currency, type Quote } from "./model.js";
import { CoinbaseQuoteProvider } from "./quotes.js";

const INTERVAL_SECONDS = 60;

// Method names are PascalCase on purpose: the skail address is <workload>/<method>, and the trigger calls
// <workload>/TrackUsdQuote.
export class QuoteFunctions {
  private readonly quotes = new CoinbaseQuoteProvider();

  /**
   * Fetches the USD quote every minute, with a durable delay between fetches, until STOP_TRACKING is fired with
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
  // function does not fetch again nor show the same quote twice.

  /**
   * A GET is safe to repeat, so skail retries it when the quote API fails, with a growing wait
   * (15 s, 30 s, 1 min, 2 min, 4 min), up to 5 times.
   */
  @SkailCommand({ retryCount: 5 })
  async FetchQuote(currency: Currency): Promise<Quote> {
    const parsed = parseCurrency(currency);
    if (!parsed) throw new Error(`Invalid currency: ${currency}`);

    // the clock is read inside the command: the time is recorded with the result and stays the same on replay
    return this.quotes.get(parsed);
  }

  @SkailCommand()
  async ReportQuote(runId: string, quoteNumber: number, quote: Quote): Promise<void> {
    await report({ runId, quoteNumber, quote });
  }

  @SkailCommand()
  async ReportStopped(runId: string, quoteCount: number): Promise<void> {
    await report({ runId, quoteCount, stopped: true });
  }
}

/** The commands run in an isolated VM: they hand what the page shows to the app over local HTTP. */
async function report(body: object): Promise<void> {
  const response = await fetch(`${process.env.DEMO_INTERNAL_URL}/internal/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`the app answered ${response.status} to the report`);
}
