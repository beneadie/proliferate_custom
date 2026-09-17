import {
  createTranscriptState,
  reduceEvent,
  streamSession,
  type SessionEventEnvelope,
  type TranscriptState,
} from "@anyharness/sdk";
import { normalizeUrl } from "../config/config.js";

export interface AttachOptions {
  url: string;
  sessionId: string;
  afterSeq?: number;
  onState: (state: TranscriptState) => void;
  onEvent?: (envelope: SessionEventEnvelope) => void;
  onOpen?: () => void;
  onError?: (error: Error) => void;
}

export interface AttachedStream {
  close: () => void;
}

export function attachSession(options: AttachOptions): AttachedStream {
  let state = createTranscriptState(options.sessionId);

  const handle = streamSession({
    baseUrl: normalizeUrl(options.url),
    sessionId: options.sessionId,
    ...(options.afterSeq !== undefined ? { afterSeq: options.afterSeq } : {}),
    onOpen: options.onOpen,
    onError: options.onError,
    onEvent: (envelope) => {
      state = reduceEvent(state, envelope);
      options.onEvent?.(envelope);
      options.onState(state);
    },
  });

  return { close: () => handle.close() };
}
