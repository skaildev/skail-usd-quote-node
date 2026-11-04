import type { Currency, RunView } from "@skail-usd-quote/contracts";

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `HTTP ${res.status}`);
}

export async function startRun(currency: Currency): Promise<RunView> {
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency }),
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

export async function stopRun(runId: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
  if (!res.ok) throw await failure(res);
}

/** The run as the server sees it, or null when it is unknown or the server cannot be reached. */
export async function getRun(runId: string): Promise<RunView | null> {
  try {
    const res = await fetch(`/api/runs/${runId}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
