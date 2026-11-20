// Types and constants of the demo. This file ends up inside the skail bundle: pure code only, no Node imports.

/** Fired with the run id as instance id to end a run during any wait. It carries no payload. */
export const Events = { stopTracking: "STOP_TRACKING", stopPayload: {} } as const;

/** Currencies quoted against the US dollar (USD). */
export const currencies = ["BRL", "EUR", "CNY", "JPY"] as const;
export type Currency = (typeof currencies)[number];

/** Parses an ISO code, ignoring case. */
export function parseCurrency(code: string | undefined | null): Currency | undefined {
  const upper = code?.toUpperCase();
  return currencies.find((c) => c === upper);
}

/** Price of 1 USD in the given currency, and when it was fetched (ISO-8601). */
export interface Quote {
  currency: Currency;
  rate: number;
  fetchedAt: string;
}

/**
 * Skail.whenAny returns the winning value (not the task): the STOP_TRACKING event delivers its payload (an empty
 * JSON object), while the delay completes with `undefined`. This tells which branch won.
 */
export function isStopSignal(winner: unknown): boolean {
  return winner !== undefined && winner !== null;
}
