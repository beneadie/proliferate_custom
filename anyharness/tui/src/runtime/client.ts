import { AnyHarnessClient } from "@anyharness/sdk";
import { normalizeUrl } from "../config/config.js";

export function createClient(url: string): AnyHarnessClient {
  return new AnyHarnessClient({ baseUrl: normalizeUrl(url) });
}
