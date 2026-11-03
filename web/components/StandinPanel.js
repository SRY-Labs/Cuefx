"use client";

import { useEffect, useRef, useState } from "react";
import { artifactUrl, jobResult, pollGeneration, pollJob, pollVideo, startGeneration, startJob, startVideo } from "../lib/api";
import { lookById } from "../lib/cue";
import MediaLoading, { useMediaLoading } from "./MediaLoading";
import { Alert, Btn, Icon } from "./ui";

const LTX_PROMPT = "One luminous energy orb in the original room with the person visible, matching the supplied look image and following the guide video's orb position, scale, and motion. Preserve the original scene. In reversed time the orb contracts and dims toward clean source frames.";

const promptField = "w-full resize-none rounded-[10px] border border-line bg-field px-3 py-2 text-sm font-normal text-ink focus:border-accent";

function downloadHref(url) {
  return `${url}${url.includes("?") ? "&" : "?"}download=true`;
}

export default function StandinPanel({ clip, cue, onClose }) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
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
          setError(done.error || { code: "render_failed", message: "The preview render failed." });
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

  const elapsed = Math.round((now - started) / 1000);
  const preview = artifactUrl(job, "hardcomp");
  const download = artifactUrl(job, "hardcomp", true);
  const previewLoading = useMediaLoading(preview);
  const stillUrl = still?.status === "done" ? still.reference : null;
  const stillLoading = useMediaLoading(stillUrl);
  const videoUrl = video?.status === "done" ? video.video : null;
  const videoLoading = useMediaLoading(videoUrl);
  const standinRunning = !error && job?.status !== "done";
  const stillRunning = still && still.status !== "done" && still.status !== "failed" && !stillError;
  const videoRunning = video && video.status !== "done" && video.status !== "failed" && !videoError;
  const ticking = standinRunning || stillRunning || videoRunning;
  const plateReady = job?.status === "done" && !error;

  useEffect(() => {
    if (!ticking) return undefined;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  async function generateStill() {
    if (!job?.id || !plateReady || !stillPrompt.trim() || stillRunning) return;
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
      const done = await pollGeneration(first.id, {
        signal: controller.signal,
        onGeneration: (next) => { if (!controller.signal.aborted) setStill(next); },
      });
      if (!controller.signal.aborted) setStill(done);
    } catch (err) {
      if (!err?.aborted) setStillError(err);
    }
  }

  async function renderLtx() {
    if (!stillUrl || !still?.id || !ltxPrompt.trim() || videoRunning) return;
    videoPoll.current?.abort();
    const controller = new AbortController();
    videoPoll.current = controller;
    setVideoError(null);
    setVideo({ status: "queued" });
    setVideoStarted(performance.now());
    try {
      const first = await startVideo(job.id, { generation_id: still.id, prompt: ltxPrompt.trim() }, controller.signal);
      const done = await pollVideo(first.id, {
        signal: controller.signal,
        onVideo: (next) => { if (!controller.signal.aborted) setVideo(next); },
      });
      if (!controller.signal.aborted) setVideo(done);
    } catch (err) {
      if (!err?.aborted) setVideoError(err);
    }
  }

  const stillSeconds = stillStarted == null ? 0 : Math.round((now - stillStarted) / 1000);
  const videoSeconds = videoStarted == null ? 0 : Math.round((now - videoStarted) / 1000);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-bg p-4 sm:p-6" role="region" aria-label="Render">
      <div className="flex flex-none items-center gap-2">
        <h2 className="t-h3">Render</h2>
        <span className="hidden text-sm text-mute sm:inline">Preview, then the reference frame, then the LTX video</span>
        <span className="flex-1" />
        <Btn variant="ghost" icon="sliders" onClick={onClose}>Back to directing</Btn>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto min-[1100px]:grid-cols-3 min-[1100px]:overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-[14px] border border-line bg-panel p-5" aria-label="Preview">
          <div className="flex flex-col gap-1">
            <h3 className="t-h3">Preview on your footage</h3>
            <p className="text-sm text-mute">The guide pass: the effect drawn in code where you directed it.</p>
          </div>
          {standinRunning && (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Icon name="loader" size={28} className="spin text-accent" />
              <div className="text-center t-h3 tnum">{job?.status === "queued" ? "Waiting for the render queue" : "Rendering your preview"} · {elapsed} s</div>
              <div className="text-center text-sm text-mute">A new shot usually takes 20 to 60 seconds. One render runs at a time.</div>
            </div>
          )}
          {error && <Alert error={error} action={<Btn variant="primary" onClick={onClose}>Back to directing</Btn>}>The preview could not be rendered</Alert>}
          {plateReady && preview && (
            <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-well">
              <video key={previewLoading.attempt} src={preview} controls autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-contain" {...previewLoading.handlers} />
              <MediaLoading status={previewLoading} />
            </div>
          )}
          {plateReady && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-mute tnum">
                {result?.timings_s?.total ? `Rendered in ${Math.round(result.timings_s.total)} s.` : "Preview ready."}
                {result?.cached ? " Reused from an earlier render." : ""}
              </p>
              {download && <a href={download} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line2 bg-panel px-3 text-sm font-medium hover:bg-raised"><Icon name="download" size={14} />Download</a>}
            </div>
          )}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-[14px] border border-line bg-panel p-5" aria-labelledby="reference-title">
          <h3 id="reference-title" className="t-h3">Reference frame</h3>
          {stillRunning && (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Icon name="loader" size={28} className="spin text-accent" />
              <div className="text-center t-h3 tnum">{still.status === "queued" ? "Waiting for the image deployment" : "Generating the reference frame"} · {stillSeconds} s</div>
            </div>
          )}
          {stillError && <Alert error={stillError}>The reference frame could not be generated</Alert>}
          {still?.status === "failed" && <Alert error={still.error}>The reference frame could not be generated</Alert>}
          {stillUrl ? (
            <figure className="flex flex-col gap-2">
              <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-well">
                <img key={stillLoading.attempt} src={stillUrl} alt="Reference frame" className="absolute inset-0 h-full w-full object-contain" {...stillLoading.handlers} />
                <MediaLoading status={stillLoading} label="Loading reference frame…" />
              </div>
              <figcaption className="flex items-center justify-between gap-2 text-xs text-mute">
                <span>From ComfyUI</span>
                <a href={stillUrl} download="cuefx-reference.png" className="font-medium text-accent hover:underline">Download</a>
              </figcaption>
            </figure>
          ) : !stillRunning && (
            <div className="grid aspect-video w-full place-items-center rounded-[10px] bg-well px-4 text-center text-sm text-mute">The styled frame shows here.</div>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="reference-prompt">
            Prompt
            <textarea id="reference-prompt" rows={4} value={stillPrompt} onChange={(event) => setStillPrompt(event.target.value)}
              placeholder="The effect, its material and colours. What happens over time, camera stays fixed."
              className={promptField} />
          </label>
          <Btn variant="primary" icon="orb" className="w-full justify-center" disabled={!plateReady || !stillPrompt.trim() || stillRunning} onClick={generateStill}>
            {stillRunning ? `Styling · ${stillSeconds} s` : stillUrl ? "Style again" : "Style this frame"}
          </Btn>
          {!plateReady && !error && <p className="text-xs text-faint">Available once the preview has rendered.</p>}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-[14px] border border-line bg-panel p-5" aria-labelledby="ltx-title">
          <h3 id="ltx-title" className="t-h3">LTX video</h3>
          {videoRunning && (
            <div className="flex flex-col items-center gap-2 py-8" role="status">
              <Icon name="loader" size={28} className="spin text-accent" />
              <div className="text-center t-h3 tnum">{video.status === "queued" ? "Waiting for the video deployment" : "Rendering LTX"} · {videoSeconds} s</div>
              <div className="text-center text-sm text-mute">A full window can take several minutes.</div>
            </div>
          )}
          {videoError && <Alert error={videoError}>The LTX video could not be rendered</Alert>}
          {video?.status === "failed" && <Alert error={video.error}>The LTX video could not be rendered</Alert>}
          {videoUrl ? (
            <figure className="flex flex-col gap-2">
              <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-well">
                <video key={videoLoading.attempt} src={videoUrl} controls autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-contain" {...videoLoading.handlers} />
                <MediaLoading status={videoLoading} />
              </div>
              <figcaption className="flex items-center justify-between gap-2 text-xs text-mute">
                <span>LTX video</span>
                <a href={downloadHref(videoUrl)} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"><Icon name="download" size={14} />Download</a>
              </figcaption>
            </figure>
          ) : !videoRunning && (
            <div className="grid aspect-video w-full place-items-center rounded-[10px] bg-well px-4 text-center text-sm text-mute">The LTX video shows here.</div>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="ltx-prompt">
            Prompt
            <textarea id="ltx-prompt" rows={4} value={ltxPrompt} onChange={(event) => setLtxPrompt(event.target.value)}
              placeholder="What the video should do"
              className={promptField} />
          </label>
          <Btn variant="primary" icon="play" className="w-full justify-center" disabled={!stillUrl || !ltxPrompt.trim() || videoRunning} onClick={renderLtx}>
            {videoRunning ? `Rendering · ${videoSeconds} s` : videoUrl ? "Render again" : "Render LTX"}
          </Btn>
          {!stillUrl && <p className="text-xs text-faint">Available once the reference frame is ready.</p>}
        </section>
      </div>
    </div>
  );
}
