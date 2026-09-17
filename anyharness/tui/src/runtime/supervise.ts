import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LoadedConfig } from "../config/config.js";
import { normalizeUrl } from "../config/config.js";
import { fetchHealth } from "./health.js";
import { locateRuntimeBinary } from "./locate.js";

export interface RuntimeStatus {
  running: boolean;
  url: string;
  pid: number | null;
  binary: string | null;
  binarySource: string | null;
  version: string | null;
  runtimeHome: string;
  logPath: string;
}

function readPid(paths: LoadedConfig["paths"]): number | null {
  try {
    const raw = readFileSync(paths.pidFile, "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ensureDirs(loaded: LoadedConfig): void {
  for (const dir of [
    loaded.paths.dataDir,
    loaded.paths.runtimeHome,
    loaded.paths.binDir,
    loaded.paths.logDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function getRuntimeStatus(loaded: LoadedConfig): Promise<RuntimeStatus> {
  const health = await fetchHealth(loaded.config.runtime.url);
  const binary = locateRuntimeBinary(loaded);
  const storedPid = readPid(loaded.paths);
  return {
    running: health !== null,
    url: normalizeUrl(loaded.config.runtime.url),
    pid: storedPid !== null && isAlive(storedPid) ? storedPid : null,
    binary: binary?.path ?? null,
    binarySource: binary?.source ?? null,
    version: health?.version ?? null,
    runtimeHome: loaded.config.runtime.runtimeHome,
    logPath: join(loaded.paths.logDir, "runtime.log"),
  };
}

export interface StartResult {
  started: boolean;
  status: RuntimeStatus;
}

export async function startRuntime(
  loaded: LoadedConfig,
  options: { timeoutMs?: number } = {},
): Promise<StartResult> {
  if (await fetchHealth(loaded.config.runtime.url)) {
    return { started: false, status: await getRuntimeStatus(loaded) };
  }

  const binary = locateRuntimeBinary(loaded);
  if (!binary) {
    throw new Error(
      "No AnyHarness binary found. Set ANYHARNESS_BIN, install one under "
        + `${loaded.paths.binDir}, or run \`anyharness-tui doctor\`.`,
    );
  }

  ensureDirs(loaded);

  const url = new URL(normalizeUrl(loaded.config.runtime.url));
  const host = url.hostname || "127.0.0.1";
  const port = url.port || String(loaded.config.runtime.port);
  const logPath = join(loaded.paths.logDir, "runtime.log");
  const logFd = openSync(logPath, "a");

  const child = spawn(
    binary.path,
    ["serve", "--host", host, "--port", port, "--runtime-home", loaded.config.runtime.runtimeHome],
    { detached: true, stdio: ["ignore", logFd, logFd], env: process.env },
  );

  child.unref();
  if (child.pid) {
    writeFileSync(loaded.paths.pidFile, String(child.pid), "utf8");
  }

  const timeoutMs = options.timeoutMs ?? 45_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `AnyHarness exited immediately (code ${child.exitCode}). See ${logPath}`,
      );
    }
    if (await fetchHealth(loaded.config.runtime.url)) {
      return { started: true, status: await getRuntimeStatus(loaded) };
    }
    await delay(300);
  }

  throw new Error(`AnyHarness did not become healthy within ${timeoutMs}ms. See ${logPath}`);
}

export async function stopRuntime(loaded: LoadedConfig): Promise<boolean> {
  const pid = readPid(loaded.paths);
  if (pid === null) {
    return false;
  }

  if (!isAlive(pid)) {
    rmSync(loaded.paths.pidFile, { force: true });
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    rmSync(loaded.paths.pidFile, { force: true });
    return false;
  }

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      rmSync(loaded.paths.pidFile, { force: true });
      return true;
    }
    await delay(200);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
  rmSync(loaded.paths.pidFile, { force: true });
  return true;
}

export async function waitForShutdown(loaded: LoadedConfig): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (!(await fetchHealth(loaded.config.runtime.url))) {
      return;
    }
    await delay(200);
  }
}
