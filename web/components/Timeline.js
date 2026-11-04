"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { holdsOnBody, phaseTimes, timecode, trackRuns } from "../lib/cue";
import { Icon, Tip, cx } from "./ui";

const LANE = { ruler: 22, track: 20, phases: 30, points: 24 };
const PHASE = {
  entrance: { token: "--c-ph-entrance", label: "Entrance", background: "rgb(var(--c-ph-entrance) / 0.22)" },
  held: { token: "--c-ph-held", label: "Held", background: "rgb(var(--c-ph-held) / 0.32)" },
  flight: { token: "--c-ph-flight", label: "Flight", background: "rgb(var(--c-path) / 0.2)" },
  vanish: { token: "--c-occ", label: "Vanish", background: "rgb(var(--c-occ) / 0.26)" },
};
const SNAP_PX = 7;

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function TlButton({ icon, label, kbd, note, active, onClick, disabled, children }) {
  return (
    <Tip title={label} note={note} kbd={kbd} side="top">
      <button type="button" aria-label={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled} onClick={onClick}
        className={cx("inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-[7px] px-1.5 text-xs font-medium disabled:opacity-40",
          active ? "bg-raised text-ink" : "text-mute hover:bg-raised hover:text-ink")}>
        {icon && <Icon name={icon} size={14} />}
        {children}
      </button>
    </Tip>
  );
}

/**
 * The shot's timeline, in frames: the tracked frames, the effect's phases with draggable edges, and the path
 * points as diamonds. `state` is the tracking state; before a cue exists only the ruler and tracking lane draw.
 */
