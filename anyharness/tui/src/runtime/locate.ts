import { accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { LoadedConfig } from "../config/config.js";

export interface RuntimeBinary {
  path: string;
  source: "config/env" | "managed" | "path";
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function locateRuntimeBinary({ config, paths }: LoadedConfig): RuntimeBinary | null {
  const candidates: RuntimeBinary[] = [];

  if (config.runtime.binaryPath) {
    candidates.push({ path: config.runtime.binaryPath, source: "config/env" });
  }
  candidates.push({ path: join(paths.binDir, "anyharness"), source: "managed" });

  try {
    const found = execFileSync("which", ["anyharness"], { encoding: "utf8" }).trim();
    if (found) {
      candidates.push({ path: found, source: "path" });
    }
  } catch {
    // No PATH install; the other candidates stand.
  }

  return candidates.find((candidate) => isExecutable(candidate.path)) ?? null;
}
