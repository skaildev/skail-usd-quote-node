import { useEffect, useRef, useState } from "react";
import { QuoteLimits, type RunView } from "@skail-usd-quote/contracts";

/**
 * Visual hint only, the real wait is the durable delay inside the function. Restarts on each new quote and
 * only runs while the run waits (Quoted and no stop requested). Returns the seconds left, or null when not waiting.
 */
export function useCountdown(run: RunView | undefined): number | null {
  const waiting = !!run && run.stage === "Quoted" && !run.stopRequested;
  const quoteCount = run?.quoteCount;
  const [secondsLeft, setSecondsLeft] = useState<number>(QuoteLimits.intervalSeconds);
  const lastQuoteCount = useRef(0);

  useEffect(() => {
    if (!waiting) return;
    if (quoteCount !== lastQuoteCount.current) {
      lastQuoteCount.current = quoteCount!;
      setSecondsLeft(QuoteLimits.intervalSeconds);
    }
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [waiting, quoteCount]);

  return waiting ? secondsLeft : null;
}
