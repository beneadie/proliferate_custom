import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { AnyHarnessClient } from "@anyharness/sdk";
import { createSession } from "../session/create.js";
import { renderTranscriptItems } from "../session/format.js";
import { useAttachedSession } from "./useAttachedSession.js";
import { theme } from "./theme.js";

export interface AppProps {
  client: AnyHarnessClient;
  url: string;
  repoPath: string | null;
  agentKind: string;
  initialSessionId: string | null;
  promptOnStart: string | null;
}

export function App(props: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [sessionId, setSessionId] = useState<string | null>(props.initialSessionId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState<"input" | "transcript">("input");

  useEffect(() => {
    if (sessionId || !props.repoPath) {
      return undefined;
    }
    let cancelled = false;
    setCreating(true);
    createSession(props.client, {
      repoPath: props.repoPath,
      agentKind: props.agentKind,
      ...(props.promptOnStart ? { prompt: props.promptOnStart } : {}),
    })
      .then((created) => {
        if (!cancelled) {
          setSessionId(created.session.id);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError((cause as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCreating(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, props.repoPath, props.agentKind, props.promptOnStart, props.client]);

  const transcript = useAttachedSession(props.url, sessionId);

  const rows = stdout?.rows ?? 24;
  const bodyHeight = Math.max(5, rows - 6);

  const lines = useMemo(
    () => (transcript ? renderTranscriptItems(transcript) : []),
    [transcript],
  );
  const total = lines.length;
  const maxOffset = Math.max(0, total - bodyHeight);
  const clampedOffset = Math.min(offset, maxOffset);
  const start = Math.max(0, total - bodyHeight - clampedOffset);
  const visible = lines.slice(start, start + bodyHeight);

  useInput((char, key) => {
    if (key.tab) {
      setFocus((current) => (current === "input" ? "transcript" : "input"));
      return;
    }
    if (key.escape) {
      setOffset(0);
      return;
    }
    if (focus !== "transcript") {
      return;
    }
    if (char === "j" || key.downArrow) {
      setOffset((current) => Math.min(maxOffset, current + 1));
    } else if (char === "k" || key.upArrow) {
      setOffset((current) => Math.max(0, current - 1));
    } else if (key.pageDown) {
      setOffset((current) => Math.min(maxOffset, current + bodyHeight));
    } else if (key.pageUp) {
      setOffset((current) => Math.max(0, current - bodyHeight));
    } else if (char === "g") {
      setOffset(maxOffset);
    }
  });

  const submit = (value: string) => {
    const text = value.trim();
    if (!text || !sessionId) {
      return;
    }
    setInput("");
    setOffset(0);
    props.client.sessions.promptText(sessionId, text).catch((cause) => {
      setError((cause as Error).message);
    });
  };

  const streaming = transcript?.isStreaming ?? false;
  const statusText = creating
    ? "creating session"
    : sessionId
      ? streaming
        ? "streaming"
        : "idle"
      : "waiting";

  return (
    <Box flexDirection="column" height={rows}>
      <Box justifyContent="space-between">
        <Text color={theme.accent} bold>
          AnyHarness
        </Text>
        <Text color={theme.dim}>
          {props.agentKind} · {sessionId ?? "-"}
        </Text>
      </Box>

      <Box flexDirection="column" height={bodyHeight} overflow="hidden">
        {visible.length === 0 ? (
          <Text color={theme.dim}>
            {creating ? "starting session…" : "no transcript yet"}
          </Text>
        ) : (
          visible.map((line, index) => (
            <Text
              key={`${line.itemId}:${index}`}
              color={theme[line.role] ?? theme.agent}
              wrap="truncate-end"
            >
              {line.role === "user" ? "> " : line.role === "tool" ? "  " : ""}
              {line.text}
            </Text>
          ))
        )}
      </Box>

      <Box>
        <Text color={theme.dim}>{focus === "input" ? "› " : "  "}</Text>
        {sessionId ? (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            focus={focus === "input"}
            placeholder="ask the agent…"
          />
        ) : (
          <Text color={theme.dim}>starting…</Text>
        )}
      </Box>

      <Box justifyContent="space-between">
        <Text color={streaming ? theme.accent : theme.dim}>
          {creating ? <Spinner /> : null} {statusText} · {total} items
          {clampedOffset > 0 ? ` · scroll -${clampedOffset}` : ""}
        </Text>
        <Text color={theme.dim}>
          Tab {focus === "input" ? "→ transcript" : "→ input"} · j/k scroll · Esc bottom · Ctrl+C quit
        </Text>
      </Box>

      {error ? (
        <Text color={theme.error} wrap="truncate-end">
          error: {error}
        </Text>
      ) : null}
    </Box>
  );
}
