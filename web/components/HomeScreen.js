"use client";

import { useEffect, useRef, useState } from "react";
import { clipUploadIssue, frameUrl, listClips } from "../lib/api";
import { LOOKS } from "../lib/cue";
import { HERO_FPS, HERO_FRAMES, HERO_PATH } from "../lib/heroPath";
import { PRESETS, presetById } from "../lib/presets";
import { LookStill } from "./LookStill";
import { Icon, Tip, cx } from "./ui";

// Phases of the directed showcase take, in frames at 30 fps (read off the video).
const PHASES = [
  { id: "track", label: "Tracking", from: 0, to: 79, tone: "bg-track/20 text-track", dot: "bg-track" },
  { id: "held", label: "Held", from: 79, to: 100, tone: "bg-ph-held/25 text-ph-held", dot: "bg-ph-held" },
  { id: "flight", label: "Flight", from: 100, to: 214, tone: "bg-path/20 text-path", dot: "bg-path" },
  { id: "burst", label: "Burst", from: 214, to: 240, tone: "bg-occ/25 text-occ", dot: "bg-occ" },
];
const PATH = HERO_PATH;
const KEYS = PATH.filter((_, index) => index % 12 === 0);

const TAKES = {
  directed: { src: "/showcase/4_output_web.mp4", poster: "/showcase/directed.jpg", note: "The effect holds the path drawn in CueFX." },
  prompted: { src: "/showcase/2_problem_web.mp4", poster: "/showcase/prompted.jpg", note: "Prompt only: the effect leaves the body." },
};

const REPO_URL = "https://github.com/SRY-Labs/Cuefx";
const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.mkv,.webm";

function fileSeconds(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
    const timer = setTimeout(() => done(null), 4000);
    video.preload = "metadata";
    video.onloadedmetadata = () => { clearTimeout(timer); done(Number.isFinite(video.duration) ? video.duration : null); };
    video.onerror = () => { clearTimeout(timer); done(null); };
    video.src = url;
  });
}

const BEHAVIOUR_TAG = { hold_throw: "Hold + throw", charge_up: "Charge up", orbit: "Orbit", hold: "Hold" };
const LOOK_GLOW = { fireball: "255 179 92", blue_plasma: "159 212 255", electric_orb: "214 200 255", ice_sphere: "223 244 255", shadow_energy: "154 115 230" };

