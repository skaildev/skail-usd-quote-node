import { createInterface } from "node:readline";
import { createSkailPlatform } from "@skail/runtime";
import { currencies } from "./model.js";
import { parseRunTarget } from "./run-target.js";
import { SkailApiClient, skailApiOptionsFromEnvironment } from "./skail-api.js";

// usage: npm start [-- <currency> | <run id>]
//   no argument: starts a run in BRL; BRL, EUR, CNY or JPY: starts a run in that currency;
//   a run id: follows a run that already exists (to see it resume after the app restarts)
const argument = process.argv.slice(2).find((a) => !a.startsWith("-"));
const target = parseRunTarget(argument);
if (!target) {
  console.error(`Unknown argument '${argument}'. Use a currency (${currencies.join(", ")}) or a run id.`);
  process.exit(1);
}

loadDotEnv();
const missing = ["SKAIL_WORKLOAD", "SKAIL_NAMESPACE", "SKAIL_KEY", "SKAIL_SIDECAR"].filter(
  (n) => !process.env[n]?.trim(),
);
if (missing.length > 0) {
  console.error(`Missing ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const skail = new SkailApiClient(skailApiOptionsFromEnvironment());

// hosts the worker that executes QuoteFunctions and its commands (the bundle from `npm run build`);
// reads SKAIL_WORKLOAD, SKAIL_NAMESPACE, SKAIL_KEY and SKAIL_SIDECAR from the environment
const platform = createSkailPlatform({
  bundle: new URL("../.skail/skail-functions.mjs", import.meta.url),
  manifest: new URL("../.skail/manifest.json", import.meta.url),
});

const shutdown = new AbortController();
const input = createInterface({ input: process.stdin });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    input.close();
    shutdown.abort();
  });
}

const worker = platform.run(shutdown.signal);

try {
  if (target.newRunCurrency) {
    await skail.trigger(target.runId, target.newRunCurrency);
    console.log(`Run ${target.runId} started: 1 USD in ${target.newRunCurrency} every 30 s, until you stop it.`);
  } else {
    console.log(`Following run ${target.runId}: it continues from where it is.`);
  }
  console.log("Press Enter to stop the run, or Ctrl+C to exit and leave it running in skail.");

  input.once("line", () => {
    skail.fireStop(target.runId).then(
      () => console.log("STOP_TRACKING sent: the run ends during the current wait. Press Ctrl+C to exit."),
      (error: unknown) => console.error(`Could not send STOP_TRACKING: ${message(error)}`),
    );
  });
} catch (error) {
  console.error(`Could not start the run: ${message(error)}`);
  process.exitCode = 1;
  input.close();
  shutdown.abort();
}

await worker;

/** Loads .env from the current directory, when present. Variables already set in the environment win. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
