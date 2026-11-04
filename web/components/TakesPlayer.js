"use client";

import { useEffect, useRef, useState } from "react";
import { frameUrl } from "../lib/api";
import { lookById } from "../lib/cue";
import { STAGES, stagesOf, takeDownloads, takeMedia } from "../lib/takes";
import MediaLoading, { useMediaLoading } from "./MediaLoading";
import { Btn, Icon, Tip, cx } from "./ui";

const FPS = 24;
const SPEEDS = [0.25, 0.5, 1];

function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function stamp(seconds) {
  const s = Math.max(0, seconds || 0);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
}

export function stageLine(take, now) {
  const stages = stagesOf(take);
  if (take.status === "failed") return `${STAGES.find((stage) => stage.id === take.failedStage)?.name || "Render"} failed`;
  if (take.status === "done") return `${take.kind === "guide" ? "Guide pass" : lookById(take.settings.look).name} · ${clock((take.finished || now) - take.started)}`;
  const at = stages.findIndex((stage) => stage.id === take.stage);
  return `${stages[Math.max(0, at)]?.name || "Starting"} · ${clock(now - take.stageStarted)}`;
}

export function takeProgress(take, now) {
  if (take.status === "done") return 100;
  const stages = stagesOf(take);
  const at = Math.max(0, stages.findIndex((stage) => stage.id === take.stage));
  return Math.min(100, ((at + Math.min(0.95, (now - take.stageStarted) / 1000 / (stages[at]?.typical || 60))) / stages.length) * 100);
}

export function TakeThumb({ take, clip }) {
  const media = takeMedia(take);
  if (take.generation?.status === "done" && take.generation.reference) return <img src={take.generation.reference} alt="" className="h-full w-full object-cover" />;
  if (media?.kind === "video") return <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  if (clip && take.settings.cue.effect_range) return <img src={frameUrl(clip.clip_id, take.settings.cue.effect_range.start)} alt="" className="h-full w-full object-cover opacity-50" />;
  return null;
}

function PlayerBtn({ icon, label, kbd, active, disabled, onClick, children }) {
  return (
    <Tip title={label} kbd={kbd}>
      <button type="button" aria-label={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled} onClick={onClick}
        className={cx("inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-[8px] px-1.5 text-xs font-medium disabled:opacity-35",
          active ? "bg-sel text-ink" : "text-mute hover:bg-raised hover:text-ink")}>
        {icon && <Icon name={icon} size={15} />}{children}
      </button>
    </Tip>
  );
}

/**
 * Takes play on their own, like a prototype preview: takes listed on the left, the result large in the middle, and
 * a transport under it with frame steps, a scrubber, loop, speed and a side-by-side compare. Editing stays behind it.
 */
