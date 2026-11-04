import type { Currency, Quote } from "@skail-usd-quote/contracts";
import { formatRate, variation } from "../format";

export function QuoteCard({ currency, quotes }: { currency: Currency; quotes: Quote[] }) {
  const last = quotes.at(-1);
  const change = last ? variation(quotes.at(-2)?.rate, last.rate) : null;
  return (
    <section className="current">
      <div className="pair">{`USD → ${currency}`}</div>
      <div className="rate">{last ? formatRate(last.currency, last.rate) : "—"}</div>
      <div className={`variation${change ? (change.up ? " up" : " down") : ""}`}>{change?.text}</div>
      <div className="time">{last ? new Date(last.at).toLocaleString() : ""}</div>
    </section>
  );
}
