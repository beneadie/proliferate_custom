import type { TranscriptItem, TranscriptState } from "@anyharness/sdk";

export type TranscriptRole = "user" | "agent" | "thought" | "tool" | "system";

export interface TranscriptLine {
  role: TranscriptRole;
  text: string;
}

function roleFor(item: TranscriptItem): TranscriptRole {
  switch (item.kind) {
    case "user_message":
      return "user";
    case "assistant_prose":
      return "agent";
    case "thought":
      return "thought";
    case "tool_call":
      return "tool";
    default:
      return "system";
  }
}

function textFor(item: TranscriptItem): string | null {
  switch (item.kind) {
    case "user_message":
    case "assistant_prose":
    case "thought":
      return item.text.trim().length > 0 ? item.text : null;
    case "tool_call": {
      const label = item.title ?? item.nativeToolName ?? item.toolKind;
      return `[tool:${item.toolKind}] ${label}`;
    }
    case "plan":
      return `[plan] ${item.entries.length} entr${item.entries.length === 1 ? "y" : "ies"}`;
    case "proposed_plan":
      return `[proposed plan] ${item.plan.planId}`;
    case "error":
      return `[error] ${item.message}`;
    case "unknown":
      return `[event:${item.eventType}]`;
    default:
      return null;
  }
}

export function renderTranscript(state: TranscriptState): TranscriptLine[] {
  return renderTranscriptItems(state).map(({ role, text }) => ({ role, text }));
}

export interface TranscriptItemLine extends TranscriptLine {
  itemId: string;
  completed: boolean;
}

export function renderTranscriptItems(state: TranscriptState): TranscriptItemLine[] {
  const lines: TranscriptItemLine[] = [];
  for (const turnId of state.turnOrder) {
    const turn = state.turnsById[turnId];
    if (!turn) {
      continue;
    }
    for (const itemId of turn.itemOrder) {
      const item = state.itemsById[itemId];
      if (!item) {
        continue;
      }
      const text = textFor(item);
      if (text !== null) {
        lines.push({
          itemId,
          role: roleFor(item),
          text,
          completed: "completedAt" in item && item.completedAt !== null,
        });
      }
    }
  }
  return lines;
}
