import { readFileSync } from "node:fs";
import { loadConfig } from "../config/config.js";
import { getRuntimeStatus, startRuntime, stopRuntime } from "../runtime/supervise.js";

export async function runtimeCommand(args: string[]): Promise<number> {
  const action = args[0] ?? "status";
  const loaded = loadConfig();

  switch (action) {
    case "start": {
      try {
        const { started, status } = await startRuntime(loaded);
        process.stdout.write(
          started
            ? `started anyharness at ${status.url} (pid ${status.pid ?? "?"}, v${status.version ?? "?"})\n`
            : `already running at ${status.url} (v${status.version ?? "?"})\n`,
        );
        return 0;
      } catch (error) {
        process.stderr.write(`${(error as Error).message}\n`);
        return 1;
      }
    }
    case "stop": {
      const stopped = await stopRuntime(loaded);
      process.stdout.write(stopped ? "stopped\n" : "not running (no pid file)\n");
      return 0;
    }
    case "logs": {
      const status = await getRuntimeStatus(loaded);
      process.stdout.write(`${status.logPath}\n`);
      try {
        process.stdout.write(readFileSync(status.logPath, "utf8"));
      } catch {
        process.stdout.write("(no log yet)\n");
      }
      return 0;
    }
    case "status":
    default: {
      const status = await getRuntimeStatus(loaded);
      process.stdout.write(`running:  ${status.running}\n`);
      process.stdout.write(`url:      ${status.url}\n`);
      process.stdout.write(`version:  ${status.version ?? "-"}\n`);
      process.stdout.write(`pid:      ${status.pid ?? "-"}\n`);
      process.stdout.write(`binary:   ${status.binary ?? "-"}${status.binarySource ? ` (${status.binarySource})` : ""}\n`);
      process.stdout.write(`home:     ${status.runtimeHome}\n`);
      process.stdout.write(`log:      ${status.logPath}\n`);
      return status.running ? 0 : 1;
    }
  }
}
