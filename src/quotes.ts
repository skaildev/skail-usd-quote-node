import type { Currency, SourceQuote } from "./model.js";

/** AwesomeAPI: GET https://economia.awesomeapi.com.br/json/last/USD-{code}. No key required. */
export class AwesomeApiQuoteProvider {
  static readonly baseUrl = "https://economia.awesomeapi.com.br/";

  async get(currency: Currency): Promise<SourceQuote> {
    const response = await fetch(`${AwesomeApiQuoteProvider.baseUrl}json/last/USD-${currency}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const content = await response.text();
    if (!response.ok) {
      throw new Error(`Quote API answered ${response.status}: ${content.slice(0, 300)}`);
    }

    const pair = (JSON.parse(content) as Record<string, { bid: string; timestamp: string } | undefined>)[
      `USD${currency}`
    ];
    if (!pair) throw new Error(`Response has no USD${currency} pair`);

    return {
      currency,
      rate: Number(pair.bid),
      sourceTime: new Date(Number(pair.timestamp) * 1000).toISOString(),
    };
  }
}
