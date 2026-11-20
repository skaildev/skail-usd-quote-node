import { randomUUID } from "node:crypto";
import { defaultCurrency, parseCurrency, type Currency } from "./model.js";

/**
 * Which run this process follows: a new one (a fresh GUID and the currency to quote) or an existing one, by id.
 * `newRunCurrency` is undefined for an existing run.
 */
export interface RunTarget {
  runId: string;
  newRunCurrency?: Currency;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses the command line: no argument starts a run in the default currency, a currency code starts a run in that
 * currency and a run id (GUID) follows a run that already exists. Anything else returns undefined.
 */
export function parseRunTarget(argument: string | undefined): RunTarget | undefined {
  if (!argument?.trim()) return { runId: randomUUID(), newRunCurrency: defaultCurrency };
  if (GUID.test(argument)) return { runId: argument.toLowerCase() };

  const currency = parseCurrency(argument);
  return currency ? { runId: randomUUID(), newRunCurrency: currency } : undefined;
}
