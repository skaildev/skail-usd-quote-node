// Shared by web, worker (it ends up inside the skail bundle) and front end: pure types, constants and
// functions only. No Node I/O imports here, the skail build rejects them.

export const QuoteLimits = { maxQuotes: 20, intervalSeconds: 30 } as const;

export const Events = { stopTracking: "STOP_TRACKING", stopPayload: {} } as const;

export type Currency = "BRL" | "EUR" | "CNY" | "JPY";

export interface CurrencyInfo {
  currency: Currency;
  code: Currency;
  name: string;
  symbol: string;
}

/** Currencies offered against the US dollar (USD). The first one is the default. */
export const Currencies: { default: Currency; all: readonly CurrencyInfo[] } = {
  default: "BRL",
  all: [
    { currency: "BRL", code: "BRL", name: "Real", symbol: "R$" },
    { currency: "EUR", code: "EUR", name: "Euro", symbol: "€" },
    { currency: "CNY", code: "CNY", name: "Yuan", symbol: "¥" },
    { currency: "JPY", code: "JPY", name: "Yen", symbol: "¥" },
  ],
};

export function currencyInfo(currency: Currency): CurrencyInfo {
  return Currencies.all.find((c) => c.currency === currency)!;
}

export function parseCurrency(code: string | undefined | null): Currency | undefined {
  const upper = code?.toUpperCase();
  return Currencies.all.find((c) => c.code === upper)?.currency;
}

/** Price of 1 USD in the given currency (ISO code). `at` is an ISO-8601 timestamp. */
export interface Quote {
  currency: Currency;
  rate: number;
  at: string;
}

export type RunStage = "Starting" | "Quoted" | "Stopped" | "Completed" | "Failed";
export type RunEnd = "Stopped" | "LimitReached";

export interface RunResult {
  quoteCount: number;
  end: RunEnd;
}

/** Progress the worker sends to the web app (Report* commands). */
export interface RunEvent {
  runId: string;
  stage: RunStage;
  quoteNumber: number;
  quote?: Quote | null;
  error?: string | null;
}

export interface RunState {
  runId: string;
  currency: Currency;
  stage: RunStage;
  quoteCount: number;
  quotes: Quote[];
  error?: string | null;
  stopRequested: boolean;
}

export function isTerminal(stage: RunStage): boolean {
  return stage === "Stopped" || stage === "Completed" || stage === "Failed";
}

/**
 * Skail.whenAny returns the winning value (not the task): the STOP_TRACKING event delivers its payload (an empty
 * JSON object), while the 30s delay completes with `undefined`. This tells which branch won.
 */
export function isStopSignal(winner: unknown): boolean {
  return winner !== undefined && winner !== null;
}

export interface UiState {
  action: "Start" | "Stop";
  label: string;
  enabled: boolean;
  /** The currency can only be changed before a run starts. */
  currencyEnabled: boolean;
}

/** Single source of truth for the Start/Stop toggle: derived only from the run state. */
export function buttonRules(run: RunState | undefined): UiState {
  if (!run || isTerminal(run.stage)) {
    return { action: "Start", label: "Start", enabled: true, currencyEnabled: true };
  }
  return run.stopRequested
    ? { action: "Stop", label: "Stopping…", enabled: false, currencyEnabled: false }
    : { action: "Stop", label: "Stop", enabled: true, currencyEnabled: false };
}

/** What `GET /api/runs/{id}` and the SSE stream return. */
export interface RunView extends RunState {
  maxQuotes: number;
  intervalSeconds: number;
  ui: UiState;
}
