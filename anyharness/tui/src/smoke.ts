import type { AnyHarnessClient } from "@anyharness/sdk";
import { loadConfig } from "./config/config.js";
import { createClient } from "./runtime/client.js";
import { fetchHealth } from "./runtime/health.js";
import { startRuntime } from "./runtime/supervise.js";
import { createSession } from "./session/create.js";
import { renderTranscriptItems } from "./session/format.js";
import { attachSession } from "./session/stream.js";

const DEFAULT_PROMPT =
  "List the top-level files in this repository and summarize the project layout. "
  + "Do not modify any files.";

async function ensureRuntime(loaded: ReturnType<typeof loadConfig>): Promise<AnyHarnessClient> {
  if (!(await fetchHealth(loaded.config.runtime.url))) {
    process.stdout.write("starting runtime...\n");
    await startRuntime(loaded);
  }
  return createClient(loaded.config.runtime.url);
}

async function main(): Promise<number> {
  const repoPath = process.argv[2] ?? process.env.ANYHARNESS_SMOKE_REPO;
  if (!repoPath) {
    process.stderr.write("usage: tsx src/smoke.ts <repo-path>\n");
    return 1;
  }

  const loaded = loadConfig();
  const client = await ensureRuntime(loaded);
  const agentKind = process.env.ANYHARNESS_SMOKE_AGENT ?? loaded.config.defaults.agentKind;

  process.stdout.write(`creating session in ${repoPath} with ${agentKind}...\n`);
  const created = await createSession(client, {
    repoPath,
    agentKind,
    prompt: DEFAULT_PROMPT,
  });
  process.stdout.write(`session ${created.session.id}\n\n`);

  const printed = new Set<string>();
  let sawOutput = false;
  let finished = false;

  await new Promise<void>((resolve) => {
    const stream = attachSession({
      url: loaded.config.runtime.url,
      sessionId: created.session.id,
      onState: (state) => {
        for (const line of renderTranscriptItems(state)) {
          if (!line.completed || printed.has(line.itemId)) {
            continue;
          }
          printed.add(line.itemId);
          if (line.role === "agent" || line.role === "tool") {
            sawOutput = true;
          }
          const prefix = line.role === "user" ? "> " : line.role === "tool" ? "  " : "";
          process.stdout.write(`${prefix}${line.text}\n`);
        }
        if (sawOutput && !state.isStreaming && !finished) {
          finished = true;
          setTimeout(() => {
            stream.close();
            resolve();
          }, 1500);
        }
      },
      onError: (error) => process.stderr.write(`stream error: ${error.message}\n`),
    });

    setTimeout(() => {
      if (!finished) {
        process.stdout.write("\n(timeout: closing smoke stream)\n");
        stream.close();
        resolve();
      }
    }, 180_000);
  });

  process.stdout.write(`\nsmoke complete for session ${created.session.id}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  },
);
