// Entry point of the skail build (scripts/build-skail.mjs): the function class and how to create it.
import type { Provider } from "@skail/runtime";
import { QuoteFunctions } from "./quote-functions.js";
import { AwesomeApiQuoteProvider } from "./quotes.js";

export { QuoteFunctions };

export const providers: Provider[] = [
  {
    token: QuoteFunctions,
    useFactory: () => new QuoteFunctions(new AwesomeApiQuoteProvider()),
  },
];
