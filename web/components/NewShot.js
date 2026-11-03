"use client";

import { useEffect, useRef, useState } from "react";
import { clipUploadIssue, createCue, listClips, uploadClip } from "../lib/api";
import { clipLine, partOf, pointAt, timecode } from "../lib/cue";
import { SAMPLE_CLIP } from "../lib/presets";
import FlowSteps from "./FlowSteps";
import Plate from "./Plate";
import { Alert, Btn, Icon, Seg } from "./ui";

const PARTS = [["palm", "Palm"], ["fist", "Fist"], ["foot", "Foot"], ["knee", "Knee"], ["shoulder", "Shoulder"], ["head", "Head"]];

function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function trackTitle(error, part) {
  if (error?.code === "no_hand" || error?.code === "no_track" || error?.code === "track_lost") return `CueFX could not find a ${part} in this clip`;
  return "Tracking stopped";
}

function trackHelp(error, part) {
  if (error?.code === "no_hand" || error?.code === "no_track" || error?.code === "track_lost") {
    return `Check that one person is in frame and the ${part} is visible for most of the clip. Try another body point, or click the person in the picture to point CueFX at them.`;
  }
  return error?.message;
}

function uploadTitle(error) {
  if (error?.code === "clip_too_long") return "This clip is too long";
  if (error?.status === 413) return "This file is too large";
  if (error?.code === "clip_unreadable") return "CueFX could not read this clip";
  if (error?.code === "server_lost") return "The upload did not finish";
  return "That clip cannot be used";
}

