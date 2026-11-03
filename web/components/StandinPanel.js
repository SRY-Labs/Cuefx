"use client";

import { useEffect, useRef, useState } from "react";
import { artifactUrl, jobResult, pollGeneration, pollJob, startGeneration, startJob } from "../lib/api";
import { lookById } from "../lib/cue";
import MediaLoading, { useMediaLoading } from "./MediaLoading";
import { Alert, Btn, Icon } from "./ui";

export default function StandinPanel({ clip, cue, onClose }) {
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [prompt, setPrompt] = useState(() => cue.prompt || lookById(cue.look).prompt || "");
  const [generation, setGeneration] = useState(null);
  const [genError, setGenError] = useState(null);
  const genFlight = useRef(null);
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
          setError(done.error || { code: "render_failed", message: "The preview render failed." });
          return;
        }
        setResult(await jobResult(done.id));
      })
      .catch((err) => { if (!gone && !err?.aborted) setError(err); });
    return () => { gone = true; controller.abort(); genFlight.current?.abort(); };
  }, [clip.clip_id, cue]);

  const elapsed = Math.round((now - started) / 1000);
  const preview = artifactUrl(job, "hardcomp");
  const download = artifactUrl(job, "hardcomp", true);
  const previewLoading = useMediaLoading(preview);
  const running = !error && job?.status !== "done";
  const generating = generation && generation.status !== "done" && generation.status !== "failed";

  useEffect(() => {
    if (!running && !generating) return undefined;
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, [running, generating]);

  async function generate() {
    if (!job?.id || job.status !== "done" || !prompt.trim()) return;
    genFlight.current?.abort();
    const controller = new AbortController();
    genFlight.current = controller;
    setGenError(null);
    setGeneration({ status: "queued", startedAt: performance.now() });
    try {
      const first = await startGeneration(job.id, prompt.trim(), controller.signal);
      const startedAt = performance.now();
      const done = await pollGeneration(first.id, { signal: controller.signal, onUpdate: (doc) => setGeneration({ ...doc, startedAt }) });
      if (done.status === "failed") setGenError(done.error || { code: "generation_failed", message: "ComfyUI did not return a frame." });
    } catch (err) {
      if (!err?.aborted) { setGenError(err); setGeneration(null); }
    }
  }

  const genSeconds = generation?.startedAt ? Math.round((now - generation.startedAt) / 1000) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-start gap-6 overflow-y-auto overflow-x-hidden bg-bg p-4 sm:p-6 min-[900px]:flex-row" role="region" aria-label="Preview render">
      <div className="flex h-fit w-full min-w-0 max-w-[980px] flex-1 flex-col gap-3 rounded-[14px] border border-line bg-panel p-5 min-[900px]:flex-[0_1_980px]">
        <div className="flex items-center gap-2">
          <h2 className="t-h3">Preview on your footage</h2>
          <span className="flex-1" />
          <Btn variant="ghost" icon="sliders" onClick={onClose}>Back to directing</Btn>
        </div>
        {running && (
          <div className="flex flex-col items-center gap-2 py-12" role="status">
            <Icon name="loader" size={28} className="spin text-accent" />
            <div className="t-h3 tnum">{job?.status === "queued" ? "Waiting for the render queue" : "Rendering your preview"} · {elapsed} s</div>
            <div className="text-sm text-mute">A new shot usually takes 20 to 60 seconds. One render runs at a time.</div>
          </div>
        )}
        {error && <Alert error={error} action={<Btn variant="primary" onClick={onClose}>Back to directing</Btn>}>The preview could not be rendered</Alert>}
        {job?.status === "done" && !error && (
          <>
            {preview && (
              <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-well">
                <video key={previewLoading.attempt} src={preview} controls autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-contain" {...previewLoading.handlers} />
                <MediaLoading status={previewLoading} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-mute tnum">
                This is the guide pass: the effect drawn in code where you directed it.
                {result?.timings_s?.total ? ` Rendered in ${Math.round(result.timings_s.total)} s.` : ""}
                {result?.cached ? " Reused from an earlier render." : ""}
              </p>
              {download && <a href={download} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line2 bg-panel px-3 text-sm font-medium hover:bg-raised"><Icon name="download" size={14} />Download</a>}
            </div>
          </>
        )}
      </div>
      <aside className="h-fit w-full flex-none overflow-hidden rounded-[14px] border border-line bg-panel min-[900px]:w-[360px]" aria-labelledby="standin-prompt-title">
        <div className="flex flex-col gap-1 border-b border-line px-5 py-4">
          <h2 id="standin-prompt-title" className="t-h3">Style it with ComfyUI</h2>
          <p className="text-sm text-mute">CueFX sends a frame of your preview and this prompt to ComfyUI and returns the styled frame LTX-2.5 animates from.</p>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="standin-prompt">
            Prompt
            <textarea id="standin-prompt" rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)}
              placeholder="The effect, its material and colours. What happens over time, camera stays fixed."
              className="w-full resize-none rounded-[10px] border border-line bg-field px-3 py-2 text-sm font-normal text-ink focus:border-accent" />
          </label>
          <Btn variant="primary" icon="orb" className="w-full justify-center" disabled={job?.status !== "done" || !!error || !prompt.trim() || generating} onClick={generate}>
            {generating ? `Styling · ${genSeconds} s` : generation?.status === "done" ? "Style again" : "Style this shot"}
          </Btn>
          {job?.status !== "done" && !error && <p className="text-xs text-faint">Available once the preview has rendered.</p>}
          {genError && <Alert error={genError}>ComfyUI did not return a frame</Alert>}
          {generation?.status === "done" && generation.reference && (
            <figure className="flex flex-col gap-2">
              <img src={generation.reference} alt="The styled frame returned by ComfyUI" className="w-full rounded-[10px] bg-well" />
              <figcaption className="flex items-center justify-between text-xs text-mute">
                <span>Styled frame from ComfyUI</span>
                <a href={generation.reference} download="cuefx-styled-frame.png" className="font-medium text-accent hover:underline">Download</a>
              </figcaption>
            </figure>
          )}
        </div>
      </aside>
    </div>
  );
}
