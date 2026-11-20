import type { Currency, Quote } from "./model.js";

/**
 * Coinbase exchange rates: GET https://api.coinbase.com/v2/exchange-rates?currency=USD. No key required.
 * The rates move during the day, so consecutive fetches show the quote going up and down.
 */
export class CoinbaseQuoteProvider {
  static readonly url = "https://api.coinbase.com/v2/exchange-rates?currency=USD";

  async get(currency: Currency): Promise<Quote> {
    const response = await fetch(CoinbaseQuoteProvider.url, { signal: AbortSignal.timeout(15_000) });
    const content = await response.text();
    if (!response.ok) {
      throw new Error(`Quote API answered ${response.status}: ${content.slice(0, 300)}`);
    }

    const rate = (JSON.parse(content) as { data: { rates: Record<string, string | undefined> } }).data.rates[currency];
    if (!rate) throw new Error(`Response has no ${currency} rate`);

    return { currency, rate: Number(rate), fetchedAt: new Date().toISOString() };
  }
}
