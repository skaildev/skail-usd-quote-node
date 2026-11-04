import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import {
  Currencies,
  QuoteLimits,
  buttonRules,
  isTerminal,
  parseCurrency,
  type RunEvent,
  type RunState,
  type RunView,
} from "@skail-usd-quote/contracts";
import { SkailGatewayError, type SkailGateway } from "./gateway.js";
import type { RunStore } from "./run-store.js";

export interface AppOptions {
  store: RunStore;
  gateway: SkailGateway;
  /** Directory with the built front end (index.html + assets). Optional: tests do not need it. */
  staticDir?: string;
}

export function toView(run: RunState): RunView {
  return {
    ...run,
    maxQuotes: QuoteLimits.maxQuotes,
    intervalSeconds: QuoteLimits.intervalSeconds,
    ui: buttonRules(run),
  };
}

export function createApp({ store, gateway, staticDir }: AppOptions): FastifyInstance {
  const app = fastify();

  app.get("/healthz", async () => "ok");

  app.post<{ Body: { currency?: string } | null }>("/api/runs", async (request, reply) => {
    const requested = request.body?.currency;
    let currency = Currencies.default;
    if (requested?.trim()) {
      const parsed = parseCurrency(requested.trim());
      if (!parsed) return reply.code(400).send({ error: `Unsupported currency '${requested}'` });
      currency = parsed;
    }

    const runId = randomUUID();
    const run = store.create(runId, currency);
    try {
      await gateway.trigger(runId, currency);
    } catch (error) {
      store.remove(runId);
      return reply.code(502).send({ error: messageOf(error) });
    }
    return toView(store.get(runId) ?? run);
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
    const run = store.get(request.params.id);
    return run ? toView(run) : reply.code(404).send();
  });

  app.post<{ Params: { id: string } }>("/api/runs/:id/stop", async (request, reply) => {
    const { id } = request.params;
    switch (store.requestStop(id)) {
      case "NotFound":
        return reply.code(404).send();
      case "AlreadyFinished":
        return reply.code(200).send();
      case "AlreadyRequested":
        return reply.code(202).send();
    }

    try {
      await gateway.fireStop(id);
      return reply.code(202).send();
    } catch (error) {
      store.cancelStopRequest(id); // keep the Stop button available for another attempt
      return reply.code(502).send({ error: messageOf(error) });
    }
  });

  // called by the worker's Report* commands
  app.post<{ Params: { id: string }; Body: RunEvent }>("/internal/runs/:id/events", async (request, reply) => {
    store.apply({ ...request.body, runId: request.params.id });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id/stream", (request, reply) => {
    const { id } = request.params;
    const current = store.get(id);
    if (!current) return reply.code(404).send();

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const send = (state: RunState) => raw.write(`data: ${JSON.stringify(toView(state))}\n\n`);

    // subscribe before sending the snapshot: no update is lost
    const unsubscribe = store.subscribe(id, send, () => raw.end());
    raw.on("close", unsubscribe);
    send(current);
    if (isTerminal(current.stage)) {
      unsubscribe();
      raw.end();
    }
  });

  if (staticDir) app.register(fastifyStatic, { root: staticDir });

  return app;
}

function messageOf(error: unknown): string {
  return error instanceof SkailGatewayError || error instanceof Error ? error.message : String(error);
}
