"use client";

import { useEffect, useRef, useState } from "react";
import { listClips } from "../lib/api";
import { clipLine } from "../lib/cue";
import { HERO_FPS, HERO_FRAMES, HERO_PATH } from "../lib/heroPath";
import { PRESETS } from "../lib/presets";
import { LookStill } from "./LookPicker";
import { Btn, Icon, cx } from "./ui";

// Phases of the directed showcase take, in frames at 30 fps (read off the video).
const PHASES = [
  { id: "track", label: "Tracking", from: 0, to: 79, tone: "bg-track/25 text-track" },
  { id: "held", label: "Held", from: 79, to: 100, tone: "bg-ph-held/35 text-ph-held" },
  { id: "flight", label: "Flight", from: 100, to: 214, tone: "bg-path/25 text-path" },
  { id: "burst", label: "Burst", from: 214, to: 240, tone: "bg-occ/30 text-occ" },
];
const PATH = HERO_PATH.filter(([f]) => f <= 214);
const KEYS = PATH.filter((_, index) => index % 12 === 0);

const BEHAVIOUR_TAG = { hold_throw: "Hold + throw", charge_up: "Charge up", orbit: "Orbit", hold: "Hold" };
const LOOK_GLOW = { fireball: "255 179 92", blue_plasma: "159 212 255", electric_orb: "214 200 255", ice_sphere: "223 244 255", shadow_energy: "154 115 230" };

const STEPS = [
  { title: "Upload a clip", body: "Up to 15 seconds, one person in frame. Or start from our sample." },
  { title: "Check the tracking", body: "MediaPipe follows the fist, palm, foot or head you pick, frame by frame." },
  { title: "Direct and render", body: "Draw where the effect goes, pick a look, and render it on your footage." },
];

const NODES = [
  { src: "/showcase/hood-1-footage.jpg", title: "Footage", tag: "Input", port: "bg-ink/60" },
  { src: "/showcase/hood-2-tracking.jpg", title: "Body tracking", tag: "MediaPipe", port: "bg-track" },
  { src: "/showcase/hood-3-path.jpg", title: "Directed path", tag: "CueFX", port: "bg-path" },
  { src: "/showcase/hood-4-layout.jpg", title: "Layout pass", tag: "Control", port: "bg-ph-held" },
  { src: "/showcase/hood-5-render.jpg", title: "LTX-2.5 render", tag: "ComfyUI", port: "bg-accent", hot: true },
  { src: "/showcase/hood-6-composite.jpg", title: "Final composite", tag: "Output", port: "bg-occ" },
];

