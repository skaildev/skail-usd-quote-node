import type { RunStage } from "@skail-usd-quote/contracts";

const labels: Record<RunStage, string> = {
  Starting: "Starting…",
  Quoted: "Waiting",
  Stopped: "Stopped",
  Completed: "Completed",
  Failed: "Failed",
};

export function StatusBadge({ stage }: { stage: RunStage | undefined }) {
  const kind = !stage
    ? "idle"
    : stage === "Failed"
      ? "failed"
      : stage === "Stopped" || stage === "Completed"
        ? "done"
        : "active";
  return <span className={`badge ${kind}`}>{stage ? labels[stage] : "Idle"}</span>;
}
