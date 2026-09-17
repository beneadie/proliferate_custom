import { execFileSync } from "node:child_process";
import type { AnyHarnessClient } from "@anyharness/sdk";
import { loadConfig, type LoadedConfig } from "../config/config.js";
import { createClient } from "../runtime/client.js";
import { fetchHealth } from "../runtime/health.js";
import { startRuntime } from "../runtime/supervise.js";
import { createSession } from "../session/create.js";
import { renderTranscript, type TranscriptLine } from "../session/format.js";
import { attachSession } from "../session/stream.js";

async function ensureClient(loaded: LoadedConfig): Promise<AnyHarnessClient> {
  if (!(await fetchHealth(loaded.config.runtime.url))) {
    if (!loaded.config.runtime.autoStart) {
      throw new Error(`Runtime not running at ${loaded.config.runtime.url} and autoStart is off.`);
    }
    await startRuntime(loaded);
  }
  return createClient(loaded.config.runtime.url);
}

function parseFlags(args: string[]): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[index + 1] ?? "";
      flags[key] = value;
      index += 1;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

function printLine(line: TranscriptLine): void {
  const prefix = {
    user: "> ",
    agent: "",
    thought: "~ ",
    tool: "  ",
    system: "  ",
  }[line.role];
  process.stdout.write(`${prefix}${line.text.replace(/\n/g, "\n  ")}\n`);
}

async function attachCommand(client: AnyHarnessClient, loaded: LoadedConfig, sessionId: string): Promise<number> {
  const printed = new Set<string>();
  const state = await client.sessions.get(sessionId);
  process.stdout.write(`session ${state.id} (${(state as { status?: string }).status ?? "?"})\n\n`);

  await new Promise<void>((resolve) => {
    const stream = attachSession({
      url: loaded.config.runtime.url,
      sessionId,
      onState: (transcript) => {
        for (const [index, line] of renderTranscript(transcript).entries()) {
          const key = `${index}:${line.role}:${line.text}`;
          if (!printed.has(key)) {
            printed.add(key);
            printLine(line);
          }
        }
      },
      onError: (error) => process.stderr.write(`\nstream error: ${error.message}\n`),
    });

    const stop = () => {
      stream.close();
      resolve();
    };
    process.on("SIGINT", stop);
    setTimeout(() => {
      process.stdout.write("\n(detached after 60s; use `session attach` to follow again)\n");
      stop();
    }, 60_000);
  });

  return 0;
}

export async function sessionCommand(args: string[]): Promise<number> {
  const sub = args[0] ?? "list";
  const loaded = loadConfig();
  const client = await ensureClient(loaded);

  switch (sub) {
    case "new": {
      const { flags } = parseFlags(args.slice(1));
      const repo = flags.repo ?? loaded.config.defaults.repo;
      if (!repo) {
        process.stderr.write("--repo is required (or set defaults.repo in config)\n");
        return 1;
      }
      const created = await createSession(client, {
        repoPath: repo,
        agentKind: flags.harness ?? loaded.config.defaults.agentKind,
        ...(flags.model ? { modelId: flags.model } : {}),
        ...(flags.prompt ? { prompt: flags.prompt } : {}),
      });
      process.stdout.write(
        `created ${created.session.id}\n  workspace ${created.workspaceId}\n  path      ${created.workspacePath}\n`,
      );
      return 0;
    }
    case "list": {
      const sessions = await client.sessions.list();
      if (sessions.length === 0) {
        process.stdout.write("no sessions\n");
        return 0;
      }
      for (const session of sessions) {
        const status = (session as { status?: string }).status ?? "?";
        const title = session.title ?? "";
        process.stdout.write(`${session.id}  ${status.padEnd(12)} ${title}\n`);
      }
      return 0;
    }
    case "prompt": {
      const { rest } = parseFlags(args.slice(1));
      const [sessionId, ...words] = rest;
      if (!sessionId || words.length === 0) {
        process.stderr.write("usage: session prompt <id> <text>\n");
        return 1;
      }
      await client.sessions.promptText(sessionId, words.join(" "));
      process.stdout.write("sent\n");
      return 0;
    }
    case "attach": {
      const sessionId = args[1];
      if (!sessionId) {
        process.stderr.write("usage: session attach <id>\n");
        return 1;
      }
      return attachCommand(client, loaded, sessionId);
    }
    case "stop": {
      const sessionId = args[1];
      if (!sessionId) {
        process.stderr.write("usage: session stop <id>\n");
        return 1;
      }
      await client.sessions.close(sessionId);
      process.stdout.write("closed\n");
      return 0;
    }
    case "diff": {
      const sessionId = args[1];
      if (!sessionId) {
        process.stderr.write("usage: session diff <id>\n");
        return 1;
      }
      const session = await client.sessions.get(sessionId);
      const workspaceId = (session as { workspaceId?: string }).workspaceId;
      if (!workspaceId) {
        process.stderr.write("session has no workspaceId\n");
        return 1;
      }
      const workspace = await client.workspaces.get(workspaceId);
      try {
        const status = execFileSync("git", ["status", "--short"], {
          cwd: workspace.path,
          encoding: "utf8",
        });
        process.stdout.write(status || "(clean)\n");
      } catch (error) {
        process.stderr.write(`git status failed: ${(error as Error).message}\n`);
        return 1;
      }
      return 0;
    }
    default:
      process.stderr.write(`unknown session subcommand: ${sub}\n`);
      return 1;
  }
}
