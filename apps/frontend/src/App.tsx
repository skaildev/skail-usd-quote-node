import { useCallback, useEffect, useState } from "react";
import { Currencies, buttonRules, isTerminal, type Currency, type RunView } from "@skail-usd-quote/contracts";
import { getRun, startRun, stopRun } from "./api";
import { CurrencySelect } from "./components/CurrencySelect";
import { HistoryTable } from "./components/HistoryTable";
import { QuoteCard } from "./components/QuoteCard";
import { StatusBadge } from "./components/StatusBadge";
import { ToggleButton } from "./components/ToggleButton";
import { useCountdown } from "./hooks/useCountdown";
import { useRunStream } from "./hooks/useRunStream";

const STORAGE_KEY = "usd-quote.runId";

export function App() {
  const [run, setRun] = useState<RunView | undefined>();
  const [currency, setCurrency] = useState<Currency>(Currencies.default);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forget = useCallback(() => localStorage.removeItem(STORAGE_KEY), []);
  const active = run && !isTerminal(run.stage) ? run.runId : undefined;
  useRunStream(active, setRun, forget);
  const secondsLeft = useCountdown(run);

  // after a reload, the state comes from the server so the button and the currency lock stay right
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    getRun(saved).then((restored) => {
      if (!restored) return forget();
      setRun(restored);
      setCurrency(restored.currency);
      if (isTerminal(restored.stage)) forget();
    }, forget);
  }, [forget]);

  const ui = buttonRules(run);
  // an active run pins the currency; once it ends the dropdown follows the user's choice again
  const shownCurrency = run && !isTerminal(run.stage) ? run.currency : currency;

  async function onToggle() {
    setBusy(true);
    setError(null);
    try {
      if (ui.action === "Stop" && run) {
        try {
          await stopRun(run.runId);
        } catch (e) {
          setError(`Could not stop: ${(e as Error).message}`);
        }
        setRun((await getRun(run.runId)) ?? run);
      } else {
        const started = await startRun(shownCurrency);
        localStorage.setItem(STORAGE_KEY, started.runId);
        setRun(started);
        setCurrency(started.currency);
      }
    } catch (e) {
      setError(`Could not start: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <h1>USD quote</h1>
        <p className="subtitle">
          A skail function fetches the dollar price every 30 seconds (durable delay) until you stop it.
        </p>
      </header>

      <section className="controls">
        <CurrencySelect value={shownCurrency} disabled={!ui.currencyEnabled || busy} onChange={setCurrency} />
        <ToggleButton ui={ui} busy={busy} onClick={onToggle} />
      </section>

      <section className="status">
        <StatusBadge stage={run?.stage} />
        <span>{run ? `${run.quoteCount}/${run.maxQuotes}` : ""}</span>
        <span>{secondsLeft === null ? "" : secondsLeft > 0 ? `next quote in ${secondsLeft}s` : "fetching…"}</span>
      </section>

      {(error ?? run?.error) && <p className="error">{error ?? run?.error}</p>}

      <QuoteCard currency={shownCurrency} quotes={run?.quotes ?? []} />
      <HistoryTable quotes={run?.quotes ?? []} />

      <footer>
        Run <code>{run?.runId ?? "—"}</code>
      </footer>
    </main>
  );
}
