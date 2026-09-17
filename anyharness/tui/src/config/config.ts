import { readFileSync } from "node:fs";
import { resolvePaths, type Paths } from "./paths.js";

export interface RuntimeConfig {
  url: string;
  port: number;
  binaryPath: string | null;
  runtimeHome: string;
  autoStart: boolean;
}

export interface DefaultsConfig {
  agentKind: string;
  repo: string | null;
}

export interface TuiConfig {
  runtime: RuntimeConfig;
  defaults: DefaultsConfig;
}

export interface LoadedConfig {
  config: TuiConfig;
  paths: Paths;
  warnings: string[];
}

const DEFAULT_AGENT = "claude";

export function loadConfig(): LoadedConfig {
  const paths = resolvePaths();
  const warnings: string[] = [];

  let fromFile: Partial<TuiConfig> = {};
  try {
    fromFile = JSON.parse(readFileSync(paths.configFile, "utf8")) as Partial<TuiConfig>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      warnings.push(`Could not read ${paths.configFile}: ${(error as Error).message}`);
    }
  }

  const runtimeFile = fromFile.runtime ?? ({} as Partial<RuntimeConfig>);
  const defaultsFile = fromFile.defaults ?? ({} as Partial<DefaultsConfig>);

  const config: TuiConfig = {
    runtime: {
      url: runtimeFile.url ?? "http://127.0.0.1:8457",
      port: runtimeFile.port ?? 8457,
      binaryPath: runtimeFile.binaryPath ?? null,
      runtimeHome: runtimeFile.runtimeHome ?? paths.runtimeHome,
      autoStart: runtimeFile.autoStart ?? true,
    },
    defaults: {
      agentKind: defaultsFile.agentKind ?? DEFAULT_AGENT,
      repo: defaultsFile.repo ?? null,
    },
  };

  if (process.env.ANYHARNESS_URL) {
    config.runtime.url = process.env.ANYHARNESS_URL;
  }
  if (process.env.ANYHARNESS_RUNTIME_HOME) {
    config.runtime.runtimeHome = process.env.ANYHARNESS_RUNTIME_HOME;
  }
  if (process.env.ANYHARNESS_BIN) {
    config.runtime.binaryPath = process.env.ANYHARNESS_BIN;
  }

  return { config, paths, warnings };
}

/** The client and SSE stream both want the same normalized origin. */
export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