export default function HomeScreen({ onNew, onOpen, onSample, onPreset }) {
  const [clips, setClips] = useState(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  return (
    <main className="h-full overflow-y-auto bg-[#060706] text-white">
      <Hero onSample={onSample} onNew={onNew} />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-20 px-4 pb-16 sm:px-6">
        <Difference />
        <Presets onPreset={onPreset} />
        <Pipeline />
        {clips && clips.length > 0 && <RecentClips clips={clips} onOpen={onOpen} />}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ onSample, onNew }) {
  return (
    <section className="relative overflow-hidden">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-40 left-[8%] h-[480px] w-[480px] rounded-full bg-accent/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-track/15 blur-[140px]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#060706]" aria-hidden="true" />
      <div className="relative mx-auto flex max-w-[1200px] flex-col gap-8 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
        <div className="flex max-w-[760px] flex-col items-start gap-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 t-overline text-white/70 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-accent/70" /><span className="relative h-2 w-2 rounded-full bg-accent" /></span>
            Directed VFX · ComfyUI + LTX-2.5
          </span>
          <h1 className="hero-title">
            Make the effect<br /><span className="hero-gradient">follow the move.</span>
          </h1>
          <p className="t-body-l max-w-[560px] text-white/65">
            Prompted effects drift off the hand. CueFX tracks the body in your clip, lets you draw where the effect goes, and renders it on your footage.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onClick={onSample}
              className="group inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-medium text-on-accent shadow-[0_0_0_1px_rgb(var(--c-accent)/0.4),0_8px_32px_-8px_rgb(var(--c-accent)/0.7)] transition hover:bg-accent-hi">
              <Icon name="play" size={16} /> Try the sample clip
            </button>
            <button type="button" onClick={onNew}
              className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/[0.08]">
              <Icon name="upload" size={16} /> Upload your clip
            </button>
          </div>
          <p className="t-body-s text-white/40">mp4, mov, mkv or webm · up to 15 seconds · about a minute to your first preview</p>
        </div>
        <Viewfinder />
      </div>
    </section>
  );
}

/** The directed take with the path CueFX drew, as a live director's monitor. */
function Viewfinder() {
  const video = useRef(null);
  const [frame, setFrame] = useState(0);
  const [hud, setHud] = useState(true);

  useEffect(() => {
    const node = video.current;
    if (!node) return undefined;
    let raf = 0;
    const tick = () => {
      setFrame(Math.min(HERO_FRAMES - 1, Math.floor(node.currentTime * HERO_FPS)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) node.play().catch(() => {});
    return () => cancelAnimationFrame(raf);
  }, []);

  const phase = PHASES.find((item) => frame >= item.from && frame < item.to) || PHASES[0];
  const travelled = PATH.filter(([f]) => f <= frame);
  const here = travelled[travelled.length - 1];
  const live = here && frame <= 214;
  const seconds = frame / HERO_FPS;
  const tc = `00:00:${String(Math.floor(seconds)).padStart(2, "0")}:${String(frame % HERO_FPS).padStart(2, "0")}`;
  const line = (points) => points.map(([, x, y]) => `${(x * 160).toFixed(2)},${(y * 90).toFixed(2)}`).join(" ");

  return (
    <figure className="flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-black shadow-[0_40px_120px_-40px_rgb(var(--c-track)/0.35)]">
      <div className="relative aspect-video w-full">
        <video ref={video} src="/showcase/4_output_web.mp4" poster="/showcase/directed.jpg" muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" />
        {hud && (
          <svg viewBox="0 0 160 90" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {/* viewfinder corners and centre mark */}
            {[[4, 4, 1, 1], [156, 4, -1, 1], [4, 86, 1, -1], [156, 86, -1, -1]].map(([x, y, sx, sy]) => (
              <path key={`${x}${y}`} d={`M${x} ${y + 6 * sy}V${y}H${x + 6 * sx}`} fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            ))}
            <path d="M78 45h4M80 43v4" stroke="white" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {/* the full directed path, then the part already flown */}
            <polyline points={line(PATH)} fill="none" stroke="rgb(var(--c-path))" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {travelled.length > 1 && <polyline points={line(travelled)} fill="none" stroke="rgb(var(--c-path))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {KEYS.map(([f, x, y]) => (
              <g key={f} opacity={f <= frame ? 1 : 0.45}>
                <rect x={x * 160 - 1.1} y={y * 90 - 1.1} width="2.2" height="2.2" transform={`rotate(45 ${x * 160} ${y * 90})`} fill="rgb(var(--c-path))" stroke="black" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                <text x={x * 160 + 2.2} y={y * 90 - 1.6} fontSize="1.9" fontWeight="600" fill="rgb(var(--c-path))" className="hud-text">f{f}</text>
              </g>
            ))}
            {live && (
              <g>
                <circle cx={here[1] * 160} cy={here[2] * 90} r="5" fill="none" stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <path d={`M${here[1] * 160 - 8} ${here[2] * 90}h3M${here[1] * 160 + 5} ${here[2] * 90}h3M${here[1] * 160} ${here[2] * 90 - 8}v3M${here[1] * 160} ${here[2] * 90 + 5}v3`} stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <text x={here[1] * 160 + 7} y={here[2] * 90 + 8} fontSize="2" fontWeight="600" fill="rgb(var(--c-track))" className="hud-text">effect · on path</text>
              </g>
            )}
          </svg>
        )}
        {hud && (
          <>
            <div className="pointer-events-none absolute top-[6%] left-[5%] flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 font-medium text-[11px] text-white/85 backdrop-blur tnum">
              <span className="h-1.5 w-1.5 rounded-full bg-err" /> Directed take · {tc}
            </div>
            <div className={cx("pointer-events-none absolute top-[6%] right-[5%] rounded-full px-2.5 py-1 t-overline backdrop-blur", phase.tone)}>{phase.label}</div>
            <div className="pointer-events-none absolute bottom-[6%] left-[5%] hidden rounded-[10px] border border-white/10 bg-black/60 px-3 py-2 text-[11px] leading-4 text-white/75 backdrop-blur sm:block">
              <div className="t-overline text-white/45">Cue</div>
              <div className="tnum">Foot · left · {PATH.length * 2} frames on path</div>
              <div className="tnum">Release f100 · burst at f214</div>
            </div>
          </>
        )}
        <button type="button" onClick={() => setHud((value) => !value)} aria-pressed={hud}
          className="absolute right-[4%] bottom-[5%] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur hover:bg-black/80">
          <Icon name="target" size={13} /> {hud ? "Hide guides" : "Show guides"}
        </button>
      </div>
      <Strip frame={frame} />
    </figure>
  );
}

/** An editor-style timeline under the monitor, with the same phases CueFX's editor shows. */
function Strip({ frame }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-white/10 bg-[#0b0c0b] px-4 py-3">
      <div className="relative flex h-6 overflow-hidden rounded-[6px] bg-white/[0.04]">
        {PHASES.map((item) => (
          <div key={item.id} className={cx("flex items-center overflow-hidden px-2 text-[11px] font-semibold whitespace-nowrap", item.tone)}
            style={{ width: `${((item.to - item.from) / HERO_FRAMES) * 100}%` }}>{item.label}</div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_8px_white]" style={{ left: `${(frame / HERO_FRAMES) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-white/35 tnum">
        {[0, 2, 4, 6, 8].map((s) => <span key={s}>{s}s</span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

function SectionHead({ overline, title, body }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-2">
      <p className="t-overline text-accent">{overline}</p>
      <h2 className="section-title text-white">{title}</h2>
      {body && <p className="text-sm text-white/55">{body}</p>}
    </div>
  );
}

/** Prompted vs directed on the same kick. Drag to wipe between them. */
function Difference() {
  const [split, setSplit] = useState(50);
  const base = useRef(null);
  const top = useRef(null);

  useEffect(() => {
    const a = base.current;
    const b = top.current;
    if (!a || !b) return undefined;
    const sync = () => { if (Math.abs(a.currentTime - b.currentTime) > 0.12) b.currentTime = a.currentTime; };
    a.addEventListener("timeupdate", sync);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) { a.play().catch(() => {}); b.play().catch(() => {}); }
    return () => a.removeEventListener("timeupdate", sync);
  }, []);

  return (
    <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-5">
        <SectionHead overline="Prompted vs directed" title="A prompt can't say where. A path can." body="Same kick, same model. The prompted take leaves the hand. The directed take holds the path drawn in CueFX." />
        <ul className="flex flex-col gap-2 text-sm text-white/70">
          {["The effect is pinned to a tracked body point", "Release, flight and burst are set in frames", "LTX-2.5 renders the look; the path stays yours"].map((item) => (
            <li key={item} className="flex items-start gap-2"><span className="mt-1 grid h-4 w-4 flex-none place-items-center rounded-full bg-accent/20 text-accent"><Icon name="check" size={10} /></span>{item}</li>
          ))}
        </ul>
      </div>
      <figure className="flex min-w-0 flex-col gap-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-white/10 bg-black">
          <video ref={base} src="/showcase/2_problem_web.mp4" poster="/showcase/prompted.jpg" muted loop playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
          <video ref={top} src="/showcase/4_output_web.mp4" poster="/showcase/directed.jpg" muted loop playsInline preload="metadata"
            className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_12px_white]" style={{ left: `${split}%` }}>
            <span className="absolute top-1/2 left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/70 text-white backdrop-blur">
              <Icon name="sliders" size={14} />
            </span>
          </div>
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 t-overline text-white/80 backdrop-blur">Prompted</span>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-accent px-2.5 py-1 t-overline text-on-accent">Directed</span>
          <input type="range" className="compare-range" min={0} max={100} value={split} onChange={(event) => setSplit(Number(event.target.value))}
            aria-label="Wipe between the prompted take and the directed take" />
        </div>
        <figcaption className="t-body-s text-white/45">Drag to compare.</figcaption>
      </figure>
    </section>
  );
}

function MotionGlyph({ behaviour }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg viewBox="0 0 40 20" className="h-4 w-8" aria-hidden="true">
      {behaviour === "hold_throw" && <><circle cx="6" cy="14" r="2.5" {...common} /><path d="M9 12c8-9 18-9 27-4" strokeDasharray="2 3" {...common} /><path d="M33 5l3 3-4 1" {...common} /></>}
      {behaviour === "charge_up" && <><circle cx="20" cy="10" r="2" {...common} /><circle cx="20" cy="10" r="5" opacity="0.6" {...common} /><circle cx="20" cy="10" r="8.5" opacity="0.3" {...common} /></>}
      {behaviour === "orbit" && <><circle cx="20" cy="10" r="2" {...common} /><ellipse cx="20" cy="10" rx="14" ry="6" strokeDasharray="2 3" {...common} /><circle cx="34" cy="10" r="1.8" fill="currentColor" /></>}
      {behaviour === "hold" && <><circle cx="20" cy="10" r="4" {...common} /><path d="M20 2v3M20 15v3M12 10h3M25 10h3" {...common} /></>}
    </svg>
  );
}

function Presets({ onPreset }) {
  return (
    <section className="flex flex-col gap-6">
      <SectionHead overline="Start from a preset" title="Pick what the effect does" body="Each preset sets the behaviour, the look and the prompt. You can change all three in the editor." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <li key={preset.id}>
            <button type="button" onClick={() => onPreset(preset.id)} style={{ "--glow": LOOK_GLOW[preset.look] }}
              className="preset-card group relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-white/10 bg-[#0c0d0c] text-left transition">
              <span className="relative block h-40 w-full overflow-hidden">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgb(var(--glow)/0.22),transparent_60%)] transition-opacity group-hover:opacity-100 opacity-60" />
                <LookStill id={preset.look} className="relative mx-auto h-full w-auto !bg-transparent p-5 transition-transform duration-500 group-hover:scale-110" />
              </span>
              <span className="flex flex-1 flex-col gap-2 border-t border-white/[0.06] p-4">
                <span className="flex items-center gap-2 text-white/55">
                  <MotionGlyph behaviour={preset.behaviour} />
                  <span className="t-overline">{BEHAVIOUR_TAG[preset.behaviour]}</span>
                </span>
                <span className="t-h3 text-white">{preset.name}</span>
                <span className="text-sm text-white/55">{preset.note}</span>
                <span className="mt-auto flex items-center gap-1 pt-2 text-sm font-medium text-accent">Use this preset <Icon name="chevRight" size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** How it works, and the node graph it runs as. */
function Pipeline() {
  return (
    <section className="flex flex-col gap-8">
      <SectionHead overline="How it works" title="Three steps, about a minute to a first preview" body="CueFX turns your body track and drawn path into a layout pass, then LTX-2.5 renders the effect in ComfyUI." />
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-[14px] border border-white/10 bg-white/[0.02] p-5">
            <span className="font-[family-name:var(--font-display)] text-[32px] leading-[38px] font-bold text-white/15 tnum">0{index + 1}</span>
            <span className="flex flex-col gap-1">
              <span className="t-h3 text-white">{step.title}</span>
              <span className="text-sm text-white/55">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <ol className="grid min-w-[960px] grid-cols-6 items-center gap-6" aria-label="The pipeline behind a directed shot">
          {NODES.map((node, index) => (
            <li key={node.src} className="relative">
              <div className={cx("flex w-full flex-col overflow-hidden rounded-[10px] border bg-[#101110]",
                node.hot ? "border-accent/60 shadow-[0_0_32px_-6px_rgb(var(--c-accent)/0.55)]" : "border-white/10")}>
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-2.5 py-1.5">
                  <span className={cx("h-2 w-2 rounded-full", node.port)} />
                  <span className="truncate text-xs font-medium text-white/85">{node.title}</span>
                </div>
                <img src={node.src} width={960} height={540} alt={`${node.title} (${node.tag})`} loading="lazy" className="aspect-video w-full object-cover" />
                <div className={cx("px-2.5 py-1.5 t-overline", node.hot ? "text-accent" : "text-white/40")}>{node.tag}</div>
              </div>
              {index < NODES.length - 1 && <span className="wire absolute top-1/2 -right-6 h-px w-6" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RecentClips({ clips, onOpen }) {
  return (
    <section className="flex flex-col gap-5 border-t border-white/10 pt-10">
      <SectionHead overline="Recent clips" title="Pick up a clip already on the server" body="Clips are shared on this demo server. Opening one takes you to the tracking step." />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 9).map((clip) => (
          <li key={clip.clip_id}>
            <button type="button" onClick={() => onOpen(clip)} className="flex w-full items-center gap-3 rounded-[10px] border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left hover:bg-white/[0.05]">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-white/[0.05] text-white/60"><Icon name="film" /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{clip.filename}</span>
                <span className="block truncate text-xs text-white/40 tnum">{clipLine(clip)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ServerMark({ server }) {
  if (!server) return <span className="text-xs text-faint">Connecting…</span>;
  if (server.error) return <span className="text-xs text-err">Server not reachable</span>;
  return null;
}
