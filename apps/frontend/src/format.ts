import { currencyInfo, type Currency } from "@skail-usd-quote/contracts";

export function formatRate(currency: Currency, value: number, locale?: string): string {
  const digits = currency === "JPY" ? 2 : 4;
  const number = value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${currencyInfo(currency).symbol} ${number}`;
}

export interface Variation {
  up: boolean;
  text: string;
}

/** Absolute and percentual change against the previous quote. */
export function variation(previous: number | undefined, current: number): Variation | null {
  if (previous === undefined) return null;
  const diff = current - previous;
  const pct = previous ? (diff / previous) * 100 : 0;
  return { up: diff >= 0, text: `${diff >= 0 ? "▲" : "▼"} ${diff.toFixed(4)} (${pct.toFixed(3)}%)` };
}
