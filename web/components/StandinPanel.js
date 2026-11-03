"use client";

import { useEffect, useState } from "react";
import { artifactUrl, jobResult, pollJob, startJob } from "../lib/api";
import MediaLoading, { useMediaLoading } from "./MediaLoading";
import { Alert, Btn, Icon } from "./ui";

export default function StandinPanel({ clip, cue, onClose }) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [prompt, setPrompt] = useState("");
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
  const previewLoading = useMediaLoading(preview);
  const running = !error && job?.status !== "done";

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-start gap-6 overflow-y-auto overflow-x-hidden bg-bg p-6 min-[900px]:flex-row" role="region" aria-label="Stand-in render">
      <div className="flex h-fit w-full min-w-0 max-w-[980px] flex-1 flex-col min-[900px]:flex-[0_1_980px] gap-3 rounded-lg border border-line2 bg-panel p-4">
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
            {preview && (
              <div className="relative aspect-video w-full overflow-hidden rounded bg-well">
                <video key={previewLoading.attempt} src={preview} controls autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-contain" {...previewLoading.handlers} />
                <MediaLoading status={previewLoading} />
              </div>
            )}
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
          </>
        )}
      </div>
      <aside className="h-fit w-full flex-none overflow-hidden rounded-lg border border-line2 bg-panel min-[900px]:min-w-[360px] min-[900px]:flex-1" aria-labelledby="standin-prompt-title">
        <h2 id="standin-prompt-title" className="flex h-8 items-center border-b border-line px-3 text-2xs font-semibold uppercase tracking-wider text-mute">Prompt</h2>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1.5">
            <textarea id="standin-prompt" aria-label="Prompt" rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Prompt here"
              className="w-full resize-none rounded border border-line bg-field px-2.5 py-2 text-sm text-ink focus:border-accent" />
          </div>
          <button type="button" className="h-8 w-full rounded bg-accent/15 text-sm text-accent hover:bg-accent/25">Generate</button>
        </div>
      </aside>
    </div>
  );
}
