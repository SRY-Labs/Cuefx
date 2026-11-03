"use client";

import { useEffect, useRef, useState } from "react";
import { Btn } from "./ui";

const SHOW_AFTER_MS = 180;
const MIN_VISIBLE_MS = 300;

function useCalmFlag(on) {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (on === shown) return undefined;
    const wait = on ? SHOW_AFTER_MS : Math.max(0, MIN_VISIBLE_MS - (Date.now() - since.current));
    const timer = setTimeout(() => {
      if (on) since.current = Date.now();
      setShown(on);
    }, wait);
    return () => clearTimeout(timer);
  }, [on, shown]);
  return shown;
}

/** Load state of one <img> or <video>. Spread `handlers` on the element and use `attempt` in its key so Retry remounts it. */
export function useMediaLoading(src) {
  const [attempt, setAttempt] = useState(0);
  const [readyId, setReadyId] = useState(null);
  const [failedId, setFailedId] = useState(null);
  const [buffering, setBuffering] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const id = `${src}#${attempt}`;
  const failed = failedId === id;
  const visible = useCalmFlag(!failed && (readyId !== id || buffering));

  function ready() {
    setReadyId(id);
    setBuffering(false);
    setHasFrame(true);
  }

  return {
    attempt,
    ready: readyId === id,
    failed,
    visible,
    hasFrame,
    retry: () => setAttempt((value) => value + 1),
    handlers: {
      onLoad: ready,
      onLoadedData: ready,
      onCanPlay: ready,
      onPlaying: ready,
      onSeeking: () => setBuffering(true),
      onSeeked: (event) => { if (event.currentTarget.readyState >= 3) ready(); },
      onWaiting: () => setBuffering(true),
      onStalled: (event) => { if (event.currentTarget.readyState < 3) setBuffering(true); },
      onError: () => setFailedId(id),
    },
  };
}

/** The quiet overlay for a media box: a shimmer and spinner while nothing is shown yet, only the spinner over a visible frame. */
export default function MediaLoading({ status, label = "Loading video…" }) {
  const { failed, visible, hasFrame, retry } = status;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0">
      {failed ? (
        <div className="pointer-events-auto flex h-full flex-col items-center justify-center gap-2 bg-well text-sm">
          <span className="text-white/80">Video couldn&apos;t be loaded</span>
          <Btn size="sm" onClick={retry}>Retry</Btn>
        </div>
      ) : visible && (
        <div className={`flex h-full flex-col items-center justify-center gap-2 ${hasFrame ? "bg-well/15" : "media-shimmer"}`}>
          <span className="media-spinner" aria-hidden="true" />
          {!hasFrame && <span className="text-2xs text-white/60" aria-hidden="true">{label}</span>}
          <span className="sr-only">Loading video</span>
        </div>
      )}
    </div>
  );
}
