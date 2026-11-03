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
  { id: "track", label: "Tracking", from: 0, to: 79, tone: "bg-track/20 text-track", dot: "bg-track" },
  { id: "held", label: "Held", from: 79, to: 100, tone: "bg-ph-held/25 text-ph-held", dot: "bg-ph-held" },
  { id: "flight", label: "Flight", from: 100, to: 214, tone: "bg-path/20 text-path", dot: "bg-path" },
  { id: "burst", label: "Burst", from: 214, to: 240, tone: "bg-occ/25 text-occ", dot: "bg-occ" },
];
const PATH = HERO_PATH.filter(([f]) => f <= 214);
const KEYS = PATH.filter((_, index) => index % 12 === 0);

const TAKES = {
  directed: { src: "/showcase/4_output_web.mp4", poster: "/showcase/directed.jpg", note: "The effect holds the path drawn in CueFX." },
  prompted: { src: "/showcase/2_problem_web.mp4", poster: "/showcase/prompted.jpg", note: "Prompt only: the effect leaves the hand." },
};

const STEPS = [
  { icon: "upload", title: "Upload a clip", body: "Up to 15 s, one person in frame", tone: "text-ink" },
  { icon: "target", title: "Check the tracking", body: "MediaPipe follows the body", tone: "text-track" },
  { icon: "route", title: "Direct and render", body: "Draw the path, pick a look", tone: "text-path" },
];

const BEHAVIOUR_TAG = { hold_throw: "Hold + throw", charge_up: "Charge up", orbit: "Orbit", hold: "Hold" };
const LOOK_GLOW = { fireball: "255 179 92", blue_plasma: "159 212 255", electric_orb: "214 200 255", ice_sphere: "223 244 255", shadow_energy: "154 115 230" };

