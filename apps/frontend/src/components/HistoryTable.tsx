import type { Quote } from "@skail-usd-quote/contracts";
import { formatRate } from "../format";

/** The latest quotes, newest first. */
export function HistoryTable({ quotes, limit = 10 }: { quotes: Quote[]; limit?: number }) {
  const rows = quotes.slice(-limit).reverse();
  return (
    <section>
      <h2>Latest quotes</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Rate</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q, i) => (
            <tr key={quotes.length - i}>
              <td>{quotes.length - i}</td>
              <td>{formatRate(q.currency, q.rate)}</td>
              <td>{new Date(q.at).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
