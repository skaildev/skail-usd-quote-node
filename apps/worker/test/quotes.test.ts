import { describe, expect, it } from "vitest";
import { FakeQuoteProvider, HttpQuoteProvider } from "../src/quotes.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HttpQuoteProvider", () => {
  it.each(["BRL", "EUR", "CNY", "JPY"] as const)("requests USD-%s and maps the bid", async (code) => {
    const urls: string[] = [];
    const provider = new HttpQuoteProvider("https://api.test/", async (url) => {
      urls.push(String(url));
      return json({ [`USD${code}`]: { bid: "5.4321", timestamp: "1700000000" } });
    });

    const quote = await provider.get(code);

    expect(urls).toEqual([`https://api.test/json/last/USD-${code}`]);
    expect(quote).toEqual({ currency: code, rate: 5.4321, at: "2023-11-14T22:13:20.000Z" });
  });

  it("adds the missing slash to the base url", async () => {
    const urls: string[] = [];
    const provider = new HttpQuoteProvider("https://api.test", async (url) => {
      urls.push(String(url));
      return json({ USDBRL: { bid: "1", timestamp: "1" } });
    });
    await provider.get("BRL");
    expect(urls[0]).toBe("https://api.test/json/last/USD-BRL");
  });

  it("fails with the status and body when the API answers an error", async () => {
    const provider = new HttpQuoteProvider("https://api.test/", async () => json({ message: "slow down" }, 429));
    await expect(provider.get("BRL")).rejects.toThrow(/429.*slow down/);
  });

  it("fails when the pair is missing from the response", async () => {
    const provider = new HttpQuoteProvider("https://api.test/", async () =>
      json({ USDEUR: { bid: "1", timestamp: "1" } }),
    );
    await expect(provider.get("BRL")).rejects.toThrow(/USDBRL/);
  });
});

describe("FakeQuoteProvider", () => {
  it("follows the clock: base rate at second 0, 0.1% above it at second 10, back to the base at second 100", async () => {
    const at = (s: number) => new FakeQuoteProvider(() => s * 1000);
    expect(await at(10).get("BRL")).toEqual(await at(10).get("BRL"));
    expect((await at(0).get("BRL")).rate).toBe(5);
    expect((await at(10).get("BRL")).rate).toBe(5.005);
    expect((await at(10).get("EUR")).rate).toBe(0.9209);
    expect((await at(10).get("JPY")).rate).toBe(150.15);
    expect((await at(100).get("BRL")).rate).toBe(5);
    expect((await at(10).get("CNY")).currency).toBe("CNY");
  });
});
