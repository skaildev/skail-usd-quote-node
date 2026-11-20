import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createSkailPlatform } from "@skail/runtime";
import { parseCurrency, type Quote } from "./model.js";
import { QuoteDesk } from "./quote-desk.js";
import { SkailApiClient, skailApiOptionsFromEnvironment } from "./skail-api.js";

// usage: npm start
//   then open http://localhost:8080
if (process.argv.slice(2).some((a) => !a.startsWith("-"))) {
  console.error("This demo takes no arguments.");
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

const desk = new QuoteDesk(new SkailApiClient(skailApiOptionsFromEnvironment()));

const page = readFileSync(new URL("../page/index.html", import.meta.url));
const port = Number(process.env.DEMO_PORT ?? 8080);
// the page: localhost only, unless DEMO_HOST says otherwise (the container listens on all interfaces)
const host = process.env.DEMO_HOST ?? "127.0.0.1";

// the page, its API, and /internal/report, where the commands report each quote
const server = createServer(async (request, response) => {
  const send = (status: number, body?: unknown) =>
    response
      .writeHead(status, { "content-type": "application/json" })
      .end(body === undefined ? "" : JSON.stringify(body));
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/")
      return void response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
    if (request.method === "GET" && url.pathname === "/api/state") return send(200, desk.view());

    const start = /^\/api\/runs\/(\w+)$/.exec(url.pathname);
    if (request.method === "POST" && start) {
      const currency = parseCurrency(start[1]);
      return currency ? send(200, { runId: await desk.start(currency) }) : send(400);
    }
    const stop = /^\/api\/runs\/([\w-]+)\/stop$/.exec(url.pathname);
    if (request.method === "POST" && stop) return send((await desk.stop(stop[1]!)) ? 200 : 404);

    if (request.method === "POST" && url.pathname === "/internal/report") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const report = JSON.parse(body) as { runId: string; quoteNumber?: number; quote?: Quote; quoteCount?: number };
      if (report.quote) desk.addQuote(report.runId, report.quoteNumber!, report.quote);
      else desk.stopped(report.runId, report.quoteCount!);
      return send(200);
    }
    send(404);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    send(500);
  }
});
await new Promise<void>((resolve) => server.listen(port, host, resolve));

// the commands run in an isolated VM and report over HTTP; the address goes in the environment before the worker starts
process.env.DEMO_INTERNAL_URL = `http://127.0.0.1:${port}`;

// hosts the worker that executes QuoteFunctions (the bundle from `npm run build`);
// reads SKAIL_WORKLOAD, SKAIL_NAMESPACE, SKAIL_KEY and SKAIL_SIDECAR from the environment
const platform = createSkailPlatform({
  bundle: new URL("../.skail/skail-functions.mjs", import.meta.url),
  manifest: new URL("../.skail/manifest.json", import.meta.url),
});

const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    shutdown.abort();
  });
}
const worker = platform.run(shutdown.signal);
console.log(`Open http://localhost:${port} to start and stop runs. Ctrl+C exits; the runs go on in skail.`);
await worker;

/** Loads .env from the current directory, when present. Variables already set in the environment win. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
