import { isTerminal, type Currency, type RunEvent, type RunState } from "@skail-usd-quote/contracts";

export type StopRequest = "Requested" | "AlreadyRequested" | "AlreadyFinished" | "NotFound";

interface Subscriber {
  onState: (state: RunState) => void;
  onClose: () => void;
}

/** In-memory state of the runs. The durable state lives in skail; this is only the UI view. */
export class RunStore {
  readonly #runs = new Map<string, RunState>();
  readonly #seen = new Map<string, Set<string>>();
  readonly #subscribers = new Map<string, Set<Subscriber>>();

  get count(): number {
    return this.#runs.size;
  }

  create(runId: string, currency: Currency): RunState {
    const run: RunState = {
      runId,
      currency,
      stage: "Starting",
      quoteCount: 0,
      quotes: [],
      error: null,
      stopRequested: false,
    };
    this.#runs.set(runId, run);
    this.#seen.set(runId, new Set());
    return run;
  }

  get(runId: string): RunState | undefined {
    return this.#runs.get(runId);
  }

  remove(runId: string): void {
    this.#runs.delete(runId);
    this.#seen.delete(runId);
    this.#close(runId);
  }

  /** @returns true when the event changed the run; false when ignored (unknown run, finished run or duplicate). */
  apply(event: RunEvent): boolean {
    const run = this.#runs.get(event.runId);
    if (!run || isTerminal(run.stage)) return false;

    const key = `${event.stage}:${event.quoteNumber}`;
    const seen = this.#seen.get(event.runId)!;
    if (seen.has(key)) return false;
    seen.add(key);

    const isQuote = event.stage === "Quoted" && !!event.quote;
    this.#publish({
      ...run,
      stage: event.stage,
      quoteCount: isQuote ? Math.max(run.quoteCount, event.quoteNumber) : run.quoteCount,
      quotes: isQuote ? [...run.quotes, event.quote!] : run.quotes,
      error: event.error ?? run.error,
    });
    return true;
  }

  requestStop(runId: string): StopRequest {
    const run = this.#runs.get(runId);
    if (!run) return "NotFound";
    if (isTerminal(run.stage)) return "AlreadyFinished";
    if (run.stopRequested) return "AlreadyRequested";

    this.#publish({ ...run, stopRequested: true });
    return "Requested";
  }

  /** Undoes requestStop when the stop event could not be fired. */
  cancelStopRequest(runId: string): void {
    const run = this.#runs.get(runId);
    if (run && !isTerminal(run.stage) && run.stopRequested) this.#publish({ ...run, stopRequested: false });
  }

  /** @returns the unsubscribe function. `onClose` is called when the run reaches a terminal stage or is removed. */
  subscribe(runId: string, onState: (state: RunState) => void, onClose: () => void): () => void {
    const subscriber: Subscriber = { onState, onClose };
    let set = this.#subscribers.get(runId);
    if (!set) this.#subscribers.set(runId, (set = new Set()));
    set.add(subscriber);
    return () => void this.#subscribers.get(runId)?.delete(subscriber);
  }

  #publish(state: RunState): void {
    this.#runs.set(state.runId, state);
    for (const subscriber of [...(this.#subscribers.get(state.runId) ?? [])]) subscriber.onState(state);
    if (isTerminal(state.stage)) this.#close(state.runId);
  }

  #close(runId: string): void {
    const set = this.#subscribers.get(runId);
    if (!set) return;
    this.#subscribers.delete(runId);
    for (const subscriber of set) subscriber.onClose();
  }
}
