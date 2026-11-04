import type { RunEvent } from "@skail-usd-quote/contracts";
import type { Fetch } from "./quotes.js";

export interface ProgressNotifier {
  notify(event: RunEvent): Promise<void>;
}

/** Reports progress to the web app: POST {web}/internal/runs/{id}/events. */
export class HttpProgressNotifier implements ProgressNotifier {
  readonly #baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly fetchImpl: Fetch = (url, init) => fetch(url, init),
  ) {
    this.#baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  async notify(event: RunEvent): Promise<void> {
    const response = await this.fetchImpl(`${this.#baseUrl}internal/runs/${encodeURIComponent(event.runId)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Web app answered ${response.status} to the progress event`);
  }
}
