import { useEffect } from "react";
import { isTerminal, type RunView } from "@skail-usd-quote/contracts";

/**
 * Follows a run through SSE. EventSource reconnects by itself and the stream starts with the current
 * snapshot, so no update is lost. Closes at a terminal stage.
 */
export function useRunStream(runId: string | undefined, onState: (run: RunView) => void, onTerminal: () => void) {
  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(`/api/runs/${runId}/stream`);
    source.onmessage = (event) => {
      const run = JSON.parse(event.data) as RunView;
      onState(run);
      if (isTerminal(run.stage)) {
        source.close();
        onTerminal();
      }
    };
    return () => source.close();
    // callbacks are stable (state setters); the stream only depends on the run id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
}