export default function HomeScreen({ onNew, onOpen, onSample, onPreset }) {
  const [clips, setClips] = useState(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  return (
    <main className="h-full overflow-y-auto bg-bg">
      <Hero onSample={onSample} onNew={onNew} />
      <div className="mx-auto flex max-w-[1280px] flex-col gap-12 px-4 pb-16 sm:px-6 lg:px-10">
        <Presets onPreset={onPreset} />
        {clips && clips.length > 0 && <RecentClips clips={clips} onOpen={onOpen} />}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ onSample, onNew }) {
  return (
    <section className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 py-10 sm:px-6 lg:min-h-[calc(100dvh-48px)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:px-10 lg:py-8">
      <div className="flex flex-col items-start gap-6">
        <span className="inline-flex h-7 items-center gap-2 rounded-full border border-line2 px-3 t-overline text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Directed VFX · ComfyUI + LTX-2.5
        </span>
        <h1 className="hero-title text-ink">Make the effect follow the <span className="text-path">move</span>.</h1>
        <p className="max-w-[480px] text-[17px] leading-[26px] text-mute">
          Prompted effects drift off the hand. CueFX tracks the body in your clip, lets you draw where the effect goes, and renders it on your footage.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSample}
            className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hi">
            <Icon name="play" size={16} /> Try the sample clip
          </button>
          <button type="button" onClick={onNew}
            className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-line2 bg-panel px-5 text-[15px] font-medium text-ink transition-colors hover:bg-raised">
            <Icon name="upload" size={16} /> Upload your clip
          </button>
        </div>
        <Steps />
      </div>
      <Monitor />
    </section>
  );
}

/**
 * The three stages on one card, joined by a line through their icons, so the order reads from the line
 * rather than from numbers. The icons take the colours the editor uses: tracking blue, path yellow.
 * Side by side from 640px; stacked below, with the line running down.
 */
function Steps() {
  return (
    <div className="mt-2 w-full rounded-[14px] border border-line bg-panel p-5">
      <p className="t-overline mb-4 text-faint">How it works</p>
      <ol className="relative grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
        <span aria-hidden="true" className="absolute top-[18px] bottom-[18px] left-[18px] w-px bg-line2 sm:hidden" />
        <span aria-hidden="true" className="absolute top-[18px] left-[18px] hidden h-px bg-line2 sm:block" style={{ right: "calc((100% - 32px) / 3 - 18px)" }} />
        {STEPS.map((step) => (
          <li key={step.title} className="relative flex items-start gap-3 sm:flex-col sm:gap-3">
            <span className={cx("relative grid h-9 w-9 flex-none place-items-center rounded-full border border-line2 bg-bg", step.tone)}>
              <Icon name={step.icon} size={16} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-ink">{step.title}</span>
              <span className="text-[13px] leading-[18px] text-faint">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The showcase take as a director's monitor: the directed path drawn live over the footage, with the prompted take one click away. */
function Monitor() {
  const video = useRef(null);
  const [take, setTake] = useState("directed");
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
  }, [take]);

  const directed = take === "directed";
  const phase = PHASES.find((item) => frame >= item.from && frame < item.to) || PHASES[0];
  const travelled = PATH.filter(([f]) => f <= frame);
  const here = travelled[travelled.length - 1];
  const live = here && frame <= 214;
  const line = (points) => points.map(([, x, y]) => `${(x * 160).toFixed(2)},${(y * 90).toFixed(2)}`).join(" ");
  const showHud = directed && hud;

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Take" className="inline-flex rounded-full border border-line bg-panel p-[3px]">
          {["prompted", "directed"].map((id) => (
            <button key={id} type="button" aria-pressed={take === id} onClick={() => setTake(id)}
              className={cx("h-[30px] rounded-full px-3.5 text-[13px] font-medium capitalize transition-colors", take === id ? "bg-raised text-ink" : "text-mute hover:text-ink")}>
              {id}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-faint">Same kick, same model. {TAKES[take].note}</span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-line bg-black">
        <video key={take} ref={video} src={TAKES[take].src} poster={TAKES[take].poster} muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" />
        {showHud && (
          <svg viewBox="0 0 160 90" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <polyline points={line(PATH)} fill="none" stroke="rgb(var(--c-path))" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {travelled.length > 1 && <polyline points={line(travelled)} fill="none" stroke="rgb(var(--c-path))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {KEYS.map(([f, x, y]) => (
              <g key={f} opacity={f <= frame ? 1 : 0.45}>
                <rect x={x * 160 - 1.1} y={y * 90 - 1.1} width="2.2" height="2.2" transform={`rotate(45 ${x * 160} ${y * 90})`} fill="rgb(var(--c-path))" stroke="black" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                <text x={x * 160 + 2.2} y={y * 90 - 1.6} fontSize="2.2" fontWeight="600" fill="rgb(var(--c-path))" className="hud-text">f{f}</text>
              </g>
            ))}
            {live && (
              <g>
                <circle cx={here[1] * 160} cy={here[2] * 90} r="5" fill="none" stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <path d={`M${here[1] * 160 - 8} ${here[2] * 90}h3M${here[1] * 160 + 5} ${here[2] * 90}h3M${here[1] * 160} ${here[2] * 90 - 8}v3M${here[1] * 160} ${here[2] * 90 + 5}v3`} stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </svg>
        )}
        <span className="pointer-events-none absolute top-3 left-3 inline-flex h-[26px] items-center gap-2 rounded-full bg-black/70 px-2.5 text-xs font-medium text-white/90">
          <span className={cx("h-1.5 w-1.5 rounded-full", directed ? "bg-accent" : "bg-white/50")} />
          {directed ? "Directed take · foot, left" : "Prompted take"}
        </span>
        {directed && (
          <span className="pointer-events-none absolute top-3 right-3 inline-flex h-[26px] items-center gap-2 rounded-full bg-black/70 px-2.5 text-xs font-medium text-white/90"><span className={cx("h-1.5 w-1.5 rounded-full", phase.dot)} />{phase.label}</span>
        )}
        {directed && (
          <button type="button" onClick={() => setHud((value) => !value)} aria-pressed={hud}
            className="absolute right-3 bottom-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/70 px-3 text-xs font-medium text-white/90 hover:bg-black/85">
            <Icon name="route" size={13} /> {hud ? "Hide path" : "Show path"}
          </button>
        )}
      </div>

      <div className="relative flex h-7 overflow-hidden rounded-[6px] text-[11px] font-semibold" aria-label="Shot timeline">
        {PHASES.map((item) => (
          <span key={item.id} className={cx("flex items-center overflow-hidden px-2.5 whitespace-nowrap", directed ? item.tone : "bg-raised text-faint")}
            style={{ width: `${((item.to - item.from) / HERO_FRAMES) * 100}%` }}>{directed ? item.label : ""}</span>
        ))}
        {!directed && <span className="absolute inset-0 flex items-center px-2.5 text-faint">No cue: the model decides the timing</span>}
        <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(frame / HERO_FRAMES) * 100}%` }} />
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ below the fold */

function SectionHead({ overline, title, body, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-[640px] flex-col gap-1.5">
        <p className="t-overline text-accent">{overline}</p>
        <h2 className="section-title text-ink">{title}</h2>
        {body && <p className="text-sm text-mute">{body}</p>}
      </div>
      {action}
    </div>
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
    <section className="flex flex-col gap-5 border-t border-line pt-10">
      <SectionHead overline="Start from a preset" title="Pick what the effect does" body="Each preset sets the behaviour, the look and the prompt. You can change all three in the editor." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <li key={preset.id}>
            <button type="button" onClick={() => onPreset(preset.id)} style={{ "--glow": LOOK_GLOW[preset.look] }}
              className="preset-card group flex h-full w-full items-center gap-4 rounded-[14px] border border-line bg-panel p-3 text-left transition-colors hover:bg-raised">
              <span className="block h-20 w-20 flex-none overflow-hidden rounded-[10px] bg-black p-2">
                <LookStill id={preset.look} className="h-full w-full transition-transform duration-300 group-hover:scale-110" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-1.5 text-faint">
                  <MotionGlyph behaviour={preset.behaviour} />
                  <span className="t-overline">{BEHAVIOUR_TAG[preset.behaviour]}</span>
                </span>
                <span className="t-h3 text-ink">{preset.name}</span>
                <span className="line-clamp-2 text-[13px] leading-[18px] text-mute">{preset.note}</span>
              </span>
              <Icon name="chevRight" size={16} className="flex-none text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentClips({ clips, onOpen }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead overline="Recent clips" title="Pick up a clip already on the server" body="Clips are shared on this demo server. Opening one takes you to the tracking step." />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 6).map((clip) => (
          <li key={clip.clip_id}>
            <button type="button" onClick={() => onOpen(clip)} className="flex w-full items-center gap-3 rounded-[10px] border border-line bg-panel px-3 py-2.5 text-left hover:bg-raised">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-bg text-mute"><Icon name="film" /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{clip.filename}</span>
                <span className="block truncate text-xs text-faint tnum">{clipLine(clip)}</span>
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
