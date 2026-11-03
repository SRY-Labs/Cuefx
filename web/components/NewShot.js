"use client";

import { useEffect, useRef, useState } from "react";
import { clipUploadIssue, createCue, listClips, uploadClip } from "../lib/api";
import { clipLine, pointAt, timecode } from "../lib/cue";
import Plate from "./Plate";
import { Alert, Btn, Icon, Seg } from "./ui";

const PARTS = [["palm", "Palm"], ["fist", "Fist"], ["foot", "Foot"], ["knee", "Knee"], ["shoulder", "Shoulder"], ["head", "Head"]];

function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function uploadTitle(error) {
  if (error?.code === "clip_too_long") return "This clip is too long";
  if (error?.status === 413) return "This file is too large";
  if (error?.code === "clip_unreadable") return "CueFX could not read this clip";
  if (error?.code === "server_lost") return "The upload did not finish";
  return "That clip cannot be used";
}

export default function NewShot({ initialClip, onBack, onReady }) {
  const [stage, setStage] = useState(initialClip ? "pick" : "empty");
  const [clip, setClip] = useState(initialClip);
  const [clips, setClips] = useState([]);
  const [frame, setFrame] = useState(initialClip ? Math.min(60, initialClip.frames - 1) : 0);
  const [hand, setHand] = useState("right");
  const [part, setPart] = useState("palm");
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, setClockTick] = useState(0);
  const fileInput = useRef(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  useEffect(() => {
    if (stage !== "uploading" || upload?.phase !== "prepare") return undefined;
    const timer = setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [stage, upload?.phase]);

  useEffect(() => {
    function onKey(event) {
      if (!clip || event.target.closest("input, textarea, select")) return;
      if (event.key === "ArrowLeft") setFrame((value) => Math.max(0, value - (event.shiftKey ? 10 : 1)));
      if (event.key === "ArrowRight") setFrame((value) => Math.min(clip.frames - 1, value + (event.shiftKey ? 10 : 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip]);

  async function onFile(file) {
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
    } catch (err) {
      setError(err);
      setStage("empty");
    }
  }

  async function startTrack(point) {
    if (stage !== "pick" || busy) return;
    setBusy(true);
    setError(null);
    setStage("analysing");
    const body = { hand };
    if (part === "head") body.body_point = { part: "head", side: null };
    else if (part !== "palm") body.body_point = { part, side: hand };
    if (point) body.hand_seed = { frame, x: Math.round(point.x), y: Math.round(point.y) };
    try {
      const result = await createCue(clip.clip_id, body);
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
      <header className="flex h-12 flex-none items-center gap-3 border-b border-line px-4">
        <Btn variant="ghost" onClick={onBack}>Shots</Btn>
        <h1 className="text-base font-semibold">{clip ? clip.filename : "Try it out"}</h1>
      </header>
      {stage === "empty" || stage === "uploading" ? (
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-6 py-10">
          {error && <Alert error={error}>{uploadTitle(error)}</Alert>}
          {stage === "uploading" ? (
            <div className="rounded-lg border border-line bg-panel p-5" role="status">
              <div className="text-sm font-semibold">{upload.name}</div>
              {upload.phase === "prepare" ? (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded bg-field"><div className="bar-processing h-full w-full" /></div>
                  <p className="mt-2 text-sm text-ink tnum">Preparing the plate · {clock(Date.now() - upload.started)}</p>
                  <p className="mt-1 text-xs text-mute">The file is in. CueFX is building the 24 fps plate, which is the slow step. A clip over a minute is refused once it has been measured.</p>
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
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line2 bg-panel px-8 py-14 text-center">
              <Icon name="upload" size={22} className="text-accent" />
              <span className="text-sm font-semibold">Drop a clip, or choose a file</span>
              <span className="text-xs text-mute">mp4, mov, mkv, or webm</span>
              <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.mkv,.webm" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
            </label>
          )}
          {clips.length > 0 && stage !== "uploading" && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
              <span>On the server</span>
              {clips.map((item) => (
                <Btn key={item.clip_id} variant="ghost" onClick={() => { setClip(item); setFrame(Math.min(60, item.frames - 1)); setCreated(null); setStage("pick"); }}>
                  Use {item.filename}
                </Btn>
              ))}
            </div>
          )}
          {stage !== "uploading" && (
            <p className="flex items-start gap-1.5 text-2xs text-faint">
              <Icon name="info" size={12} className="mt-px flex-none" />
              <span>CueFX takes clips up to 60 seconds and 500 MB. Anything past that is refused before the upload.</span>
            </p>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col gap-3 p-4">
            <Plate clip={clip} frame={frame} playing={false} onClick={stage === "pick" ? startTrack : null} cursor={stage === "pick" ? "crosshair" : "default"}>
              {track && <polyline points={track.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="rgb(var(--c-track))" strokeWidth="2" opacity="0.7" />}
              {here && <circle cx={here.x} cy={here.y} r="14" fill="rgb(var(--c-track) / 0.25)" stroke="rgb(var(--c-track))" strokeWidth="3" />}
            </Plate>
            {error && stage === "pick" && <div className="absolute left-1/2 top-8 w-[420px] max-w-[90%] -translate-x-1/2"><Alert error={error}>Tracking stopped</Alert></div>}
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={() => setFrame((value) => Math.max(0, value - 1))} disabled={busy}>←</Btn>
              <input type="range" className="flex-1" min={0} max={clip.frames - 1} value={frame} disabled={busy} onChange={(event) => setFrame(Number(event.target.value))} />
              <Btn variant="ghost" onClick={() => setFrame((value) => Math.min(clip.frames - 1, value + 1))} disabled={busy}>→</Btn>
              <span className="text-xs text-mute tnum">{frame} / {clip.frames - 1} · {timecode(frame, clip.fps)}</span>
            </div>
          </div>
          <aside className="flex w-[320px] flex-none flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-4">
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
                <p className="text-sm text-mute">MediaPipe finds the {part} from the part and side. Click the picture only to point at a different person.</p>
                {stage === "analysing" && (
                  <div className="rounded-md border border-line bg-field px-3 py-2" role="status">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="loader" className="spin" /> Tracking the {part}</div>
                    <p className="mt-1 text-xs text-mute">The first pass reads the whole clip. The same part after that is immediate.</p>
                  </div>
                )}
              </>
            )}
            {created && (
              <>
                <div className="text-sm tnum">
                  Tracked {created.summary.tracked} of {created.summary.total}
                  {created.summary.uncertain_ranges?.length ? ` · ${created.summary.uncertain_ranges.length} uncertain runs` : ""}
                </div>
                {created.warnings?.length > 0 && (
                  <ul className="flex flex-col gap-1 text-xs text-mute">
                    {created.warnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}
                  </ul>
                )}
                <Btn variant="primary" onClick={() => onReady(clip, created)}>Open editor</Btn>
              </>
            )}
            <Btn variant="ghost" onClick={() => { setStage("empty"); setCreated(null); setError(null); }}>Replace clip</Btn>
          </aside>
        </div>
      )}
    </main>
  );
}