export default function Timeline({
  clip, frames: totalFrames, fps = 24, cue, frame, setFrame, effectRange, selected, onSelect, onBegin, onTiming, onCommit, onPointFrame,
  playing, onPlay, loop, setLoop, state, takeRange,
}) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const fitted = useRef(false);
  const frames = totalFrames || clip?.frames || 1;
  const ppf = Math.max(1, (width / frames) * zoom);
  const total = Math.max(width, Math.ceil(frames * ppf));
  const T = cue ? phaseTimes(cue) : null;
  const hold = cue ? holdsOnBody(cue.behaviour) : false;
  const runs = cue ? trackRuns(cue.track) : [];

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const watch = new ResizeObserver(() => setWidth(node.clientWidth));
    watch.observe(node);
    setWidth(node.clientWidth);
    return () => watch.disconnect();
  }, []);

  function fit() {
    if (!effectRange || !width) { setZoom(1); return; }
    const span = Math.max(24, effectRange.end - effectRange.start);
    setZoom(clamp((frames / span) * 0.7, 1, 12));
  }

  // Fit the effect once, when it is first known; after that the zoom is the artist's.
  useEffect(() => {
    if (fitted.current || !width || !effectRange) return;
    fitted.current = true;
    fit();
  }, [width, effectRange]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !ppf) return;
    const view = node.clientWidth;
    const x = frame * ppf;
    if (x < node.scrollLeft + 40 || x > node.scrollLeft + view - 40) node.scrollLeft = Math.max(0, x - view * 0.3);
  }, [frame, ppf]);

  function rawFrame(event) {
    const rect = contentRef.current.getBoundingClientRect();
    return clamp(Math.round((event.clientX - rect.left) / ppf), 0, frames - 1);
  }

  // Snaps a dragged frame to the playhead or another mark when it lands within a few pixels of one.
  function snapped(value, exclude) {
    if (!snap) return value;
    const marks = [frame];
    if (T) marks.push(T.es, T.appear, T.release, T.vs, T.ve);
    for (const point of cue?.route || []) marks.push(point.f);
    let best = value;
    let gap = SNAP_PX / ppf;
    for (const mark of marks) {
      if (mark == null || mark === exclude) continue;
      const d = Math.abs(mark - value);
      if (d < gap) { gap = d; best = mark; }
    }
    return best;
  }

  function scrub(event) {
    if (event.button !== 0 || event.target.closest("[data-handle]")) return;
    setFrame(rawFrame(event));
    const move = (ev) => setFrame(rawFrame(ev));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragEdge(event, key, at) {
    event.stopPropagation();
    event.preventDefault();
    onBegin?.();
    const move = (ev) => onTiming(key, snapped(rawFrame(ev), at));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function edgeKey(event, key, at) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    onBegin?.();
    onTiming(key, clamp(at + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1), 0, frames));
    onCommit();
  }

  function dragPoint(event, index) {
    event.stopPropagation();
    onSelect(index);
    if (index === 0) return;
    event.preventDefault();
    onBegin?.();
    const from = cue.route[index].f;
    const move = (ev) => {
      const next = onPointFrame(index, snapped(rawFrame(ev), from));
      if (next != null) setFrame(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const edges = T ? [
    ["entranceStart", "Entrance", T.es],
    ["appear", "Appear", T.appear],
    ...(hold ? [] : [["release", "Release", T.release]]),
    ["vanishStart", "Vanish", T.vs],
    ["vanishEnd", "Gone", T.ve],
  ] : [];
  const blocks = T ? [
    ["entrance", T.es, T.appear],
    ["held", T.appear, T.release],
    ...(hold ? [] : [["flight", T.release, T.vs]]),
    ["vanish", T.vs, T.ve],
  ] : [];
  const step = [1, 2, 6, 12, 24, 48, 96].find((value) => value * ppf >= 44) || 120;
  const pct = Math.round(zoom * 100);
  const ready = state === "ready" && cue;

  return (
    <div className="flex flex-none flex-col overflow-hidden rounded-[12px] border border-line bg-panel">
      <div className="flex h-9 flex-none items-center gap-0.5 overflow-x-auto border-b border-line px-1.5">
        <TlButton icon="stepBack" label="Previous frame" kbd="←" onClick={() => setFrame(Math.max(0, frame - 1))} />
        <TlButton icon={playing ? "pause" : "play"} label={playing ? "Pause" : "Play"} kbd="Space" onClick={onPlay} disabled={!clip} />
        <TlButton icon="stepFwd" label="Next frame" kbd="→" onClick={() => setFrame(Math.min(frames - 1, frame + 1))} />
        <span className="ml-2 whitespace-nowrap text-xs text-ink tnum" aria-live="off">{clip ? <>f {frame}<span className="text-faint"> / {frames - 1} · {timecode(frame, fps)}</span></> : <span className="text-faint">No frames yet</span>}</span>
        <span className="flex-1" />
        <TlButton icon="loop" label="Loop the effect" note="Playback repeats the effect's frames." kbd="L" active={loop} onClick={() => setLoop(!loop)} disabled={!ready} />
        <TlButton icon="magnet" label="Snap" note="Edges and points snap to the playhead and to each other." active={snap} onClick={() => setSnap((value) => !value)} />
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line2" />
        <TlButton icon="minus" label="Zoom out" onClick={() => setZoom((value) => clamp(value / 1.4, 1, 16))} disabled={zoom <= 1} />
        <span className="w-10 text-center text-[11px] text-mute tnum">{pct}%</span>
        <TlButton icon="plus" label="Zoom in" onClick={() => setZoom((value) => clamp(value * 1.4, 1, 16))} disabled={zoom >= 16} />
        <TlButton label="Fit the effect" note="Zooms to the effect's frames." onClick={fit} disabled={!effectRange}>Fit</TlButton>
      </div>
      <div className="flex">
        <div className="w-[84px] flex-none border-r border-line text-xs text-mute">
          <div className="border-b border-line" style={{ height: LANE.ruler }} />
          <div className="flex items-center gap-1.5 border-b border-line px-2 text-track" style={{ height: LANE.track }}><Icon name="target" size={12} />Tracking</div>
          <div className="flex items-center gap-1.5 border-b border-line px-2" style={{ height: LANE.phases }}><Icon name="sparkle" size={12} className="text-faint" />Effect</div>
          <div className="flex items-center gap-1.5 px-2" style={{ height: LANE.points }}><Icon name="route" size={12} className="text-faint" />Path</div>
        </div>
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <div ref={contentRef} className="relative select-none" style={{ width: total }} onPointerDown={clip ? scrub : undefined}>
            <div className="relative cursor-ew-resize border-b border-line" style={{ height: LANE.ruler }}>
              {Array.from({ length: Math.floor((frames - 1) / step) + 1 }, (_, i) => i * step).map((tick) => (
                <span key={tick} className="absolute top-0 h-full border-l border-line2 pl-1 text-[10px] leading-3 text-faint tnum" style={{ left: tick * ppf }}>{tick}</span>
              ))}
              {effectRange && (
                <span className="absolute bottom-0 h-1 rounded-t bg-accent/80" title={`Render window · frames ${effectRange.start}–${effectRange.end - 1} (8 s at most)`}
                  style={{ left: effectRange.start * ppf, width: Math.max(ppf, (effectRange.end - effectRange.start) * ppf) }} />
              )}
            </div>
            <div className="relative border-b border-line bg-lane" style={{ height: LANE.track }}>
              {state === "upload" && <span className="absolute inset-y-[7px] left-0 right-0 rounded-full bg-raised" />}
              {state === "track" && <span className="bar-tracking absolute inset-y-[7px] left-0 right-0 rounded-full" />}
              {state === "failed" && <span className="absolute inset-y-[7px] left-0 right-0 rounded-full bg-err/30" />}
              {state === "ready" && runs.map((run) => (
                <span key={run.start} className="absolute inset-y-[6px] rounded-full" title={run.uncertain ? `Unsure · frames ${run.start}–${run.end - 1}` : `Tracked · frames ${run.start}–${run.end - 1}`} style={{
                  left: run.start * ppf,
                  width: Math.max(ppf, (run.end - run.start) * ppf),
                  background: run.uncertain ? "rgb(var(--c-warn))" : "rgb(var(--c-track) / 0.85)",
                }} />
              ))}
            </div>
            <div className="relative border-b border-line bg-lane" style={{ height: LANE.phases }}>
              {!ready && <span className="absolute inset-0 flex items-center px-2 text-2xs text-faint">{state === "failed" ? "" : "Timing appears when tracking finishes"}</span>}
              {ready && blocks.filter(([, a, b]) => b > a).map(([key, a, b]) => {
                const w = (b - a) * ppf;
                const style = PHASE[key];
                return (
                  <div key={key} className="pointer-events-none absolute top-1 bottom-1 flex items-center overflow-hidden px-1.5 text-2xs font-semibold first:rounded-l" style={{ left: a * ppf, width: w, color: "rgb(var(--c-ink))", background: style.background }} title={`${style.label}: ${a}–${b - 1}`}>
                    <span className="halo-text">{w > 56 ? (key === "held" && cue.behaviour === "orbit" ? "Orbit" : key === "held" && cue.behaviour === "charge_up" ? "Charge" : style.label) : ""}</span>
                  </div>
                );
              })}
              {ready && edges.map(([key, label, at]) => (
                <div key={key} data-handle="1" role="slider" tabIndex={0} aria-label={`${label}, frame ${at}`} aria-valuenow={at} aria-valuemin={0} aria-valuemax={frames} title={`${label} · f ${at}`}
                  className="absolute top-0 bottom-0 z-10 -ml-[6px] flex w-[13px] cursor-ew-resize items-center justify-center focus-visible:outline-2" style={{ left: at * ppf }}
                  onPointerDown={(event) => dragEdge(event, key, at)} onKeyDown={(event) => edgeKey(event, key, at)}>
                  <span className="h-[20px] w-[3px] rounded-full bg-ink opacity-70" />
                </div>
              ))}
              {takeRange && <span className="pointer-events-none absolute top-0 h-[3px] rounded bg-accent" style={{ left: takeRange.start * ppf, width: (takeRange.end - takeRange.start) * ppf }} />}
            </div>
            <div className="relative bg-lane" style={{ height: LANE.points }}>
              {ready && hold && <div className="px-2 text-2xs leading-[24px] text-faint">{cue.behaviour === "orbit" ? "Orbit stays on the body point: no path." : "Hold stays on the body point: no path."}</div>}
              {ready && !hold && (cue.route || []).map((point, index) => {
                const on = selected === index;
                return (
                  <button key={`${index}-${point.f}`} type="button" data-handle="1" aria-pressed={on} aria-label={index === 0 ? `Release point, frame ${point.f}` : `Path point ${index}, frame ${point.f}`}
                    title={index === 0 ? `Release · f ${point.f}` : `Point ${index} · f ${point.f}`}
                    className="absolute top-0 bottom-0 z-10 -ml-2.5 flex w-5 items-center justify-center" style={{ left: point.f * ppf, cursor: index === 0 ? "pointer" : "ew-resize" }}
                    onPointerDown={(event) => dragPoint(event, index)}>
                    <span className={cx("block h-3 w-3 rotate-45 border", index === 0 ? "border-black bg-ph-held" : "border-black bg-path", on && "outline-2 outline-offset-1 outline-ink")} />
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 bg-ink" style={{ left: frame * ppf }}>
              <span className="absolute -left-[5px] top-0 h-2 w-3 rounded-sm bg-ink" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
