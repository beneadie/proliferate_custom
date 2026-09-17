import type { HealthResponse } from "@anyharness/sdk";
import { normalizeUrl } from "../config/config.js";

export async function fetchHealth(url: string, timeoutMs = 1500): Promise<HealthResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizeUrl(url)}/health`, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
