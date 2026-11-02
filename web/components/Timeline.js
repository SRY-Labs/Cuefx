"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { holdsOnBody, phaseTimes, trackRuns } from "../lib/cue";
import { Icon } from "./ui";

const LANE = { ruler: 22, track: 22, phases: 32, points: 26 };
const PHASE = {
  entrance: { token: "--c-ph-entrance", label: "Entrance", background: "linear-gradient(90deg, rgb(var(--c-ph-entrance) / 0.08), rgb(var(--c-ph-entrance) / 0.5))" },
  held: { token: "--c-ph-held", label: "Held", background: "rgb(var(--c-ph-held) / 0.32)" },
  flight: { token: "--c-ph-flight", label: "Flight", background: "repeating-linear-gradient(135deg, rgb(var(--c-ph-flight) / 0.6) 0 2px, rgb(var(--c-ph-flight) / 0.16) 2px 7px)" },
  vanish: { token: "--c-ph-vanish", label: "Vanish", background: "radial-gradient(rgb(var(--c-ph-vanish) / 0.85) 1px, transparent 1.6px) 0 0 / 5px 5px, linear-gradient(90deg, rgb(var(--c-ph-vanish) / 0.35), rgb(var(--c-ph-vanish) / 0.08))" },
};

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export default function Timeline({ clip, cue, frame, setFrame, effectRange, selected, onSelect, onTiming, onCommit, onPointFrame }) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const frames = clip.frames;
  const ppf = Math.max(1.5, (width / frames) * zoom);
  const total = Math.ceil(frames * ppf);
  const T = phaseTimes(cue);
  const hold = holdsOnBody(cue.behaviour);
  const runs = trackRuns(cue.track);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const watch = new ResizeObserver(() => setWidth(node.clientWidth));
    watch.observe(node);
    setWidth(node.clientWidth);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !effectRange) return;
    const span = Math.max(24, effectRange.end - effectRange.start);
    setZoom(clamp((frames / span) * 0.62, 1, 12));
  }, [width, effectRange, frames]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !ppf) return;
    const view = node.clientWidth;
    const x = frame * ppf;
    if (effectRange && frame >= effectRange.start && frame < effectRange.end) {
      const left = effectRange.start * ppf;
      const right = effectRange.end * ppf;
      if (right - left + 48 <= view) {
        node.scrollLeft = Math.max(0, left - 8);
        return;
      }
    }
    if (x < node.scrollLeft + 48 || x > node.scrollLeft + view - 48) {
      node.scrollLeft = Math.max(0, x - view * 0.3);
    }
  }, [frame, ppf, effectRange]);

  function frameAt(event) {
    const rect = contentRef.current.getBoundingClientRect();
    return clamp(Math.floor((event.clientX - rect.left) / ppf), 0, frames - 1);
  }

  function scrub(event) {
    if (event.button !== 0 || event.target.closest("[data-handle]")) return;
    setFrame(frameAt(event));
    const move = (ev) => setFrame(frameAt(ev));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragEdge(event, key) {
    event.stopPropagation();
    event.preventDefault();
    const move = (ev) => onTiming(key, frameAt(ev));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommit();
    };
    move(event);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragPoint(event, index) {
    event.stopPropagation();
    onSelect(index);
    if (index === 0) return;
    event.preventDefault();
    const move = (ev) => {
      const next = onPointFrame(index, frameAt(ev));
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

  const edges = [
    ["entranceStart", "Entrance start", T.es],
    ["appear", "Appear", T.appear],
    ...(hold ? [] : [["release", "Release", T.release]]),
    ["vanishStart", "Vanish start", T.vs],
    ["vanishEnd", "Vanish end", T.ve],
  ];
  const blocks = [
    ["entrance", T.es, T.appear],
    ["held", T.appear, T.release],
    ...(hold ? [] : [["flight", T.release, T.vs]]),
    ["vanish", T.vs, T.ve],
  ];
  const step = [1, 2, 5, 10, 24, 48, 96].find((value) => value * ppf >= 48) || 120;

  return (
    <div className="flex shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex h-8 items-center gap-2 border-b border-line px-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-faint">Timeline</span>
        <span className="flex-1" />
        <button type="button" className="h-6 rounded px-2 text-xs text-mute hover:bg-raised hover:text-ink" onClick={() => setZoom((value) => clamp(value / 1.4, 1, 16))}>−</button>
        <button type="button" className="h-6 rounded px-2 text-xs text-mute hover:bg-raised hover:text-ink" onClick={() => setZoom((value) => clamp(value * 1.4, 1, 16))}>+</button>
      </div>
      <div className="flex">
        <div className="w-[108px] flex-none border-r border-line text-xs text-mute">
          <div className="border-b border-line" style={{ height: LANE.ruler }} />
          {[["hand", "Hand track"], ["orb", "Effect"], ["route", "Path"]].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-1.5 border-b border-line px-2" style={{ height: label === "Effect" ? LANE.phases : label === "Path" ? LANE.points : LANE.track }}>
              <Icon name={icon === "hand" ? "hand" : icon === "route" ? "route" : "target"} size={13} className="text-faint" />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <div ref={contentRef} className="relative" style={{ width: total }} onPointerDown={scrub}>
            <div className="relative cursor-ew-resize border-b border-line bg-panel" style={{ height: LANE.ruler }}>
              {Array.from({ length: Math.floor(frames / step) + 1 }, (_, i) => i * step).map((tick) => (
                <span key={tick} className="absolute top-1 text-[10px] text-mute tnum" style={{ left: tick * ppf + 3 }}>{tick}</span>
              ))}
              {effectRange && <div className="absolute bottom-0 h-1 bg-accent/80" style={{ left: effectRange.start * ppf, width: Math.max(ppf, (effectRange.end - effectRange.start) * ppf) }} />}
            </div>
            <div className="relative border-b border-line bg-lane" style={{ height: LANE.track }}>
              {runs.map((run) => (
                <div key={run.start} className="absolute top-1.5 bottom-1.5 rounded-sm" title={run.uncertain ? "Uncertain" : "Tracked"} style={{
                  left: run.start * ppf,
                  width: Math.max(ppf, (run.end - run.start) * ppf),
                  background: run.uncertain
                    ? "repeating-linear-gradient(45deg, rgb(var(--c-track) / 0.7) 0 2px, transparent 2px 5px)"
                    : "rgb(var(--c-track) / 0.8)",
                }} />
              ))}
            </div>
            <div className="relative border-b border-line bg-lane" style={{ height: LANE.phases }}>
              {blocks.filter(([, a, b]) => b > a).map(([key, a, b]) => {
                const w = (b - a) * ppf;
                const style = PHASE[key];
                return (
                  <div key={key} className="pointer-events-none absolute top-1 bottom-1 flex items-center overflow-hidden rounded-sm px-1.5 text-2xs font-semibold" style={{ left: a * ppf, width: w, color: "rgb(var(--c-ink))", borderTop: `3px solid rgb(var(${style.token}))`, background: style.background }} title={`${style.label}: ${a}–${b - 1}`}>
                    <span className="halo-text">{w > 64 ? style.label : ""}</span>
                  </div>
                );
              })}
              {edges.map(([key, label, at]) => (
                <div key={key} data-handle="1" role="slider" tabIndex={0} aria-label={label} aria-valuenow={at} title={label} className="absolute top-0 bottom-0 z-10 -ml-[5px] flex w-[11px] cursor-ew-resize items-center justify-center" style={{ left: at * ppf }} onPointerDown={(event) => dragEdge(event, key)}>
                  <span className="h-[18px] w-[3px] rounded-full bg-ink opacity-60" />
                </div>
              ))}
            </div>
            <div className="relative border-b border-line bg-lane" style={{ height: LANE.points }}>
              {hold && <div className="px-2 text-2xs leading-[26px] text-faint">{cue.behaviour === "orbit" ? "Orbit stays on the body point, so there is no path." : "Hold stays on the body point, so there is no path."}</div>}
              {!hold && (cue.route || []).map((point, index) => {
                const on = selected === index;
                return (
                  <button key={`${point.f}-${index}`} type="button" data-handle="1" aria-pressed={on} aria-label={`Path point ${index + 1}, frame ${point.f}`} title={index === 0 ? `Release · frame ${point.f}` : `Point ${index + 1} · frame ${point.f}`} className="absolute top-0 bottom-0 z-10 -ml-2.5 flex w-5 items-center justify-center" style={{ left: (point.f + 0.5) * ppf, cursor: index === 0 ? "pointer" : "ew-resize" }} onPointerDown={(event) => dragPoint(event, index)}>
                    <span className={`block h-3 w-3 rotate-45 border-2 ${index === 0 ? "border-path bg-bg" : "border-bg bg-path"} ${on ? "scale-125 border-accent" : ""}`} />
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-accent" style={{ left: frame * ppf }} />
          </div>
        </div>
      </div>
    </div>
  );
}