export default function NewShot({ initialClip, preset, sample, track: chosen, onBack, onReady }) {
  const [stage, setStage] = useState(initialClip ? "pick" : "empty");
  const [clip, setClip] = useState(initialClip);
  const [clips, setClips] = useState([]);
  const [frame, setFrame] = useState(initialClip ? Math.min(60, initialClip.frames - 1) : 0);
  const [hand, setHand] = useState(chosen?.side || (sample ? SAMPLE_CLIP.side : "right"));
  const [part, setPart] = useState(chosen?.part || (sample ? SAMPLE_CLIP.part : "fist"));
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setClockTick] = useState(0);
  const fileInput = useRef(null);
  const trackError = useRef(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  const sampleStarted = useRef(false);
  useEffect(() => {
    if (!sample || initialClip || sampleStarted.current) return;
    sampleStarted.current = true;
    loadSample();
  }, [sample, initialClip]);

  async function loadSample() {
    setError(null);
    setStage("uploading");
    setUpload({ phase: "check", name: SAMPLE_CLIP.name });
    try {
      const blob = await fetch(SAMPLE_CLIP.url).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      });
      await onFile(new File([blob], SAMPLE_CLIP.name, { type: "video/mp4" }), { autoTrack: { part, side: hand } });
    } catch {
      setError({ code: "sample_unavailable", message: "The sample clip did not load. Upload your own clip, or try again." });
      setStage("empty");
    }
  }

  useEffect(() => {
    if (stage !== "uploading" || upload?.phase !== "prepare") return undefined;
    const timer = setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [stage, upload?.phase]);

  useEffect(() => {
    if (error && stage === "pick") trackError.current?.scrollIntoView({ block: "nearest" });
  }, [error, stage]);

  useEffect(() => {
    function onKey(event) {
      if (!clip || event.target.closest("input, textarea, select")) return;
      if (event.key === "ArrowLeft") setFrame((value) => Math.max(0, value - (event.shiftKey ? 10 : 1)));
      if (event.key === "ArrowRight") setFrame((value) => Math.min(clip.frames - 1, value + (event.shiftKey ? 10 : 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip]);

  async function onFile(file, { autoTrack = false } = {}) {
    setError(null);
    setStage("uploading");
    setUpload({ phase: "check", name: file.name });
    const issue = await clipUploadIssue(file);
    if (issue) {
      setError(issue);
      setStage("empty");
      return;
    }
    setUpload({ phase: "upload", pct: 0, name: file.name, started: Date.now() });
    try {
      const next = await uploadClip(file, (progress) => {
        setUpload((prev) => ({
          ...prev,
          ...progress,
          name: file.name,
          started: progress.phase === "prepare" && prev?.phase !== "prepare" ? Date.now() : prev?.started,
        }));
      });
      setClip(next);
      setFrame(Math.min(60, next.frames - 1));
      setCreated(null);
      setStage("pick");
      if (autoTrack) runTrack(next, null, autoTrack);
    } catch (err) {
      setError(err);
      setStage("empty");
    }
  }

  function startTrack(point) {
    if (stage !== "pick" || busy) return;
    runTrack(clip, point, { part, side: hand });
  }

  async function runTrack(target, point, { part: which, side }) {
    setBusy(true);
    setError(null);
    setStage("analysing");
    const body = { hand: side };
    if (which === "head") body.body_point = { part: "head", side: null };
    else if (which !== "palm") body.body_point = { part: which, side };
    if (point) body.hand_seed = { frame, x: Math.round(point.x), y: Math.round(point.y) };
    try {
      const result = await createCue(target.clip_id, body);
      setCreated(result);
      setStage("result");
    } catch (err) {
      setError(err);
      setStage("pick");
    } finally {
      setBusy(false);
    }
  }

  const track = created?.cue?.track;
  const here = pointAt(track, frame);

  return (
    <main className="flex h-full flex-col">
      <header className="flex min-h-12 flex-none flex-wrap items-center gap-3 border-b border-line px-4 py-1.5">
        <Btn variant="ghost" icon="home" onClick={onBack}>Home</Btn>
        <h1 className="min-w-0 truncate text-base font-semibold">{clip ? clip.filename : "New shot"}</h1>
        {preset && <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">{preset.name}</span>}
        <span className="flex-1" />
        <FlowSteps current={stage === "empty" || stage === "uploading" ? "upload" : "track"} />
      </header>
      {stage === "empty" || stage === "uploading" ? (
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-6 py-10">
          {error && <Alert error={error}>{uploadTitle(error)}</Alert>}
          {stage === "uploading" ? (
            <div className="rounded-[14px] border border-line bg-panel p-5" role="status">
              <div className="text-sm font-semibold">{upload.name}</div>
              {upload.phase === "check" && upload.name === SAMPLE_CLIP.name ? (
                <p className="mt-2 text-xs text-mute">Loading the sample clip…</p>
              ) : upload.phase === "prepare" ? (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded bg-field"><div className="bar-processing h-full w-full" /></div>
                  <p className="mt-2 text-sm text-ink tnum">Preparing the plate · {clock(Date.now() - upload.started)}</p>
                  <p className="mt-1 text-xs text-mute">The file is in. CueFX is preparing a 24 fps copy to track. This usually takes 10 to 20 seconds. Tracking starts next.</p>
                </>
              ) : upload.phase === "check" ? (
                <p className="mt-2 text-xs text-mute">Checking length and size…</p>
              ) : (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded bg-field"><div className="h-full bg-accent" style={{ width: `${upload.pct ?? 0}%` }} /></div>
                  <p className="mt-1 text-xs text-mute tnum">{upload.pct == null ? "Uploading…" : `Uploading · ${upload.pct}%`}</p>
                </>
              )}
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-2 border-dashed border-line2 bg-panel px-8 py-14 text-center hover:bg-raised">
              <Icon name="upload" size={22} className="text-accent" />
              <span className="t-h3">Drop a clip, or choose a file</span>
              <span className="text-sm text-mute">One person in frame works best · mp4, mov, mkv or webm · up to 15 seconds</span>
              <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.mkv,.webm" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
            </label>
          )}
          {stage !== "uploading" && (
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-[14px] border border-line bg-panel px-4 py-3">
              <span className="text-sm text-mute">No footage to hand?</span>
              <Btn variant="primary" icon="play" onClick={loadSample}>Use the sample clip</Btn>
            </div>
          )}
          {clips.length > 0 && stage !== "uploading" && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-faint">
              <span>Or reuse a recent clip</span>
              {clips.map((item) => (
                <Btn key={item.clip_id} variant="ghost" onClick={() => { setClip(item); setFrame(Math.min(60, item.frames - 1)); setCreated(null); setStage("pick"); }}>
                  Use {item.filename}
                </Btn>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="flex min-h-[320px] min-w-0 flex-1 flex-col gap-3 p-4">
            <Plate clip={clip} frame={frame} playing={false} onClick={stage === "pick" ? startTrack : null} cursor={stage === "pick" ? "crosshair" : "default"}>
              {track && <polyline points={track.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="rgb(var(--c-track))" strokeWidth="2" opacity="0.7" />}
              {here && <circle cx={here.x} cy={here.y} r="14" fill="rgb(var(--c-track) / 0.25)" stroke="rgb(var(--c-track))" strokeWidth="3" />}
            </Plate>
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={() => setFrame((value) => Math.max(0, value - 1))} disabled={busy}>←</Btn>
              <input type="range" className="flex-1" min={0} max={clip.frames - 1} value={frame} disabled={busy} onChange={(event) => setFrame(Number(event.target.value))} />
              <Btn variant="ghost" onClick={() => setFrame((value) => Math.min(clip.frames - 1, value + 1))} disabled={busy}>→</Btn>
              <span className="text-xs text-mute tnum">{frame} / {clip.frames - 1} · {timecode(frame, clip.fps)}</span>
            </div>
          </div>
          <aside className="flex w-full flex-none flex-col gap-4 border-t border-line bg-panel p-4 lg:w-[328px] lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">Clip</div>
              <div className="text-sm font-semibold">{clip.filename}</div>
              <div className="mt-1 text-xs text-faint tnum">{clipLine(clip)}</div>
            </div>
            {stage !== "result" && (
              <>
                <div>
                  <div className="mb-1.5 text-xs text-mute">Attached to</div>
                  <Seg label="Body point" value={part} options={PARTS} columns={3} onChange={setPart} />
                </div>
                {part !== "head" && (
                  <div>
                    <div className="mb-1.5 text-xs text-mute">Side</div>
                    <Seg label="Side" value={hand} options={[["right", "Right"], ["left", "Left"]]} onChange={setHand} />
                  </div>
                )}
                <Btn variant="primary" disabled={busy} onClick={() => startTrack(null)}>Track the {part}</Btn>
                <p className="text-sm text-mute">CueFX finds the {part} on its own. If there is more than one person, click the one you mean in the picture.</p>
                {stage === "analysing" && (
                  <div className="rounded-md border border-line bg-field px-3 py-2" role="status">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="loader" className="spin" /> Tracking the {part}</div>
                    <p className="mt-1 text-xs text-mute">Reading every frame. This usually takes 15 to 30 seconds.</p>
                  </div>
                )}
              </>
            )}
            {created && (
              <>
                <div className="rounded-[10px] bg-accent/10 px-3 py-2.5">
                  <div className="t-h3 tnum">{Math.round((created.summary.tracked / Math.max(1, created.summary.total)) * 100)}% of frames tracked</div>
                  <p className="mt-0.5 text-sm text-mute tnum">
                    {created.summary.tracked} of {created.summary.total} frames
                    {created.summary.uncertain_ranges?.length ? `, ${created.summary.uncertain_ranges.length} short gaps CueFX fills in` : ""}. Scrub the clip to check the dot stays on the {partOf(created.cue)}.
                  </p>
                </div>
                {created.warnings?.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs text-mute">
                    {created.warnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}
                  </ul>
                )}
                <Btn variant="primary" icon="chevRight" onClick={() => onReady(clip, created)}>Continue to directing</Btn>
                <Btn variant="ghost" onClick={() => { setCreated(null); setStage("pick"); }}>Track a different point</Btn>
              </>
            )}
            <Btn variant="ghost" onClick={() => { setStage("empty"); setCreated(null); setError(null); }}>Replace clip</Btn>
            {error && stage === "pick" && <div ref={trackError}><Alert error={{ ...error, message: trackHelp(error, part) }} icon="alert">{trackTitle(error, part)}</Alert></div>}
          </aside>
        </div>
      )}
    </main>
  );
}
