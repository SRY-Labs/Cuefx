"use client";

import { useEffect, useRef, useState } from "react";
import { listClips } from "../lib/api";
import { LOOKS, clipLine } from "../lib/cue";
import { HERO_FPS, HERO_FRAMES, HERO_PATH } from "../lib/heroPath";
import { BAR_BEHAVIOURS, BAR_PARTS, PRESETS, presetFrom } from "../lib/presets";
import { LookStill } from "./LookPicker";
import { Icon, cx } from "./ui";

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

const CLIPS = [
  { id: "sample", name: "Sample · rooftop kick", note: "Ready to go, no upload" },
  { id: "upload", name: "Your clip", note: "Choose a file when you start" },
];

const BEHAVIOUR_TAG = { hold_throw: "Hold + throw", charge_up: "Charge up", orbit: "Orbit", hold: "Hold" };
const LOOK_GLOW = { fireball: "255 179 92", blue_plasma: "159 212 255", electric_orb: "214 200 255", ice_sphere: "223 244 255", shadow_energy: "154 115 230" };

export default function HomeScreen({ onStart, onOpen }) {
  const [clips, setClips] = useState(null);
  const [setup, setSetup] = useState({ clip: "sample", track: 0, behaviour: "hold_throw", look: "blue_plasma" });
  const top = useRef(null);

  useEffect(() => { listClips().then(setClips).catch(() => setClips([])); }, []);

  function start() {
    const look = LOOKS.find((item) => item.id === setup.look) || LOOKS[1];
    const point = BAR_PARTS[setup.track] || BAR_PARTS[0];
    onStart({
      useSample: setup.clip === "sample",
      preset: presetFrom({ behaviour: setup.behaviour, look: look.id, lookName: look.name }),
      track: { part: point.part, side: point.side },
    });
  }

  // A preset card fills the bar and brings it back into view, so there is one place where a shot is set up.
  function applyPreset(preset) {
    setSetup((current) => ({ ...current, behaviour: preset.behaviour, look: preset.look }));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="h-full overflow-y-auto bg-bg">
      <section ref={top} className="mx-auto flex max-w-[1200px] scroll-mt-4 flex-col items-center px-4 pt-12 pb-10 text-center sm:px-6 sm:pt-16">
        <span className="inline-flex h-7 items-center gap-2 rounded-full border border-line2 px-3 t-overline text-mute">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Directed VFX · ComfyUI + LTX-2.5
        </span>
        <h1 className="hero-title mt-5 max-w-[900px] text-ink">Direct the effect.<br />Don&apos;t just prompt it.</h1>
        <p className="mt-4 max-w-[620px] text-[17px] leading-[26px] text-mute">
          CueFX tracks the body in your clip, lets you draw where the effect goes, and renders it on your footage. The shot below is set up and ready.
        </p>
        <DirectBar setup={setup} setSetup={setSetup} onStart={start} />
        <p className="mt-3 text-[13px] text-faint">Up to 15 seconds · one person in frame · about a minute to a first preview</p>
      </section>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-4 pb-16 sm:px-6">
        <Monitor />
        <Presets onPreset={applyPreset} />
        {clips && clips.length > 0 && <RecentClips clips={clips} onOpen={onOpen} />}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ the direct bar */

/**
 * The shot set up in four choices, in the order the flow runs: clip, body point, behaviour, look.
 * Every chip is a real control; "Try this shot" starts the flow with all four already applied.
 */
function DirectBar({ setup, setSetup, onStart }) {
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

  const look = LOOKS.find((item) => item.id === setup.look) || LOOKS[1];
  const point = BAR_PARTS[setup.track] || BAR_PARTS[0];
  const behaviour = BAR_BEHAVIOURS.find((item) => item.id === setup.behaviour) || BAR_BEHAVIOURS[0];
  const clip = CLIPS.find((item) => item.id === setup.clip) || CLIPS[0];
  const pick = (patch) => { setSetup((current) => ({ ...current, ...patch })); setOpen(null); };

  const chips = [
    {
      id: "clip", label: "Clip", value: clip.name, tone: "text-mute",
      icon: <Icon name="film" size={16} className="flex-none text-mute" />,
      options: CLIPS.map((item) => ({ key: item.id, name: item.name, note: item.note, selected: item.id === setup.clip, pick: () => pick({ clip: item.id }) })),
    },
    {
      id: "track", label: "Track", value: point.name, tone: "text-track",
      options: BAR_PARTS.map((item, index) => ({ key: item.name, name: item.name, selected: index === setup.track, pick: () => pick({ track: index }) })),
    },
    {
      id: "behaviour", label: "Path", value: behaviour.name, tone: "text-path",
      options: BAR_BEHAVIOURS.map((item) => ({ key: item.id, name: item.name, note: item.note, selected: item.id === setup.behaviour, pick: () => pick({ behaviour: item.id }) })),
    },
    {
      id: "look", label: "Look", value: look.name, tone: "text-mute",
      icon: <span className="block h-6 w-6 flex-none overflow-hidden rounded-full bg-black"><LookStill id={look.id} className="h-full w-full" /></span>,
      options: LOOKS.map((item) => ({ key: item.id, name: item.name, note: item.note, selected: item.id === setup.look, pick: () => pick({ look: item.id }), art: item.id })),
    },
  ];

  return (
    <div ref={bar} role="group" aria-label="Shot setup"
      className="mt-8 flex w-full max-w-[1040px] flex-col gap-1 rounded-[20px] border border-line2 bg-panel p-2 text-left sm:flex-row sm:items-center">
      {chips.map((chip, index) => (
        <div key={chip.id} className="flex items-center">
          {index > 0 && <span aria-hidden="true" className="mr-1 hidden h-7 w-px flex-none bg-line sm:block" />}
          <div className="relative w-full sm:w-auto">
            <button type="button" aria-haspopup="listbox" aria-expanded={open === chip.id} onClick={() => setOpen(open === chip.id ? null : chip.id)}
              className={cx("flex h-[52px] w-full items-center gap-2.5 rounded-[14px] px-3.5 text-left transition-colors hover:bg-raised", open === chip.id && "bg-raised")}>
              {chip.icon}
              <span className="flex min-w-0 flex-col">
                <span className={cx("t-overline", chip.tone)}>{chip.label}</span>
                <span className="truncate text-sm font-medium text-ink">{chip.value}</span>
              </span>
              <Icon name="chevDown" size={14} className="ml-auto flex-none text-faint sm:ml-1" />
            </button>
            {open === chip.id && (
              <ul role="listbox" aria-label={chip.label}
                className="absolute top-[calc(100%+8px)] left-0 z-20 flex w-[260px] flex-col gap-0.5 rounded-[14px] border border-line2 bg-panel p-1.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)]">
                {chip.options.map((option) => (
                  <li key={option.key}>
                    <button type="button" role="option" aria-selected={option.selected} onClick={option.pick}
                      className={cx("flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-raised", option.selected && "bg-raised")}>
                      {option.art && <span className="block h-7 w-7 flex-none overflow-hidden rounded-full bg-black"><LookStill id={option.art} className="h-full w-full" /></span>}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium text-ink">{option.name}</span>
                        {option.note && <span className="truncate text-xs text-faint">{option.note}</span>}
                      </span>
                      {option.selected && <Icon name="check" size={14} className="flex-none text-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
      <span className="hidden flex-1 sm:block" />
      <button type="button" onClick={onStart}
        className="mt-1 inline-flex h-[52px] flex-none items-center justify-center gap-2 rounded-[14px] bg-accent px-6 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hi sm:mt-0">
        <Icon name={setup.clip === "sample" ? "play" : "upload"} size={16} />
        {setup.clip === "sample" ? "Try this shot" : "Choose a clip"}
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
        <div role="group" aria-label="Take" className="inline-flex rounded-full border border-line bg-panel p-[3px]">
          {["prompted", "directed"].map((id) => (
            <button key={id} type="button" aria-pressed={take === id} onClick={() => setTake(id)}
              className={cx("h-[30px] rounded-full px-3.5 text-[13px] font-medium capitalize transition-colors", take === id ? "bg-raised text-ink" : "text-mute hover:text-ink")}>
              {id}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-faint">Example result · same kick, same model. {TAKES[take].note}</span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-[20px] border border-line bg-black">
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
      <p className="t-overline text-accent">{overline}</p>
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
      <SectionHead overline="Presets" title="Start from a preset" body="A preset sets the path and the look in the bar above. You can change both in the editor." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <li key={preset.id}>
            <button type="button" onClick={() => onPreset(preset)} style={{ "--glow": LOOK_GLOW[preset.look] }}
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
