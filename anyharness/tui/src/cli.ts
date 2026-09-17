import { doctorCommand } from "./commands/doctor.js";
import { runtimeCommand } from "./commands/runtime.js";
import { sessionCommand } from "./commands/session.js";

const HELP = `anyharness-tui - terminal client for the AnyHarness runtime

usage:
  anyharness-tui doctor                    environment + runtime + harness checks
  anyharness-tui runtime [start|status|stop|logs]
  anyharness-tui tui [--repo <path>] [--harness <kind>] [--prompt <text>] [--session <id>]
  anyharness-tui session new --repo <path> [--harness <kind>] [--model <id>] [--prompt <text>]
  anyharness-tui session list
  anyharness-tui session attach <id>
  anyharness-tui session prompt <id> <text>
  anyharness-tui session diff <id>
  anyharness-tui session stop <id>

env:
  ANYHARNESS_BIN               path to the anyharness binary
  ANYHARNESS_URL               runtime base url (default http://127.0.0.1:8457)
  ANYHARNESS_RUNTIME_HOME      runtime home dir
`;

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = args[index + 1] ?? "";
      index += 1;
    }
  }
  return flags;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "doctor":
      return doctorCommand();
    case "runtime":
      return runtimeCommand(rest);
    case "session":
      return sessionCommand(rest);
    case "tui": {
      const flags = parseFlags(rest);
      const { runTui } = await import("./tui/run.js");
      return runTui({
        sessionId: flags.session ?? null,
        repoPath: flags.repo ?? null,
        agentKind: flags.harness ?? null,
        prompt: flags.prompt ?? null,
      });
    }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return 0;
    default:
      process.stderr.write(`unknown command: ${command}\n\n${HELP}`);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  },
);
