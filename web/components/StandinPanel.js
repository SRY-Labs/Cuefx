"use client";

import { useEffect, useState } from "react";
import { artifactUrl, jobResult, pollElement, pollJob, startJob } from "../lib/api";
import { Alert, Btn, Icon } from "./ui";

export default function StandinPanel({ clip, cue, onClose }) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [element, setElement] = useState(null);
  const [started] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const controller = new AbortController();
    let gone = false;
    setError(null);
    startJob(clip.clip_id, cue, controller.signal)
      .then((first) => pollJob(first.id, { signal: controller.signal, onJob: (next) => { if (!gone) setJob(next); } }))
      .then(async (done) => {
        if (gone) return;
        setJob(done);
        if (done.status === "failed") {
          setError(done.error || { code: "render_failed", message: "The stand-in render failed." });
          return;
        }
        setResult(await jobResult(done.id));
      })
      .catch((err) => { if (!gone && !err?.aborted) setError(err); });
    return () => { gone = true; controller.abort(); };
  }, [clip.clip_id, cue]);

  const elapsed = Math.round((now - started) / 1000);
  const preview = artifactUrl(job, "hardcomp");
  const running = !error && job?.status !== "done";

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function makeElement() {
    setElement({ status: "running" });
    try {
      const next = await pollElement(job.id, { onJob: setJob });
      if (next.artifacts?.element?.status === "failed") {
        setElement({ status: "error", error: next.error || { message: "element.mp4 could not be prepared." } });
        return;
      }
      setElement({ status: "ready" });
    } catch (err) {
      setElement({ status: "error", error: err });
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-label="Stand-in render">
      <div className="flex max-h-full w-full max-w-[980px] flex-col gap-3 overflow-y-auto rounded-lg border border-line2 bg-panel p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Stand-in</h2>
          <span className="text-xs text-faint">The stand-in ball composited on the footage</span>
          <span className="flex-1" />
          <Btn variant="ghost" icon="x" onClick={onClose}>Close</Btn>
        </div>
        {running && (
          <div className="flex flex-col items-center gap-2 py-12" role="status">
            <Icon name="loader" size={28} className="spin text-accent" />
            <div className="text-sm font-semibold tnum">{job?.status === "queued" ? "Waiting for the render queue" : "Rendering stand-in"} · {elapsed}s</div>
            <div className="text-xs text-mute">A new cue takes a few minutes. The same cue again is immediate.</div>
          </div>
        )}
        {error && <Alert error={error} action={<Btn variant="primary" onClick={onClose}>Close</Btn>}>The stand-in could not be rendered</Alert>}
        {job?.status === "done" && !error && (
          <>
            {preview && <video src={preview} controls autoPlay loop muted playsInline className="w-full rounded bg-black" />}
            {result && (
              <div className="text-xs text-mute tnum">
                Window {result.effect_range.start}–{result.effect_range.end - 1}
                {result.cached ? " · from the cache" : ""}
                {result.timings_s?.total ? ` · rendered in ${Math.round(result.timings_s.total)} s` : ""}
              </div>
            )}
            {(result?.warnings || job.warnings || []).length > 0 && (
              <ul className="list-disc pl-4 text-xs text-warn">
                {(result?.warnings || job.warnings).map((warning) => <li key={warning.id || warning.message}>{warning.message}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {artifactUrl(job, "hardcomp") && <a className="inline-flex h-8 items-center rounded border border-line2 bg-raised px-3 text-sm" href={artifactUrl(job, "hardcomp", true)}>Hard comp</a>}
              {artifactUrl(job, "layout") && <a className="inline-flex h-8 items-center rounded border border-line2 bg-raised px-3 text-sm" href={artifactUrl(job, "layout", true)}>Layout</a>}
              {element?.status === "running"
                ? <span className="inline-flex h-8 items-center gap-2 text-sm text-mute"><Icon name="loader" className="spin" /> Preparing element.mp4</span>
                : <Btn onClick={makeElement} disabled={element?.status === "ready"}>Element video</Btn>}
              {element?.status === "ready" && <a className="inline-flex h-8 items-center rounded border border-line2 bg-raised px-3 text-sm" href={artifactUrl(job, "element", true)}>Download element</a>}
            </div>
            {element?.status === "error" && <Alert error={element.error}>element.mp4 could not be prepared</Alert>}
          </>
        )}
      </div>
    </div>
  );
}
