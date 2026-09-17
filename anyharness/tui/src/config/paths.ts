import { homedir } from "node:os";
import { join } from "node:path";

export interface Paths {
  configFile: string;
  dataDir: string;
  runtimeHome: string;
  binDir: string;
  logDir: string;
  pidFile: string;
}

function xdg(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

export function resolvePaths(): Paths {
  const home = homedir();
  const configDir = join(
    xdg(process.env.XDG_CONFIG_HOME, join(home, ".config")),
    "anyharness-tui",
  );
  const dataDir = join(
    xdg(process.env.XDG_DATA_HOME, join(home, ".local", "share")),
    "anyharness-tui",
  );
  return {
    configFile: join(configDir, "config.json"),
    dataDir,
    runtimeHome: join(dataDir, "runtime"),
    binDir: join(dataDir, "bin"),
    logDir: join(dataDir, "logs"),
    pidFile: join(dataDir, "runtime.pid"),
  };
}
