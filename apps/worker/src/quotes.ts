import { currencyInfo, type Currency, type Quote } from "@skail-usd-quote/contracts";

export interface QuoteProvider {
  get(currency: Currency): Promise<Quote>;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** AwesomeAPI: GET {base}/json/last/USD-{code}. No key required. */
export class HttpQuoteProvider implements QuoteProvider {
  readonly #baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: Fetch = (url, init) => fetch(url, init),
  ) {
    this.#baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  async get(currency: Currency): Promise<Quote> {
    const code = currencyInfo(currency).code;
    const response = await this.fetchImpl(`${this.#baseUrl}json/last/USD-${code}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const content = await response.text();
    if (!response.ok) {
      throw new Error(`Quote API answered ${response.status}: ${content.slice(0, 300)}`);
    }

    const pair = (JSON.parse(content) as Record<string, { bid: string; timestamp: string } | undefined>)[`USD${code}`];
    if (!pair) throw new Error(`Response has no USD${code} pair`);

    return {
      currency: code,
      rate: Number(pair.bid),
      at: new Date(Number(pair.timestamp) * 1000).toISOString(),
    };
  }
}

const baseRates: Record<Currency, number> = { BRL: 5.0, EUR: 0.92, CNY: 7.1, JPY: 150.0 };

/**
 * Quote that works without network (QUOTE_PROVIDER=fake). It follows the clock: up to 0.99% above the base rate,
 * rising every second and starting over every 100 seconds, so a worker restart does not reset it.
 */
export class FakeQuoteProvider implements QuoteProvider {
  constructor(private readonly now: () => number = () => Date.now()) {}

  async get(currency: Currency): Promise<Quote> {
    const now = this.now();
    const step = Math.floor(now / 1000) % 100;
    return {
      currency,
      rate: Math.round(baseRates[currency] * (1 + step / 10000) * 10000) / 10000,
      at: new Date(now).toISOString(),
    };
  }
}
