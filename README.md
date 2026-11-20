# skail USD quote (Node.js)

[Português (Brasil)](README.pt-BR.md)

A console app with a skail function that fetches the US dollar quote, waits 30 seconds with a durable delay and fetches again, until you press **Enter**.

It shows three skail features:

- a **durable delay**: close the app in the middle of a wait, start it again and the run goes on from where it was;
- an **external event** (`STOP_TRACKING`) that stops the run in the middle of a wait;
- **automatic retries**: when the quote API fails, skail tries again by itself.

## Requirements

- One of: [Docker](https://docs.docker.com/get-docker/), [Podman](https://podman.io/docs/installation) or [Node.js](https://nodejs.org) 20.12 or newer. The run script uses the first one it finds.
- A skail environment with a workload registered for the `SKAIL_WORKLOAD` in `.env` (`usdquote:v1.0.0` by default). The [Quickstart](https://docs.skail.dev/comece-aqui/quickstart) shows how to create the account, the environment and the workload.

The project uses `@skail/runtime` and `@skail/build` **2.0.1-rc4**.

## Run

```bash
cp .env.example .env  # fill in SKAIL_SIDECAR, SKAIL_NAMESPACE and SKAIL_KEY (portal > Environments & keys > Connect)
scripts/run.sh        # 1 USD in BRL
scripts/run.sh JPY    # or EUR, CNY, JPY
```

On Windows, in PowerShell: `copy .env.example .env`, then `powershell -ExecutionPolicy Bypass -File scripts\run.ps1` with the same arguments. The script works on the Windows PowerShell built into Windows; PowerShell 7 is not needed.

The script runs the demo with what the machine has: Docker, then Podman, then Node.js. If it finds none of them, it says what to install. Without the script, the commands are `npm install`, `npm run build` and `npm start` (with the arguments after `--`, as in `npm start -- <argument>`).

```text
Run 3aaa5d5b-02b5-4e2a-9608-83d523d13346 started: 1 USD in JPY every 30 s, until you stop it.
Press Enter to stop the run, or Ctrl+C to exit and leave it running in skail.
[3aaa5d5b] #1  1 USD = 150.1500 JPY  (fetched 15:11:27, source 15:11:00)
[3aaa5d5b] #2  1 USD = 150.1500 JPY  (fetched 15:11:58, source 15:11:00)

STOP_TRACKING sent: the run ends during the current wait. Press Ctrl+C to exit.
[3aaa5d5b] Stopped after 2 quotes.
```

- **Enter** stops the run: the app fires `STOP_TRACKING`.
- **Ctrl+C** closes the app; the run stays in skail, waiting.
- **fetched** is when the function fetched the quote; **source** is when AwesomeAPI published the rate, which changes only every few minutes.

## How it works

The app does two jobs in one process: it hosts the worker that runs the function (`createSkailPlatform`, with the bundle built by `npm run build`), and it starts and stops the run through the skail HTTP API:

```http
POST {SKAIL_SIDECAR}/api/v1/trigger/usdquote/v1.0.0/TrackUsdQuote/{runId}
["{runId}", "BRL"]

POST {SKAIL_SIDECAR}/api/v1/fire/STOP_TRACKING/{runId}
{}
```

The function, in [`src/quote-functions.ts`](src/quote-functions.ts):

```ts
@SkailFunction({ retryCount: 0 })
async TrackUsdQuote(runId: string, currency: Currency): Promise<number> {
  const stopEvent = Skail.waitForEvent<unknown>(Events.stopTracking, runId);

  for (let quoteNumber = 1; ; quoteNumber++) {
    const quote = await this.FetchQuote(currency);
    await this.ReportQuote(runId, quoteNumber, quote);

    // whenAny returns the winning value: the stop event delivers its payload, the delay completes with undefined
    const winner = await Skail.whenAny([stopEvent, Skail.delaySeconds(INTERVAL_SECONDS)]);
    if (isStopSignal(winner)) {
      await this.ReportStopped(runId, quoteNumber);
      return quoteNumber;
    }
  }
}
```

- The function only orchestrates. Each time the run wakes up (after a delay, an event or an app restart), skail runs it again from the start (replay).
- The I/O lives in commands: `FetchQuote` calls the quote API, and `ReportQuote` and `ReportStopped` print to the console. A command that completed is never run again, so a replay does not fetch again nor print the same line twice.
- The wait for `STOP_TRACKING` is created once and reused in every `whenAny` against the 30-second delay: whichever comes first wins.

| File | What it has |
|---|---|
| `src/quote-functions.ts` | The function and its commands. |
| `src/quotes.ts` | The call to AwesomeAPI. |
| `src/main.ts` | Reads `.env` and the argument, hosts the worker, starts the run and fires `STOP_TRACKING` on Enter. |
| `src/skail-api.ts` | Trigger and fire through the skail HTTP API. |
| `src/skail-functions.ts` | Entry point of the skail bundle. |
| `scripts/build-skail.mjs` | Builds the bundle into `.skail/` for `SKAIL_WORKLOAD`; run `npm run build` again if it changes. |
| `scripts/run.sh`, `scripts/run.ps1`, `Dockerfile` | Run the demo with Docker, Podman or Node.js, whatever the machine has. |

## See the durability

1. Run the app and wait for the first quote.
2. During the 30-second wait, press **Ctrl+C**. The app closes; the run stays in skail.
3. Start the app again with the run id it printed: `scripts/run.sh <run id>`. With an id, the app starts no new run: it only hosts the worker again, and skail hands it the run that was waiting.
4. The next quote arrives on schedule. Press **Enter** to stop.

In the portal, open the [Monitor](https://docs.skail.dev/referencia/portal/monitor) of your environment and click the run: each quote shows up as `FetchQuote` and `ReportQuote`, each wait as a `WhenAny` with its `Delay`, and the stop as `ReportStopped`.

## When the quote API answers 429

AwesomeAPI answers `429` when its quota runs out. `FetchQuote` throws, and skail retries it with a growing wait (15 s, 30 s, 1 min, 2 min, 4 min), up to 5 times (`@SkailCommand({ retryCount: 5 })`). The console stays quiet meanwhile; in the Monitor, `FetchQuote` shows each attempt. When the quota comes back, the next attempt succeeds and the run goes on. If it does not come back in time, the run ends as Failed in the Monitor (`retryCount: 0` on the function).

## Notes

- The run has no limit: it goes on until you stop it. Stop the runs you start, so they do not keep running in your environment.
- Apps running the same `SKAIL_WORKLOAD` on the same environment share the same runs: use one workload (or environment) per person.

## Disclaimer

**This is a demo, not production code.** It exists only to show how [skail](https://docs.skail.dev) works and is provided "as is", without warranty of any kind. It uses a free third-party quote API ([AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas)) that may limit or refuse requests at any time. Do not rely on its quotes for any decision.

## License

[Apache-2.0](LICENSE)