export default function TakesPlayer({ takes, current, clip, now, onPick, onClose, onRetry, onUse }) {
  const media = takeMedia(current);
  const loading = useMediaLoading(media?.url || null);
  const downloads = takeDownloads(current);
  const stages = stagesOf(current);
  const range = current.settings.cue.effect_range;
  const index = takes.findIndex((take) => take.id === current.id);
  const others = takes.filter((take) => take.id !== current.id && takeMedia(take)?.kind === "video");
  const [compareId, setCompareId] = useState(null);
  const compare = compareId ? takes.find((take) => take.id === compareId) : null;
  const compareMedia = compare ? takeMedia(compare) : null;
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const main = useRef(null);
  const side = useRef(null);
  const stage = useRef(null);
  const panel = useRef(null);
  const isVideo = media?.kind === "video";

  useEffect(() => { panel.current?.focus(); }, []);
  useEffect(() => { setTime(0); setDuration(0); setPlaying(true); }, [media?.url]);
  useEffect(() => { if (compareId && !takes.some((take) => take.id === compareId && take.id !== current.id)) setCompareId(null); }, [current.id, compareId, takes]);

  // The main video drives the clock; the compared one follows it.
  useEffect(() => {
    if (!isVideo) return undefined;
    let raf = 0;
    const tick = () => {
      const node = main.current;
      if (node) {
        setTime(node.currentTime);
        const other = side.current;
        if (other && Math.abs(other.currentTime - node.currentTime) > 0.06) other.currentTime = Math.min(node.currentTime, other.duration || node.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, media?.url, compareMedia?.url]);

  useEffect(() => {
    for (const node of [main.current, side.current]) {
      if (!node) continue;
      node.playbackRate = speed;
      node.loop = loop;
      if (playing) node.play().catch(() => {}); else node.pause();
    }
  }, [playing, speed, loop, media?.url, compareMedia?.url]);

  function seek(seconds) {
    const node = main.current;
    if (!node) return;
    const to = Math.max(0, Math.min(seconds, (node.duration || seconds) - 0.001));
    node.currentTime = to;
    if (side.current) side.current.currentTime = Math.min(to, side.current.duration || to);
    setTime(to);
  }
  function step(frames) { setPlaying(false); seek((main.current?.currentTime || 0) + frames / FPS); }
  function fullscreen() {
    const node = stage.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else node.requestFullscreen?.().catch(() => {});
  }

  useEffect(() => {
    function onKey(event) {
      if (event.target.closest?.("input, textarea, select")) return;
      if (event.target.closest?.("button") && (event.key === " " || event.key === "Enter")) return;
      const key = event.key.toLowerCase();
      if (event.key === "Escape" && !document.fullscreenElement) { event.preventDefault(); onClose(); return; }
      if (event.key === " ") { event.preventDefault(); setPlaying((value) => !value); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); step(event.shiftKey ? -10 : -1); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); step(event.shiftKey ? 10 : 1); return; }
      if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); onPick(takes[index - 1].id); return; }
      if (event.key === "ArrowDown" && index < takes.length - 1) { event.preventDefault(); onPick(takes[index + 1].id); return; }
      if (key === "l") setLoop((value) => !value);
      if (key === "f") fullscreen();
      if (key === "c" && others.length) setCompareId((value) => (value ? null : others[others.length - 1].id));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const frame = Math.round(time * FPS);
  const frames = Math.max(1, Math.round(duration * FPS));

  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Take ${current.n}`} className="fixed inset-0 z-[120] flex flex-col bg-bg text-ink outline-none">
      <header className="grid h-12 flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line bg-panel px-3">
        <div className="flex items-center"><Btn variant="ghost" onClick={onClose}><Icon name="chevRight" size={14} className="rotate-180" />Back to editing</Btn></div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold tnum">Take {current.n}</span>
          <span className="rounded-[6px] bg-raised px-1.5 py-0.5 text-[11px] text-mute tnum">{index + 1} of {takes.length}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Btn onClick={() => onUse(current)}>Use these settings</Btn>
          {downloads.length > 0 && (
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-[8px] bg-accent px-3 text-[13px] font-medium text-on-accent hover:bg-accent-hi"><Icon name="download" size={14} />Download</summary>
              <div className="absolute right-0 top-[calc(100%+6px)] z-20 flex w-52 flex-col rounded-[10px] border border-line2 bg-raised p-1 shadow-lg">
                {downloads.map((item) => (
                  <a key={item.id} href={item.href} download={item.download || true} className="rounded-[6px] px-2.5 py-1.5 text-xs text-ink hover:bg-sel">{item.label}</a>
                ))}
              </div>
            </details>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside aria-label="Takes" className="hidden w-[220px] flex-none flex-col gap-1 overflow-y-auto border-r border-line bg-panel p-2 md:flex">
          <span className="px-2 pb-1 pt-1.5 text-xs font-semibold text-ink">Takes</span>
          {takes.map((take) => {
            const on = take.id === current.id;
            return (
              <button key={take.id} type="button" aria-current={on} onClick={() => onPick(take.id)}
                className={cx("flex items-center gap-2.5 rounded-[8px] p-1.5 text-left", on ? "bg-sel" : "hover:bg-raised")}>
                <span className="relative block h-9 w-16 flex-none overflow-hidden rounded-[5px] bg-well">
                  <TakeThumb take={take} clip={clip} />
                  {take.status === "running" && <span className="absolute bottom-0 left-0 h-[2px] bg-accent" style={{ width: `${takeProgress(take, now)}%` }} />}
                </span>
                <span className="flex min-w-0 flex-col text-xs leading-4">
                  <span className="font-medium text-ink">{take.kind === "guide" ? `Take ${take.n} · guide` : `Take ${take.n}`}</span>
                  <span className={cx("truncate tnum", take.status === "failed" ? "text-err" : take.status === "running" ? "text-accent" : "text-faint")}>{stageLine(take, now)}</span>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-3 overflow-hidden p-4">
          <div className="flex h-8 w-full max-w-[1280px] flex-none items-center gap-2 rounded-[8px] bg-panel px-3 text-xs text-mute">
            <Icon name="play" size={12} className="text-faint" />
            <span className="text-ink">{lookById(current.settings.look).name}</span>
            <span className="tnum">seed {current.settings.cue.seed ?? 42}{range ? ` · frames ${range.start}–${range.end - 1}` : ""}{media?.guide ? " · guide pass" : ""}</span>
            <span className="flex-1" />
            {compare && <span className="tnum">Comparing with take {compare.n}</span>}
          </div>
          <div ref={stage} className={cx("relative grid min-h-0 w-full max-w-[1280px] flex-1 place-items-center gap-2 bg-bg", compare ? "grid-cols-2" : "grid-cols-1")}>
            <div className="relative aspect-video max-h-full w-full overflow-hidden rounded-[10px] bg-black">
              {isVideo && <video ref={main} key={`${media.url}-${loading.attempt}`} src={media.url} autoPlay muted playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain"
                onClick={() => setPlaying((value) => !value)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                onEnded={() => { if (!loop) setPlaying(false); }} {...loading.handlers} />}
              {media?.kind === "image" && <img key={`${media.url}-${loading.attempt}`} src={media.url} alt={`Styled frame of take ${current.n}`} className="absolute inset-0 h-full w-full object-contain" {...loading.handlers} />}
              {media && <MediaLoading status={loading} />}
              {compare && <span className="absolute left-2 top-2 rounded-[6px] bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">Take {current.n}</span>}
              {!media && current.status === "running" && <div className="absolute inset-0 grid place-items-center text-sm text-mute">The first result shows here as soon as it is ready.</div>}
              {current.status !== "done" && (
                <div className="absolute bottom-4 left-1/2 z-10 flex w-[min(360px,90%)] -translate-x-1/2 flex-col gap-2 rounded-[12px] border border-line2 bg-panel/95 p-3.5 shadow-lg" role="status">
                  {stages.map((item, i) => {
                    const at = stages.findIndex((s) => s.id === (current.status === "failed" ? current.failedStage : current.stage));
                    const state = current.status === "failed" && i === at ? "failed" : i < at ? "done" : i === at ? "run" : "next";
                    return (
                      <div key={item.id} className="flex items-center gap-2.5 text-xs">
                        <span className={cx("grid h-5 w-5 flex-none place-items-center rounded-full", state === "done" && "bg-accent/20 text-accent", state === "run" && "border-2 border-accent", state === "failed" && "bg-err/20 text-err", state === "next" && "border border-line2")}>
                          {state === "done" && <Icon name="check" size={11} />}{state === "failed" && <Icon name="x" size={11} />}
                        </span>
                        <span className={cx("flex-1", state === "next" ? "text-mute" : "font-medium text-ink")}>{item.name}</span>
                        <span className="text-faint tnum">{state === "run" ? `${clock(now - current.stageStarted)} · usually ~${item.typical} s` : state === "next" ? `~${item.typical} s` : ""}</span>
                      </div>
                    );
                  })}
                  {current.status === "failed" && (
                    <div className="mt-1 flex flex-col gap-2 border-t border-line2 pt-2">
                      <span className="text-xs text-mute">{current.error?.message || "This stage stopped."}</span>
                      <Btn size="sm" variant="primary" icon="retry" className="self-start" onClick={() => onRetry(current)}>Retry from here</Btn>
                    </div>
                  )}
                </div>
              )}
            </div>
            {compare && compareMedia && (
              <div className="relative aspect-video max-h-full w-full overflow-hidden rounded-[10px] bg-black">
                <video ref={side} key={compareMedia.url} src={compareMedia.url} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-contain" />
                <span className="absolute left-2 top-2 rounded-[6px] bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">Take {compare.n}</span>
              </div>
            )}
          </div>

          <div className="flex w-full max-w-[1280px] flex-none flex-col gap-1.5 rounded-[12px] border border-line bg-panel px-2.5 py-2" aria-label="Playback">
            <input type="range" aria-label="Scrub" className="cue-range w-full" min={0} max={duration || 1} step={1 / FPS} value={Math.min(time, duration || 1)} disabled={!isVideo}
              style={{ "--fill": `${duration ? (time / duration) * 100 : 0}%`, "--fill-c": "rgb(var(--c-accent))" }} onChange={(event) => { setPlaying(false); seek(Number(event.target.value)); }} />
            <div className="flex items-center gap-0.5">
              <PlayerBtn icon="stepBack" label="Previous frame" kbd="←" disabled={!isVideo} onClick={() => step(-1)} />
              <PlayerBtn icon={playing ? "pause" : "play"} label={playing ? "Pause" : "Play"} kbd="Space" disabled={!isVideo} onClick={() => setPlaying((value) => !value)} />
              <PlayerBtn icon="stepFwd" label="Next frame" kbd="→" disabled={!isVideo} onClick={() => step(1)} />
              <span className="ml-2 text-xs text-ink tnum">{stamp(time)}<span className="text-faint"> / {stamp(duration)} · f {frame} of {frames}</span></span>
              <span className="flex-1" />
              <PlayerBtn icon="loop" label="Loop" kbd="L" active={loop} disabled={!isVideo} onClick={() => setLoop((value) => !value)} />
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-line2" />
              {SPEEDS.map((value) => (
                <PlayerBtn key={value} label={`Speed ${value}×`} active={speed === value} disabled={!isVideo} onClick={() => setSpeed(value)}>{value}×</PlayerBtn>
              ))}
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-line2" />
              {others.length > 0 ? (
                <label className="flex items-center gap-1.5 text-xs text-mute">
                  <Icon name="compare" size={14} />
                  <select aria-label="Compare with" value={compareId || ""} onChange={(event) => setCompareId(event.target.value || null)} disabled={!isVideo}
                    className="h-8 rounded-[8px] border border-line2 bg-raised px-2 text-xs text-ink">
                    <option value="">Compare off</option>
                    {others.map((take) => <option key={take.id} value={take.id}>With take {take.n}</option>)}
                  </select>
                </label>
              ) : (
                <Tip title="Compare" note="Render another take to compare two side by side."><span className="inline-flex h-8 items-center gap-1.5 px-1.5 text-xs text-faint"><Icon name="compare" size={14} />Compare</span></Tip>
              )}
              <PlayerBtn icon="expand" label="Full screen" kbd="F" disabled={!media} onClick={fullscreen} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
