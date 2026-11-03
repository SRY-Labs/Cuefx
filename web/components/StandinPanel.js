"use client";

import { useEffect, useRef, useState } from "react";
import { artifactUrl, jobResult, pollElement, pollGeneration, pollJob, pollVideo, startGeneration, startJob, startVideo } from "../lib/api";
import { lookById } from "../lib/cue";
import MediaLoading, { useMediaLoading } from "./MediaLoading";
import { Alert, Btn, Icon } from "./ui";

const LTX_PROMPT = "One luminous energy orb in the original room with the person visible, matching the supplied look image and following the guide video's orb position, scale, and motion. Preserve the original scene. In reversed time the orb contracts and dims toward clean source frames.";

export default function StandinPanel({ clip, cue, onClose }) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [element, setElement] = useState(null);
  const [stillPrompt, setStillPrompt] = useState(() => cue.prompt || lookById(cue.look).prompt || "");
  const [still, setStill] = useState(null);
  const [stillError, setStillError] = useState(null);
  const [ltxPrompt, setLtxPrompt] = useState(LTX_PROMPT);
  const [video, setVideo] = useState(null);
  const [videoError, setVideoError] = useState(null);
  const [started] = useState(() => performance.now());
  const [stillStarted, setStillStarted] = useState(null);
  const [videoStarted, setVideoStarted] = useState(null);
  const [now, setNow] = useState(() => performance.now());
  const stillPoll = useRef(null);
  const videoPoll = useRef(null);

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
    return () => {
      gone = true;
      controller.abort();
      stillPoll.current?.abort();
      videoPoll.current?.abort();
    };
  }, [clip.clip_id, cue]);

  const preview = artifactUrl(job, "hardcomp");
  const previewLoading = useMediaLoading(preview);
  const stillUrl = still?.status === "done" ? still.reference : null;
  const stillLoading = useMediaLoading(stillUrl);
  const videoUrl = video?.status === "done" ? video.video : null;
  const videoLoading = useMediaLoading(videoUrl);
  const standinRunning = !error && job?.status !== "done";
  const stillRunning = still && still.status !== "done" && still.status !== "failed" && !stillError;
  const videoRunning = video && video.status !== "done" && video.status !== "failed" && !videoError;
  const ticking = standinRunning || stillRunning || videoRunning;

  useEffect(() => {
    if (!ticking) return undefined;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

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

  async function generateStill() {
    stillPoll.current?.abort();
    const controller = new AbortController();
    stillPoll.current = controller;
    setStillError(null);
    setVideo(null);
    setVideoError(null);
    setStill({ status: "queued" });
    setStillStarted(performance.now());
    try {
      const first = await startGeneration(job.id, stillPrompt.trim(), controller.signal);
      const done = await pollGeneration(first.id, { signal: controller.signal, onGeneration: (next) => { if (!controller.signal.aborted) setStill(next); } });
      if (!controller.signal.aborted) setStill(done);
    } catch (err) {
      if (!err?.aborted) setStillError(err);
    }
  }

  async function renderLtx() {
    videoPoll.current?.abort();
    const controller = new AbortController();
    videoPoll.current = controller;
    setVideoError(null);
    setVideo({ status: "queued" });
    setVideoStarted(performance.now());
    try {
      const first = await startVideo(job.id, { generation_id: still.id, prompt: ltxPrompt.trim() }, controller.signal);
      const done = await pollVideo(first.id, { signal: controller.signal, onVideo: (next) => { if (!controller.signal.aborted) setVideo(next); } });
      if (!controller.signal.aborted) setVideo(done);
    } catch (err) {
      if (!err?.aborted) setVideoError(err);
    }
  }

  const stillSeconds = stillStarted == null ? 0 : Math.round((now - stillStarted) / 1000);
  const videoSeconds = videoStarted == null ? 0 : Math.round((now - videoStarted) / 1000);
  const plateReady = job?.status === "done" && !error;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-bg p-4" role="region" aria-label="Stand-in render">
      <div className="flex flex-none items-center gap-2">
        <h2 className="text-base font-semibold">Render</h2>
        <span className="text-xs text-faint">Hard comp, then the still, then the LTX video</span>
        <span className="flex-1" />
        <Btn variant="ghost" icon="x" onClick={onClose}>Close</Btn>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto min-[1100px]:grid-cols-3 min-[1100px]:overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-lg border border-line2 bg-panel p-4" aria-label="Hard comp">
          <div>
            <h3 className="text-sm font-semibold">Hard comp</h3>
            <p className="text-xs text-faint">The stand-in ball composited on the footage</p>
          </div>
          {standinRunning && (
            <div className="flex flex-col items-center gap-2 py-12" role="status">
              <Icon name="loader" size={28} className="spin text-accent" />
              <div className="text-sm font-semibold tnum">{job?.status === "queued" ? "Waiting for the render queue" : "Rendering stand-in"} · {Math.round((now - started) / 1000)}s</div>
              <div className="text-xs text-mute">A new cue takes a few minutes. The same cue again is immediate.</div>
            </div>
          )}
          {error && <Alert error={error}>The stand-in could not be rendered</Alert>}
          {plateReady && (
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
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-lg border border-line2 bg-panel p-4" aria-label="Still frame">
          <div>
            <h3 className="text-sm font-semibold">Still frame</h3>
            <p className="text-xs text-faint">The first effect frame, edited on the image deployment</p>
          </div>
          <textarea aria-label="Still prompt" rows={5} value={stillPrompt} onChange={(event) => setStillPrompt(event.target.value)} placeholder="What the still should look like"
            className="w-full resize-none rounded border border-line bg-field px-2.5 py-2 text-sm text-ink focus:border-accent" />
          <Btn variant="primary" onClick={generateStill} disabled={!plateReady || !stillPrompt.trim() || stillRunning}>Generate</Btn>
          {stillRunning && (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Icon name="loader" size={28} className="spin text-accent" />
              <div className="text-sm font-semibold tnum">{still.status === "queued" ? "Waiting for the image deployment" : "Generating still"} · {stillSeconds}s</div>
            </div>
          )}
          {stillError && <Alert error={stillError}>The still could not be generated</Alert>}
          {still?.status === "failed" && <Alert error={still.error}>The still could not be generated</Alert>}
          {stillUrl && (
            <div className="relative aspect-video w-full overflow-hidden rounded bg-well">
              <img key={stillLoading.attempt} src={stillUrl} alt="Reference still" className="absolute inset-0 h-full w-full object-contain" {...stillLoading.handlers} />
              <MediaLoading status={stillLoading} label="Loading still…" />
            </div>
          )}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-lg border border-line2 bg-panel p-4" aria-label="LTX video">
          <div>
            <h3 className="text-sm font-semibold">LTX</h3>
            <p className="text-xs text-faint">The still, the layout, and a 17-frame prefix on the video deployment</p>
          </div>
          <textarea aria-label="LTX prompt" rows={5} value={ltxPrompt} onChange={(event) => setLtxPrompt(event.target.value)} placeholder="What the video should do"
            className="w-full resize-none rounded border border-line bg-field px-2.5 py-2 text-sm text-ink focus:border-accent" />
          <Btn variant="primary" onClick={renderLtx} disabled={!stillUrl || !ltxPrompt.trim() || videoRunning}>Render LTX</Btn>
          {videoRunning && (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Icon name="loader" size={28} className="spin text-accent" />
              <div className="text-sm font-semibold tnum">{video.status === "queued" ? "Waiting for the video deployment" : "Rendering LTX"} · {videoSeconds}s</div>
              <div className="text-center text-xs text-mute">A full window can take several minutes.</div>
            </div>
          )}
          {videoError && <Alert error={videoError}>The LTX video could not be rendered</Alert>}
          {video?.status === "failed" && <Alert error={video.error}>The LTX video could not be rendered</Alert>}
          {videoUrl && (
            <>
              <div className="relative aspect-video w-full overflow-hidden rounded bg-well">
                <video key={videoLoading.attempt} src={videoUrl} controls autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-contain" {...videoLoading.handlers} />
                <MediaLoading status={videoLoading} />
              </div>
              <a className="inline-flex h-8 w-fit items-center rounded border border-line2 bg-raised px-3 text-sm" href={`${videoUrl}${videoUrl.includes("?") ? "&" : "?"}download=true`}>Download LTX</a>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
