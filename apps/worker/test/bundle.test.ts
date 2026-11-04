import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSkail } from "@skail/build";

describe("skail build", () => {
  it("accepts the worker (no forbidden imports) and lists the function and commands as <workload>/<method>", async () => {
    const dir = await mkdtemp(join(tmpdir(), "usd-quote-bundle-"));
    try {
      const manifest = await buildSkail({
        entryPoint: "src/skail-functions.ts",
        workload: "usd-quote:v0.0.1",
        outfile: join(dir, "skail-functions.mjs"),
        manifestFile: join(dir, "manifest.json"),
      });

      expect(manifest.methods.map((m) => [m.kind, m.uri]).sort()).toEqual([
        ["command", "usd-quote:v0.0.1/FetchQuote"],
        ["command", "usd-quote:v0.0.1/ReportCompleted"],
        ["command", "usd-quote:v0.0.1/ReportFailure"],
        ["command", "usd-quote:v0.0.1/ReportQuote"],
        ["command", "usd-quote:v0.0.1/ReportStopped"],
        ["function", "usd-quote:v0.0.1/TrackUsdQuote"],
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