export default function HomeScreen({ onStart, onOpen, server }) {
  const [clips, setClips] = useState(null);
  const [setup, setSetup] = useState({ clip: "sample", file: null, seconds: null, preset: "plasma_charge" });
  const [fileError, setFileError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const top = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  async function pickFile(file) {
    if (!file) return;
    setChecking(true);
    setFileError(null);
    const issue = await clipUploadIssue(file);
    const seconds = issue ? null : await fileSeconds(file);
    setChecking(false);
    if (issue) {
      setFileError({ ...issue, name: file.name });
      setSetup((current) => ({ ...current, clip: "sample", file: null, seconds: null }));
      return;
    }
    setSetup((current) => ({ ...current, clip: "file", file, seconds }));
  }

  function start() {
    const preset = presetById(setup.preset);
    if (setup.clip === "file") {
      if (!setup.file) { fileInput.current?.click(); return; }
      onStart({ source: { kind: "file", file: setup.file }, preset });
      return;
    }
    onStart({ source: { kind: "sample" }, preset });
  }

  // A preset card fills the bar and brings it back into view, so there is one place where a shot is set up.
  function applyPreset(preset) {
    setSetup((current) => ({ ...current, preset: preset.id }));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) pickFile(file);
  }

  return (
    <main className="relative h-full overflow-y-auto bg-bg"
      onDragOver={(event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={onDrop}>
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-4 sm:px-6">
        <span className="grid h-7 w-8 place-items-center rounded-[7px] bg-accent text-on-accent">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18c4-9 10-12 16-12M17 3l3 3-3 3" /><circle cx="6" cy="17" r="2" /></svg>
        </span>
        <span className="text-[15px] font-semibold text-ink">CueFX</span>
        <span className="flex-1" />
        <ServerMark server={server} />
        <Tip title="View the code" note="CueFX on GitHub: the app, the API and the ComfyUI workflows." side="bottom">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="CueFX on GitHub"
            className="inline-flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[13px] font-medium text-mute hover:bg-raised hover:text-ink">
            <GitHubMark />GitHub
          </a>
        </Tip>
      </div>
      <section ref={top} className="mx-auto flex max-w-[1200px] scroll-mt-4 flex-col items-center px-4 pt-6 pb-10 text-center sm:px-6 sm:pt-10">
        <span className="inline-flex h-7 items-center gap-2 rounded-full bg-raised px-3 text-xs font-medium text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Directed VFX · ComfyUI + LTX-2.5
        </span>
        <h1 className="hero-title mt-5 max-w-[900px] text-ink">Direct the effect.<br />Don&apos;t just prompt it.</h1>
        <p className="mt-4 max-w-[580px] text-[17px] leading-[26px] text-mute">
          Stick an effect to the body, draw where it flies, and render it onto your footage.
        </p>
        <DirectBar setup={setup} setSetup={setSetup} onStart={start} onChooseFile={() => fileInput.current?.click()} checking={checking} />
        {fileError ? (
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[13px] text-err" role="alert">
            {fileError.message}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => fileInput.current?.click()}>Choose another clip</button>
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-faint">Or drop a video anywhere on this page · up to 15 seconds, one person in frame</p>
        )}
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; pickFile(file); }} />
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pb-16 sm:px-6">
        <Monitor />
        <Presets onPreset={applyPreset} />
        {clips && clips.length > 0 && <RecentClips clips={clips} onOpen={(clip) => onOpen(clip, presetById(setup.preset))} />}
      </div>
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-[16px] border-2 border-dashed border-line2 bg-bg/85 text-lg font-semibold text-ink">Drop to use this clip</div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ the direct bar */

/**
 * The shot set up in two choices: the clip, and a preset that sets the starting look and behaviour. The body
 * point, path and everything else are set in the editor, where they can be seen on the clip.
 */
function DirectBar({ setup, setSetup, onStart, onChooseFile, checking }) {
  const [open, setOpen] = useState(null);
  const bar = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!bar.current?.contains(event.target)) setOpen(null); };
    const key = (event) => { if (event.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const preset = presetById(setup.preset) || PRESETS[0];
  const fileName = setup.file?.name;
  const clipValue = checking ? "Checking the clip…" : setup.clip === "file" && fileName ? `${fileName}${setup.seconds ? ` · ${Math.round(setup.seconds)} s` : ""}` : "Sample · rooftop kick";

  return (
    <div ref={bar} role="group" aria-label="Shot setup"
      className="mt-8 flex w-full max-w-[760px] flex-col gap-1 rounded-[16px] border border-line2 bg-panel p-1.5 text-left sm:flex-row sm:items-center">
      <div className="relative w-full sm:w-auto sm:min-w-0">
        <button type="button" aria-haspopup="listbox" aria-expanded={open === "clip"} onClick={() => setOpen(open === "clip" ? null : "clip")}
          className={cx("flex h-[56px] w-full items-center gap-3 rounded-[12px] px-3.5 text-left transition-colors hover:bg-raised active:bg-sel", open === "clip" && "bg-raised")}>
          {setup.clip === "file" ? <Icon name="film" size={18} className="flex-none text-mute" /> : <img src="/showcase/input.jpg" alt="" className="h-7 w-11 flex-none rounded-[6px] object-cover" />}
          <span className="flex min-w-0 flex-col">
            <span className="text-[11px] font-medium text-faint">Clip</span>
            <span className="max-w-[260px] truncate text-sm font-medium text-ink">{clipValue}</span>
          </span>
          <Icon name="chevDown" size={14} className="ml-auto flex-none text-faint sm:ml-1" />
        </button>
        {open === "clip" && (
          <ul role="listbox" aria-label="Clip" className="absolute top-[calc(100%+8px)] left-0 z-20 flex w-[330px] max-w-[calc(100vw-48px)] flex-col gap-0.5 rounded-[12px] border border-line2 bg-raised p-1 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)]">
            <li>
              <button type="button" role="option" aria-selected={setup.clip === "sample"} onClick={() => { setSetup((current) => ({ ...current, clip: "sample" })); setOpen(null); }}
                className={cx("flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left hover:bg-sel/70", setup.clip === "sample" && "bg-sel")}>
                <img src="/showcase/input.jpg" alt="" className="h-8 w-14 flex-none rounded-[6px] object-cover" />
                <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium text-ink">Sample · rooftop kick</span><span className="text-xs text-faint">8 s · ready, nothing to upload</span></span>
                {setup.clip === "sample" && <Icon name="check" size={14} className="flex-none text-ink" />}
              </button>
            </li>
            {setup.file && (
              <li>
                <button type="button" role="option" aria-selected={setup.clip === "file"} onClick={() => { setSetup((current) => ({ ...current, clip: "file" })); setOpen(null); }}
                  className={cx("flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left hover:bg-sel/70", setup.clip === "file" && "bg-sel")}>
                  <span className="grid h-8 w-14 flex-none place-items-center rounded-[6px] bg-panel text-mute"><Icon name="film" size={16} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-medium text-ink">{setup.file.name}</span><span className="text-xs text-faint">{setup.seconds ? `${Math.round(setup.seconds)} s · ` : ""}uploads when you start</span></span>
                  {setup.clip === "file" && <Icon name="check" size={14} className="flex-none text-ink" />}
                </button>
              </li>
            )}
            <li>
              <button type="button" role="option" aria-selected={false} onClick={() => { setOpen(null); onChooseFile(); }}
                className="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left hover:bg-sel/70">
                <span className="grid h-8 w-14 flex-none place-items-center rounded-[6px] border border-dashed border-line2 text-ink"><Icon name="upload" size={16} /></span>
                <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium text-ink">{setup.file ? "A different clip" : "Your clip"}</span><span className="text-xs text-faint">Choose a file · up to 15 s, one person in frame</span></span>
              </button>
            </li>
          </ul>
        )}
      </div>
      <span aria-hidden="true" className="hidden h-7 w-px flex-none bg-line sm:block" />
      <div className="relative w-full sm:w-auto">
        <button type="button" aria-haspopup="listbox" aria-expanded={open === "preset"} onClick={() => setOpen(open === "preset" ? null : "preset")}
          className={cx("flex h-[56px] w-full items-center gap-3 rounded-[12px] px-3.5 text-left transition-colors hover:bg-raised active:bg-sel", open === "preset" && "bg-raised")}>
          <span className="block h-7 w-7 flex-none overflow-hidden rounded-full bg-black"><LookStill id={preset.look} className="h-full w-full" /></span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[11px] font-medium text-faint">Preset</span>
            <span className="truncate text-sm font-medium text-ink">{preset.name}</span>
          </span>
          <Icon name="chevDown" size={14} className="ml-auto flex-none text-faint sm:ml-1" />
        </button>
        {open === "preset" && (
          <ul role="listbox" aria-label="Preset" className="absolute top-[calc(100%+8px)] left-0 z-20 grid w-[min(440px,calc(100vw-48px))] grid-cols-2 gap-1 rounded-[12px] border border-line2 bg-raised p-1 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)]">
            {PRESETS.map((item) => (
              <li key={item.id}>
                <button type="button" role="option" aria-selected={item.id === setup.preset} onClick={() => { setSetup((current) => ({ ...current, preset: item.id })); setOpen(null); }}
                  className={cx("flex w-full flex-col gap-1.5 rounded-[8px] p-1.5 text-left", item.id === setup.preset ? "bg-sel" : "hover:bg-sel/60")}>
                  <span className="relative block h-16 w-full overflow-hidden rounded-[8px] bg-black">
                    <LookStill id={item.look} className="mx-auto h-full w-16" />
                    <span className="absolute bottom-1 right-1.5 text-faint"><MotionGlyph behaviour={item.behaviour} /></span>
                  </span>
                  <span className="px-0.5 text-[13px] font-medium text-ink">{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="hidden flex-1 sm:block" />
      <button type="button" onClick={onStart} disabled={checking}
        className="mt-1 inline-flex h-[56px] flex-none items-center justify-center gap-2 rounded-[12px] bg-accent px-6 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-hi disabled:opacity-50 sm:mt-0">
        {setup.clip === "file" && setup.file ? "Start this shot" : setup.clip === "file" ? "Choose a clip" : "Try this shot"}
        <Icon name="chevRight" size={16} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ the example take */

/** The showcase take at full size, with the directed path drawn live over it and the prompted take one click away. */
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
  const live = here && frame <= PATH[PATH.length - 1][0];
  const line = (points) => points.map(([, x, y]) => `${(x * 160).toFixed(2)},${(y * 90).toFixed(2)}`).join(" ");
  const showHud = directed && hud;

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Take" className="inline-flex rounded-[8px] bg-raised p-0.5">
          {["prompted", "directed"].map((id) => (
            <button key={id} type="button" aria-pressed={take === id} onClick={() => setTake(id)}
              className={cx("h-7 rounded-[6px] px-3 text-[13px] font-medium capitalize transition-colors", take === id ? "bg-sel text-ink" : "text-mute hover:text-ink")}>
              {id}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-faint">Example result · same kick, same model. {TAKES[take].note}</span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-line bg-black">
        <video key={take} ref={video} src={TAKES[take].src} poster={TAKES[take].poster} muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" />
        {showHud && (
          <svg viewBox="0 0 160 90" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <polyline points={line(PATH)} fill="none" stroke="rgb(var(--c-path))" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {travelled.length > 1 && <polyline points={line(travelled)} fill="none" stroke="rgb(var(--c-path))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            {KEYS.map(([f, x, y]) => (
              <g key={f} opacity={f <= frame ? 1 : 0.45}>
                <rect x={x * 160 - 1} y={y * 90 - 1} width="2" height="2" transform={`rotate(45 ${x * 160} ${y * 90})`} fill="rgb(var(--c-path))" stroke="black" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                <text x={x * 160 + 2} y={y * 90 - 1.5} fontSize="1.8" fontWeight="600" fill="rgb(var(--c-path))" className="hud-text">f{f}</text>
              </g>
            ))}
            {live && (
              <g>
                <circle cx={here[1] * 160} cy={here[2] * 90} r="4.5" fill="none" stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <path d={`M${here[1] * 160 - 7.5} ${here[2] * 90}h3M${here[1] * 160 + 4.5} ${here[2] * 90}h3M${here[1] * 160} ${here[2] * 90 - 7.5}v3M${here[1] * 160} ${here[2] * 90 + 4.5}v3`} stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </g>
            )}
          </svg>
        )}
        <span className="pointer-events-none absolute top-4 left-4 inline-flex h-7 items-center gap-2 rounded-full bg-black/70 px-3 text-xs font-medium text-white/90">
          <span className={cx("h-1.5 w-1.5 rounded-full", directed ? "bg-accent" : "bg-white/50")} />
          {directed ? "Directed take · tracked foot, drawn path" : "Prompted take · no path"}
        </span>
        {directed && (
          <span className="pointer-events-none absolute top-4 right-4 inline-flex h-7 items-center gap-2 rounded-full bg-black/70 px-3 text-xs font-medium text-white/90">
            <span className={cx("h-1.5 w-1.5 rounded-full", phase.dot)} />{phase.label}
          </span>
        )}
        {directed && (
          <button type="button" onClick={() => setHud((value) => !value)} aria-pressed={hud}
            className="absolute right-4 bottom-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/70 px-3.5 text-xs font-medium text-white/90 hover:bg-black/85">
            <Icon name="route" size={13} /> {hud ? "Hide path" : "Show path"}
          </button>
        )}
      </div>

      <div className="relative flex h-7 overflow-hidden rounded-[6px] text-[11px] font-semibold" aria-label="Shot timeline">
        {PHASES.map((item) => (
          <span key={item.id} className={cx("flex items-center overflow-hidden px-2.5 whitespace-nowrap", directed ? item.tone : "bg-raised text-faint")}
            style={{ width: `${((item.to - item.from) / HERO_FRAMES) * 100}%` }}>{directed ? item.label : ""}</span>
        ))}
        {!directed && <span className="absolute inset-0 flex items-center px-2.5 text-faint">No cue: the model decides where and when</span>}
        <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(frame / HERO_FRAMES) * 100}%` }} />
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ below the example */

function SectionHead({ overline, title, body }) {
  return (
    <div className="flex max-w-[640px] flex-col gap-1.5">
      <p className="text-xs font-medium text-faint">{overline}</p>
      <h2 className="section-title text-ink">{title}</h2>
      {body && <p className="text-sm text-mute">{body}</p>}
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
      <SectionHead overline="Presets" title="Start from a preset" body="A preset sets the starting look and behaviour. Everything stays editable in the editor." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <li key={preset.id} className="min-w-0">
            <button type="button" onClick={() => onPreset(preset)} style={{ "--glow": LOOK_GLOW[preset.look] }}
              className="preset-card group flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-line bg-panel text-left transition-colors hover:bg-raised active:bg-sel">
              <span className="relative block aspect-[16/9] w-full overflow-hidden bg-black">
                <LookStill id={preset.look} className="mx-auto aspect-square h-full p-3 transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute bottom-2 left-2 inline-flex h-6 items-center gap-1.5 rounded-[6px] bg-black/70 px-2 text-[11px] font-medium text-white/90">
                  <MotionGlyph behaviour={preset.behaviour} />{BEHAVIOUR_TAG[preset.behaviour]}
                </span>
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3.5">
                <span className="flex items-center gap-2 text-[15px] font-semibold leading-5 text-ink">
                  <span className="min-w-0 flex-1">{preset.name}</span>
                  <Icon name="chevRight" size={15} className="flex-none text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </span>
                <span className="text-[13px] leading-[18px] text-mute">{preset.note}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A readable name for a clip: the filename without its extension and its number-only parts. */
function clipTitle(filename = "") {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const words = base.split(/[\s_\-.]+/).filter((word) => word && !/^\d+(fps|p|k)?$/i.test(word));
  if (!words.length) return "Uploaded clip";
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Clips already on the demo server, shown by a still from each so they can be told apart. The list is shared by
 * everyone using the demo (the server keeps no owner or date), so the section says so plainly.
 */
function RecentClips({ clips, onOpen }) {
  return (
    <section className="flex flex-col gap-5 border-t border-line pt-10">
      <SectionHead overline="Clips on this demo server" title="Pick up a clip already uploaded" body="Shared by everyone using this demo. Opening one goes straight to the editor and tracks it there." />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {clips.slice(0, 6).map((clip) => {
          const seconds = clip.frames && clip.fps ? Math.round(clip.frames / clip.fps) : null;
          return (
            <li key={clip.clip_id} className="min-w-0">
              <button type="button" onClick={() => onOpen(clip)} title={clip.filename}
                className="group flex w-full flex-col overflow-hidden rounded-[10px] border border-line bg-panel text-left transition-colors hover:bg-raised active:bg-sel">
                <span className="relative block aspect-video w-full overflow-hidden bg-well">
                  <img src={frameUrl(clip.clip_id, Math.floor((clip.frames || 1) / 2))} alt="" loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                  {seconds != null && <span className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tnum">{seconds} s</span>}
                </span>
                <span className="truncate px-2.5 py-2 text-[13px] font-medium text-ink">{clipTitle(clip.filename)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function ServerMark({ server }) {
  if (!server) return <span className="text-xs text-faint">Connecting…</span>;
  if (server.error) return <span className="text-xs text-err">Server not reachable</span>;
  return null;
}
