import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/config.js";
import { createClient } from "../runtime/client.js";
import { fetchHealth } from "../runtime/health.js";
import { locateRuntimeBinary } from "../runtime/locate.js";

type Level = "ok" | "warn" | "fail";

interface Check {
  level: Level;
  label: string;
  detail?: string;
}

function run(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function symbol(level: Level): string {
  switch (level) {
    case "ok":
      return "[ok]";
    case "warn":
      return "[--]";
    default:
      return "[!!]";
  }
}

export async function doctorCommand(): Promise<number> {
  const loaded = loadConfig();
  const { config, paths } = loaded;
  const checks: Check[] = [];

  checks.push({ level: "ok", label: `platform ${process.platform}/${process.arch}` });
  checks.push({ level: "ok", label: `node ${process.version}` });

  const gitVersion = run("git", ["--version"]);
  checks.push(
    gitVersion
      ? { level: "ok", label: `git ${gitVersion.replace(/^git version /, "")}` }
      : { level: "fail", label: "git not found on PATH" },
  );

  for (const warning of loaded.warnings) {
    checks.push({ level: "warn", label: warning });
  }

  const binary = locateRuntimeBinary(loaded);
  if (binary) {
    const version = run(binary.path, ["--version"]);
    checks.push({
      level: "ok",
      label: `runtime binary (${binary.source})`,
      detail: version ? `${binary.path}  (${version})` : binary.path,
    });
  } else {
    checks.push({
      level: "fail",
      label: "runtime binary not found",
      detail: `set ANYHARNESS_BIN or place a binary at ${join(paths.binDir, "anyharness")}`,
    });
  }

  try {
    mkdirSync(paths.runtimeHome, { recursive: true });
    const probe = join(paths.runtimeHome, ".write-probe");
    writeFileSync(probe, "ok");
    rmSync(probe, { force: true });
    checks.push({ level: "ok", label: "runtime home writable", detail: paths.runtimeHome });
  } catch {
    checks.push({ level: "fail", label: "runtime home not writable", detail: paths.runtimeHome });
  }

  const health = await fetchHealth(config.runtime.url);
  if (health) {
    checks.push({
      level: "ok",
      label: `runtime healthy at ${config.runtime.url}`,
      detail: `v${health.version}  home=${health.runtimeHome}`,
    });
  } else {
    checks.push({
      level: "warn",
      label: `runtime not responding at ${config.runtime.url}`,
      detail: "start it with `anyharness-tui runtime start`",
    });
  }

  if (health) {
    try {
      const client = createClient(config.runtime.url);
      const agents = await client.agents.list();
      const kinds = agents.map((agent) => (agent as { kind?: string }).kind ?? "?");
      checks.push({
        level: "ok",
        label: `${agents.length} harness(es) known`,
        detail: kinds.join(", "),
      });
    } catch (error) {
      checks.push({
        level: "warn",
        label: "could not list harnesses",
        detail: (error as Error).message,
      });
    }
  }

  process.stdout.write("\nanyharness-tui doctor\n\n");
  for (const check of checks) {
    process.stdout.write(
      `  ${symbol(check.level)} ${check.label}${check.detail ? `\n        ${check.detail}` : ""}\n`,
    );
  }

  if (process.platform === "linux" && process.arch === "arm64") {
    process.stdout.write(
      "\n  note: on linux/arm64 claude and codex have pinned artifacts. opencode does "
        + "not as pinned; set ANYHARNESS_OPENCODE_AGENT_PROGRAM (and "
        + "ANYHARNESS_OPENCODE_AGENT_ARGS_JSON='[\"acp\"]') or expect reconcile to fail it.\n",
    );
  }

  const failures = checks.filter((check) => check.level === "fail").length;
  process.stdout.write("\n");
  return failures > 0 ? 1 : 0;
}
