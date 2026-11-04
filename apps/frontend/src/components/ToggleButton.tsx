import type { UiState } from "@skail-usd-quote/contracts";

interface Props {
  ui: UiState;
  busy: boolean;
  onClick: () => void;
}

export function ToggleButton({ ui, busy, onClick }: Props) {
  return (
    <button id="toggle" type="button" className={ui.action === "Stop" ? "stop" : undefined} disabled={!ui.enabled || busy} onClick={onClick}>
      {ui.label}
    </button>
  );
}
