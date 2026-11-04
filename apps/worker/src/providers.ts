import type { Provider } from "@skail/runtime";
import { buildConfig } from "./build-config.generated.js";
import { HttpProgressNotifier } from "./progress.js";
import { QuoteFunctions } from "./quote-functions.js";
import { FakeQuoteProvider, HttpQuoteProvider } from "./quotes.js";

// The skail bundle cannot read environment variables: these settings are fixed at build time (gen-config.mjs).
export const providers: Provider[] = [
  {
    token: QuoteFunctions,
    useFactory: () =>
      new QuoteFunctions(
        buildConfig.quoteProvider === "fake" ? new FakeQuoteProvider() : new HttpQuoteProvider(buildConfig.quoteApiUrl),
        new HttpProgressNotifier(buildConfig.webBaseUrl),
      ),
  },
];
