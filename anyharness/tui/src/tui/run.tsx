import { render } from "ink";
import { loadConfig } from "../config/config.js";
import { createClient } from "../runtime/client.js";
import { fetchHealth } from "../runtime/health.js";
import { startRuntime } from "../runtime/supervise.js";
import { App } from "./App.js";

export interface RunTuiOptions {
  sessionId: string | null;
  repoPath: string | null;
  agentKind: string | null;
  prompt: string | null;
}

export async function runTui(options: RunTuiOptions): Promise<number> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "The TUI needs an interactive terminal (stdin is not a TTY). "
        + "Run it in your terminal, or use `anyharness-tui session attach <id>` for one-shot streaming.",
    );
  }

  const loaded = loadConfig();

  if (!(await fetchHealth(loaded.config.runtime.url))) {
    if (!loaded.config.runtime.autoStart) {
      throw new Error(
        `Runtime not running at ${loaded.config.runtime.url} and autoStart is off.`,
      );
    }
    await startRuntime(loaded);
  }

  const repoPath = options.repoPath ?? loaded.config.defaults.repo;
  if (!options.sessionId && !repoPath) {
    throw new Error("tui needs --repo <path>, a configured defaults.repo, or --session <id>");
  }

  const app = render(
    <App
      client={createClient(loaded.config.runtime.url)}
      url={loaded.config.runtime.url}
      repoPath={repoPath}
      agentKind={options.agentKind ?? loaded.config.defaults.agentKind}
      initialSessionId={options.sessionId}
      promptOnStart={options.prompt}
    />,
    { exitOnCtrlC: true },
  );

  await app.waitUntilExit();
  return 0;
}
