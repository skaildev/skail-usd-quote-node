// Types and constants of the demo. This file ends up inside the skail bundle: pure code only, no Node imports.

/** Fired with the run id as instance id to end a run during any wait. It carries no payload. */
export const Events = { stopTracking: "STOP_TRACKING", stopPayload: {} } as const;

/** Currencies quoted against the US dollar (USD). */
export const currencies = ["BRL", "EUR", "CNY", "JPY"] as const;
export type Currency = (typeof currencies)[number];
export const defaultCurrency: Currency = "BRL";

/** Parses an ISO code, ignoring case. */
export function parseCurrency(code: string | undefined | null): Currency | undefined {
  const upper = code?.toUpperCase();
  return currencies.find((c) => c === upper);
}

/**
 * Price of 1 USD in the given currency, with ISO-8601 times. `sourceTime` is when the source published the rate;
 * `fetchedAt` is when the function fetched it. The source publishes a new rate only every few minutes, so
 * consecutive fetches can carry the same rate and sourceTime.
 */
export interface Quote {
  currency: Currency;
  rate: number;
  sourceTime: string;
  fetchedAt: string;
}

/** What a quote source answers: the quote without the fetch time, which the FetchQuote command adds. */
export type SourceQuote = Omit<Quote, "fetchedAt">;

/**
 * Skail.whenAny returns the winning value (not the task): the STOP_TRACKING event delivers its payload (an empty
 * JSON object), while the 30s delay completes with `undefined`. This tells which branch won.
 */
export function isStopSignal(winner: unknown): boolean {
  return winner !== undefined && winner !== null;
}
