"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { artifactUrl, frameUrl } from "../lib/api";
import { lookById, phaseTimes } from "../lib/cue";
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

/** The three parts of a take and where each one stands: done, running, waiting, or failed. */
function partsOf(take) {
  const stages = stagesOf(take).map((stage) => stage.id);
  const at = take.status === "failed" ? take.failedStage : take.status === "done" ? "done" : take.stage;
  const order = ["guide", "frame", "video"];
  const state = (id) => {
    if (!stages.includes(id)) return "none";
    if (at === "done") return "done";
    const i = order.indexOf(id);
    const j = order.indexOf(at);
    if (i < j) return "done";
    if (i === j) return take.status === "failed" ? "failed" : "run";
    return "wait";
  };
  return {
    guide: { state: state("guide"), url: take.job?.status === "done" ? artifactUrl(take.job, "hardcomp") : null },
    frame: { state: state("frame"), url: take.generation?.status === "done" ? take.generation.reference : null },
    video: { state: state("video"), url: take.video?.status === "done" ? take.video.video : null },
  };
}

const WIRE = { video: "rgb(var(--c-track))", image: "rgb(var(--c-occ))" };
const STATE_LABEL = { done: "Done", run: "Running", wait: "Waiting", failed: "Stopped" };

function StateTag({ state }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-mute">
      <span className={cx("h-1.5 w-1.5 rounded-full", state === "done" ? "bg-accent" : state === "run" ? "bg-warn" : state === "failed" ? "bg-err" : "bg-faint")} />
      {STATE_LABEL[state]}
    </span>
  );
}

function Port({ side, color, label, portRef }) {
  return (
    <div className={cx("relative flex h-6 items-center px-2.5 text-[11px] text-mute", side === "out" ? "justify-end" : "justify-start")}>
      <span ref={portRef} aria-hidden="true" className={cx("absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 bg-panel", side === "out" ? "-right-[6px]" : "-left-[6px]")} style={{ borderColor: color, background: color }} />
      {label}
    </div>
  );
}

function GraphNode({ title, tag, state, ports, meta, children, highlight }) {
  return (
    <section aria-label={title} className={cx("relative flex min-w-0 flex-col rounded-[10px] border border-line2 bg-panel shadow-[0_18px_40px_-16px_rgb(0_0_0/0.8)]",
      highlight && state === "done" && "ring-1 ring-accent/60", state === "wait" && "opacity-90")}>
      <header className="flex h-[34px] items-center gap-2 border-b border-line px-2.5">
        <span className="text-xs font-semibold text-ink">{title}</span>
        <span className="truncate text-[11px] text-faint">{tag}</span>
        <span className="flex-1" />
        <StateTag state={state} />
      </header>
      <div className="pt-1">{ports}</div>
      <div className="px-2.5 pb-2.5 pt-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-[6px] bg-black">{children}</div>
        {meta && <p className="mt-2 text-[11px] leading-[15px] text-faint">{meta}</p>}
      </div>
    </section>
  );
}

function Waiting({ title, note, busy, backdrop }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-center">
      {backdrop && <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-[2px]" />}
      <span className="relative flex flex-col items-center gap-1.5 px-3">
        {busy && <Icon name="loader" size={16} className="spin text-mute" />}
        <span className="text-xs font-medium text-ink">{title}</span>
        {note && <span className="text-[11px] text-faint">{note}</span>}
      </span>
    </div>
  );
}

/**
 * The breakdown of one take as a small node graph: your direction (the guide pass) gives one frame to the look (the
 * styled frame), and both feed the effect (the LTX video). The wires are drawn between the ports after layout.
 */
