import { useEffect, useRef, useState } from "react";
import { createTranscriptState, type TranscriptState } from "@anyharness/sdk";
import { attachSession, type AttachedStream } from "../session/stream.js";

export function useAttachedSession(
  url: string,
  sessionId: string | null,
): TranscriptState | null {
  const [state, setState] = useState<TranscriptState | null>(null);
  const streamRef = useRef<AttachedStream | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState(null);
      return undefined;
    }

    setState(createTranscriptState(sessionId));
    const stream = attachSession({
      url,
      sessionId,
      onState: (next) => setState({ ...next }),
    });
    streamRef.current = stream;

    return () => {
      stream.close();
      streamRef.current = null;
    };
  }, [url, sessionId]);

  return state;
}
