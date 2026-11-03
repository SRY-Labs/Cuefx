"use client";

import { useEffect, useRef, useState } from "react";
import { listClips } from "../lib/api";
import { clipLine } from "../lib/cue";
import { PRESETS } from "../lib/presets";
import { LookStill } from "./LookPicker";
import { Btn, Icon, cx } from "./ui";

const BEHAVIOUR_TAG = { hold_throw: "Hold + throw", charge_up: "Charge up", orbit: "Orbit", hold: "Hold" };

const STEPS = [
  { title: "Upload a clip", body: "Up to 15 seconds, one person in frame. Or start from our sample." },
  { title: "Check the tracking", body: "MediaPipe follows the fist, palm, foot or head you pick, frame by frame." },
  { title: "Direct and render", body: "Draw where the effect goes, pick a look, and render it on your footage." },
];

const HOOD = [
  { src: "/showcase/hood-1-footage.jpg", title: "Footage", tag: "Input" },
  { src: "/showcase/hood-2-tracking.jpg", title: "Body tracking", tag: "MediaPipe" },
  { src: "/showcase/hood-3-path.jpg", title: "Directed path", tag: "CueFX" },
  { src: "/showcase/hood-4-layout.jpg", title: "Layout pass", tag: "Control" },
  { src: "/showcase/hood-5-render.jpg", title: "LTX-2.5 render", tag: "ComfyUI" },
  { src: "/showcase/hood-6-composite.jpg", title: "Final composite", tag: "Output" },
];

export default function HomeScreen({ onNew, onOpen, onSample, onPreset }) {
  const [clips, setClips] = useState(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-6 sm:px-6 sm:py-8">
        <Hero onSample={onSample} onNew={onNew} />
        <Presets onPreset={onPreset} />
        <HowItWorks />
        <UnderTheHood />
        {clips && clips.length > 0 && <RecentClips clips={clips} onOpen={onOpen} />}
      </div>
    </main>
  );
}

function Hero({ onSample, onNew }) {
  return (
    <section className="grid items-center gap-6 rounded-[14px] border border-accent/20 bg-accent/10 p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <div className="flex flex-col items-start gap-4">
        <p className="t-overline text-accent">Directed VFX · ComfyUI + LTX-2.5</p>
        <h1 className="t-hero text-ink">Make the effect follow the move.</h1>
        <p className="t-body-l max-w-[460px] text-mute">
          Prompted effects drift off the hand. CueFX tracks the body in your clip, lets you draw where the effect goes, and renders it on your footage.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Btn variant="primary" icon="play" onClick={onSample}>Try the sample clip</Btn>
          <Btn icon="upload" onClick={onNew}>Upload your clip</Btn>
        </div>
        <p className="t-body-s text-faint">mp4, mov, mkv or webm · up to 15 seconds · about a minute to your first preview</p>
      </div>
      <Compare />
    </section>
  );
}

/** Prompted vs directed on the same kick. Drag to wipe between them. */
function Compare() {
  const [split, setSplit] = useState(50);
  const base = useRef(null);
  const top = useRef(null);

  useEffect(() => {
    const a = base.current;
    const b = top.current;
    if (!a || !b) return undefined;
    const sync = () => { if (Math.abs(a.currentTime - b.currentTime) > 0.12) b.currentTime = a.currentTime; };
    const start = () => { a.play().catch(() => {}); b.play().catch(() => {}); };
    a.addEventListener("timeupdate", sync);
    a.addEventListener("play", () => b.play().catch(() => {}));
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) start();
    return () => a.removeEventListener("timeupdate", sync);
  }, []);

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <video ref={base} src="/showcase/2_problem_web.mp4" poster="/showcase/prompted.jpg" muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" />
        <video ref={top} src="/showcase/4_output_web.mp4" poster="/showcase/directed.jpg" muted loop playsInline preload="auto"
          className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${split}%` }}>
          <span className="absolute top-1/2 left-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow">
            <Icon name="sliders" size={14} />
          </span>
        </div>
        <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/70 px-2.5 py-1 t-overline text-white/85">Prompted</span>
        <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-accent px-2.5 py-1 t-overline text-on-accent">Directed</span>
        <input type="range" className="compare-range" min={0} max={100} value={split} onChange={(event) => setSplit(Number(event.target.value))}
          aria-label="Wipe between the prompted take and the directed take" />
      </div>
      <figcaption className="t-body-s text-mute">Same kick, same model. The prompted take leaves the hand. The directed take holds the path drawn in CueFX. Drag to compare.</figcaption>
    </figure>
  );
}

function SectionHead({ overline, title, body }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="t-overline text-mute">{overline}</p>
      <h2 className="t-h2 text-ink">{title}</h2>
      {body && <p className="text-sm text-mute">{body}</p>}
    </div>
  );
}

function Presets({ onPreset }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead overline="Start from a preset" title="Pick what the effect does" body="Each preset sets the behaviour, the look and the prompt. You can change all three in the editor." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <li key={preset.id}>
            <button type="button" onClick={() => onPreset(preset.id)}
              className="group flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-line bg-panel text-left hover:bg-raised">
              <span className="block h-32 w-full bg-black p-4"><LookStill id={preset.look} className="mx-auto h-full w-auto" /></span>
              <span className="flex flex-1 flex-col gap-2 p-4">
                <span className="w-fit rounded-full border border-line bg-bg px-2 py-0.5 text-2xs font-semibold text-mute">{BEHAVIOUR_TAG[preset.behaviour]}</span>
                <span className="t-h3 text-ink">{preset.name}</span>
                <span className="text-sm text-mute">{preset.note}</span>
                <span className="mt-auto flex items-center gap-1 pt-1 text-sm font-medium text-accent">Use this preset <Icon name="chevRight" size={14} /></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead overline="How it works" title="Three steps, about a minute to a first preview" />
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-2 rounded-[14px] border border-line bg-panel p-5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent tnum">{index + 1}</span>
            <span className="t-h3 text-ink">{step.title}</span>
            <span className="text-sm text-mute">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function UnderTheHood() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead overline="Under the hood" title="From footage to a directed shot" body="CueFX turns your body track and drawn path into a layout pass, then LTX-2.5 renders the effect in ComfyUI." />
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {HOOD.map((step, index) => (
          <li key={step.src} className="overflow-hidden rounded-[14px] border border-line bg-panel">
            <img src={step.src} width={960} height={540} alt={`${step.title} (${step.tag})`} loading="lazy" className="aspect-video w-full object-cover" />
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <span className="text-sm font-medium text-ink"><span className="text-faint tnum">{index + 1}. </span>{step.title}</span>
              <span className={cx("t-overline", step.tag === "ComfyUI" ? "text-accent" : "text-faint")}>{step.tag}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecentClips({ clips, onOpen }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <SectionHead overline="Recent clips" title="Pick up a clip already on the server" body="Clips are shared on this demo server. Opening one takes you to the tracking step." />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {clips.slice(0, 9).map((clip) => (
          <li key={clip.clip_id}>
            <button type="button" onClick={() => onOpen(clip)} className="flex w-full items-center gap-3 rounded-[10px] border border-line bg-panel px-3 py-2.5 text-left hover:bg-raised">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-bg text-mute"><Icon name="film" /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{clip.filename}</span>
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