function Breakdown({ take, clip, now, guideRef, videoRef, onRetry, onToggle }) {
  const parts = partsOf(take);
  const box = useRef(null);
  const ports = { gOut: useRef(null), fIn: useRef(null), fOut: useRef(null), vIn1: useRef(null), vIn2: useRef(null) };
  const [wires, setWires] = useState([]);
  const T = take.settings.cue?.appear_frame != null ? phaseTimes({ fps: FPS, ...take.settings.cue }) : null;
  const range = take.settings.cue.effect_range;
  const still = clip && T ? frameUrl(clip.clip_id, T.es) : null;
  const clockOf = (id) => (take.stage === id && take.status === "running" ? clock(now - take.stageStarted) : null);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    function measure() {
      const base = node.getBoundingClientRect();
      const at = (ref) => {
        const r = ref.current?.getBoundingClientRect();
        return r && r.width ? { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top } : null;
      };
      const g = at(ports.gOut);
      const list = [
        [g, at(ports.fIn), "video", parts.frame.state, `frame ${T ? T.es : ""}`.trim()],
        [g, at(ports.vIn1), "video", parts.video.state, "motion"],
        [at(ports.fOut), at(ports.vIn2), "image", parts.video.state, "look"],
      ].filter(([a, b]) => a && b);
      setWires(list);
    }
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, [take.id, parts.frame.state, parts.video.state]);

  const failedNote = take.status === "failed" ? (take.error?.message || "This stage stopped.") : null;
  const retry = <Btn size="sm" variant="secondary" icon="retry" onClick={() => onRetry(take)}>Retry from here</Btn>;

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-auto rounded-[12px] border border-line bg-bg [background-image:radial-gradient(rgb(var(--c-line2))_1px,transparent_1px)] [background-size:20px_20px]">
      <div ref={box} className="relative grid min-h-full grid-cols-1 gap-6 p-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] md:gap-16">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-full w-full md:block">
        {wires.map(([a, b, type, state, label]) => {
          const dx = Math.max(50, (b.x - a.x) * 0.5);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const w = label.length * 6.2 + 16;
          return (
            <g key={label}>
              <path d={`M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`} fill="none" stroke={WIRE[type]} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={state === "done" ? undefined : state === "run" ? "6 6" : "3 6"} opacity={state === "wait" || state === "failed" ? 0.45 : 1}
                className={state === "run" ? "wire-run" : undefined} />
              <rect x={mx - w / 2} y={my - 10} width={w} height="20" rx="6" fill="rgb(var(--c-bg))" stroke="rgb(var(--c-line2))" />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize="11" fill="rgb(var(--c-mute))">{label}</text>
            </g>
          );
        })}
      </svg>
        <div className="self-center">
          <GraphNode title="Your direction" tag="Guide pass" state={parts.guide.state} highlight={false}
            meta={parts.guide.state === "done" ? "The effect drawn on your footage, where you put it." : "Draws the effect where you directed it, on your footage."}
            ports={<Port side="out" color={WIRE.video} label="guide video" portRef={ports.gOut} />}>
            {parts.guide.url ? <video ref={guideRef} src={parts.guide.url} muted playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain" onClick={onToggle} />
              : parts.guide.state === "failed" ? <Waiting title="The guide pass stopped" note={failedNote} /> : <Waiting busy title={`Drawing the guide pass${clockOf("guide") ? ` · ${clockOf("guide")}` : ""}`} note="usually under a minute" backdrop={still} />}
          </GraphNode>
          {parts.guide.state === "failed" && <div className="mt-2">{retry}</div>}
        </div>
        {parts.frame.state !== "none" && (
          <div className="self-end">
            <GraphNode title="The look" tag="Styled frame" state={parts.frame.state}
              meta={`ComfyUI paints frame ${T ? T.es : "one"} of your direction in the look you chose.`}
              ports={<><Port side="in" color={WIRE.video} label={`frame ${T ? T.es : ""}`} portRef={ports.fIn} /><Port side="out" color={WIRE.image} label="styled frame" portRef={ports.fOut} /></>}>
              {parts.frame.url ? <img src={parts.frame.url} alt={`Styled frame of take ${take.n}`} className="absolute inset-0 h-full w-full object-contain" />
                : parts.frame.state === "failed" ? <Waiting title="The styled frame stopped" note={failedNote} />
                : parts.frame.state === "run" ? <Waiting busy title={`Styling the frame${clockOf("frame") ? ` · ${clockOf("frame")}` : ""}`} note="usually about 100 s" backdrop={still} />
                : <Waiting title="Waits for your direction" />}
            </GraphNode>
            {parts.frame.state === "failed" && <div className="mt-2">{retry}</div>}
          </div>
        )}
        {parts.video.state !== "none" && (
          <div className="self-start">
            <GraphNode title="The effect" tag="LTX video" state={parts.video.state} highlight
              meta={`LTX moves the look along your direction${range ? `, frames ${range.start}–${range.end - 1}` : ""}.`}
              ports={<><Port side="in" color={WIRE.video} label="guide video" portRef={ports.vIn1} /><Port side="in" color={WIRE.image} label="styled frame" portRef={ports.vIn2} /></>}>
              {parts.video.url ? <video ref={videoRef} src={parts.video.url} muted playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain" onClick={onToggle} />
                : parts.video.state === "failed" ? <Waiting title="The video stopped" note={failedNote} />
                : parts.video.state === "run" ? <Waiting busy title={`Rendering the video${clockOf("video") ? ` · ${clockOf("video")}` : ""}`} note="usually about 60 s" />
                : <Waiting title="Starts when the look is ready" note="about 60 s after that" />}
            </GraphNode>
            {parts.video.state === "failed" && <div className="mt-2">{retry}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The render view. It opens when Render is pressed. Breakdown shows the take as nodes, your direction and the look
 * joining into the effect; Result shows the final media large, and is where two takes can be compared. Editing stays
 * behind it.
 */
export default function TakesPlayer({ takes, current, clip, now, onPick, onClose, onRetry, onUse }) {
  const guideOnly = current.kind === "guide";
  const [view, setView] = useState("breakdown");
  const shownView = guideOnly ? "result" : view;
  const media = takeMedia(current);
  const loading = useMediaLoading(shownView === "result" ? media?.url || null : null);
  const downloads = takeDownloads(current);
  const stages = stagesOf(current);
  const range = current.settings.cue.effect_range;
  const index = takes.findIndex((take) => take.id === current.id);
  const others = takes.filter((take) => take.id !== current.id && takeMedia(take)?.kind === "video");
  const [compareId, setCompareId] = useState(null);
  const compare = shownView === "result" && compareId ? takes.find((take) => take.id === compareId) : null;
  const compareMedia = compare ? takeMedia(compare) : null;
  const parts = partsOf(current);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const main = useRef(null);
  const side = useRef(null);
  const guideNode = useRef(null);
  const videoNode = useRef(null);
  const stage = useRef(null);
  const panel = useRef(null);

  // Which element drives the clock, and which follows it. In Breakdown the final video leads when it exists and the
  // guide pass follows it, shifted to the same plate frame; before that the guide pass plays on its own.
  const lead = () => (shownView === "result" ? main.current : videoNode.current || guideNode.current);
  const follower = () => (shownView === "result" ? side.current : videoNode.current ? guideNode.current : null);
  const offset = () => {
    if (shownView !== "breakdown" || !videoNode.current || !guideNode.current) return 0;
    const g = guideNode.current.duration || 0;
    const v = videoNode.current.duration || 0;
    return g - v > 0.2 && range ? range.start / FPS : 0;
  };
  const leadKey = shownView === "result" ? media?.url : `${parts.video.url}|${parts.guide.url}`;
  const isVideo = shownView === "result" ? media?.kind === "video" : !!(parts.video.url || parts.guide.url);

  useEffect(() => { panel.current?.focus(); }, []);
  useEffect(() => { setTime(0); setDuration(0); setPlaying(true); }, [leadKey, shownView]);
  useEffect(() => { if (compareId && !takes.some((take) => take.id === compareId && take.id !== current.id)) setCompareId(null); }, [current.id, compareId, takes]);

  useEffect(() => {
    if (!isVideo) return undefined;
    let raf = 0;
    const tick = () => {
      const node = lead();
      if (node) {
        setTime(node.currentTime);
        if (node.duration && Math.abs(node.duration - duration) > 0.01) setDuration(node.duration);
        const other = follower();
        if (other) {
          const want = Math.min(node.currentTime + offset(), other.duration || node.currentTime);
          if (Math.abs(other.currentTime - want) > 0.06) other.currentTime = want;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  useEffect(() => {
    const nodes = shownView === "result" ? [main.current, side.current] : [videoNode.current, guideNode.current];
    for (const node of nodes) {
      if (!node) continue;
      node.playbackRate = speed;
      node.loop = loop;
      if (playing) node.play().catch(() => {}); else node.pause();
    }
  }, [playing, speed, loop, leadKey, compareMedia?.url, shownView]);

  function seek(seconds) {
    const node = lead();
    if (!node) return;
    const to = Math.max(0, Math.min(seconds, (node.duration || seconds) - 0.001));
    node.currentTime = to;
    const other = follower();
    if (other) other.currentTime = Math.min(to + offset(), other.duration || to);
    setTime(to);
  }
  function step(frames) { setPlaying(false); seek((lead()?.currentTime || 0) + frames / FPS); }
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
      if (key === "b" && !guideOnly) setView("breakdown");
      if (key === "r") setView("result");
      if (key === "c" && others.length) { setView("result"); setCompareId((value) => (value ? null : others[others.length - 1].id)); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const frame = Math.round((time + offset()) * FPS);
  const frames = Math.max(1, Math.round(duration * FPS));

  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Take ${current.n}`} className="fixed inset-0 z-[120] flex flex-col bg-bg text-ink outline-none">
      <header className="grid h-12 flex-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line bg-panel px-3">
        <div className="flex items-center"><Btn variant="ghost" onClick={onClose}><Icon name="chevRight" size={14} className="rotate-180" />Back to editing</Btn></div>
        <div className="flex items-center gap-2 text-[13px]">
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
          <div className="flex w-full max-w-[1280px] flex-none flex-wrap items-center gap-3 text-xs text-mute">
            {!guideOnly && (
              <div role="tablist" aria-label="View" className="flex gap-0.5 rounded-[8px] bg-field p-0.5">
                {[["breakdown", "Breakdown", "B"], ["result", "Result", "R"]].map(([id, name, kbd]) => (
                  <Tip key={id} title={name} kbd={kbd} note={id === "breakdown" ? "How your direction and the look became the effect." : "The final result, and compare with another take."}>
                    <button type="button" role="tab" aria-selected={shownView === id} onClick={() => setView(id)}
                      className={cx("h-[26px] rounded-[6px] px-3 text-xs font-medium", shownView === id ? "bg-sel text-ink" : "text-mute hover:text-ink")}>{name}</button>
                  </Tip>
                ))}
              </div>
            )}
            <span><span className="text-ink">{current.kind === "guide" ? "Guide pass" : lookById(current.settings.look).name}</span><span className="tnum"> · seed {current.settings.cue.seed ?? 42}{range ? ` · frames ${range.start}–${range.end - 1}` : ""}</span></span>
            <span className="flex-1" />
            {compare && <span className="tnum">Comparing with take {compare.n}</span>}
          </div>

          {shownView === "breakdown" ? (
            <div ref={stage} className="flex min-h-0 w-full max-w-[1280px] flex-1 flex-col">
              <Breakdown take={current} clip={clip} now={now} guideRef={guideNode} videoRef={videoNode} onRetry={onRetry} onToggle={() => setPlaying((value) => !value)} />
            </div>
          ) : (
            <div ref={stage} className={cx("relative grid min-h-0 w-full max-w-[1280px] flex-1 place-items-center gap-2 bg-bg", compare ? "grid-cols-2" : "grid-cols-1")}>
              <div className="relative aspect-video max-h-full w-full overflow-hidden rounded-[10px] bg-black">
                {media?.kind === "video" && <video ref={main} key={`${media.url}-${loading.attempt}`} src={media.url} autoPlay muted playsInline className="absolute inset-0 h-full w-full cursor-pointer object-contain"
                  onClick={() => setPlaying((value) => !value)} onEnded={() => { if (!loop) setPlaying(false); }} {...loading.handlers} />}
                {media?.kind === "image" && <img key={`${media.url}-${loading.attempt}`} src={media.url} alt={`Styled frame of take ${current.n}`} className="absolute inset-0 h-full w-full object-contain" {...loading.handlers} />}
                {media && <MediaLoading status={loading} />}
                {compare && <span className="absolute left-2 top-2 rounded-[6px] bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">Take {current.n}</span>}
                {!media && current.status === "running" && <div className="absolute inset-0 grid place-items-center text-[13px] text-mute">The first result shows here as soon as it is ready.</div>}
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
          )}

          <div className="flex w-full max-w-[1280px] flex-none flex-col gap-1.5 rounded-[12px] border border-line bg-panel px-2.5 py-2" aria-label="Playback">
            <input type="range" aria-label="Scrub" className="cue-range w-full" min={0} max={duration || 1} step={1 / FPS} value={Math.min(time, duration || 1)} disabled={!isVideo}
              style={{ "--fill": `${duration ? (time / duration) * 100 : 0}%`, "--fill-c": "rgb(var(--c-accent))" }} onChange={(event) => { setPlaying(false); seek(Number(event.target.value)); }} />
            <div className="flex flex-wrap items-center gap-0.5">
              <PlayerBtn icon="stepBack" label="Previous frame" kbd="←" disabled={!isVideo} onClick={() => step(-1)} />
              <PlayerBtn icon={playing ? "pause" : "play"} label={playing ? "Pause" : "Play"} kbd="Space" disabled={!isVideo} onClick={() => setPlaying((value) => !value)} />
              <PlayerBtn icon="stepFwd" label="Next frame" kbd="→" disabled={!isVideo} onClick={() => step(1)} />
              <span className="ml-2 text-xs text-ink tnum">{stamp(time)}<span className="text-faint"> / {stamp(duration)} · f {frame}</span></span>
              {shownView === "breakdown" && <span className="ml-3 hidden text-xs text-faint lg:inline">{parts.video.url ? "Your direction and the effect play together" : parts.guide.url ? "Your direction plays now; the effect joins when it is ready" : ""}</span>}
              <span className="flex-1" />
              <PlayerBtn icon="loop" label="Loop" kbd="L" active={loop} disabled={!isVideo} onClick={() => setLoop((value) => !value)} />
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-line2" />
              {SPEEDS.map((value) => (
                <PlayerBtn key={value} label={`Speed ${value}×`} active={speed === value} disabled={!isVideo} onClick={() => setSpeed(value)}>{value}×</PlayerBtn>
              ))}
              {shownView === "result" && (
                <>
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
                </>
              )}
              <PlayerBtn icon="expand" label="Full screen" kbd="F" disabled={!isVideo && !media} onClick={fullscreen} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
