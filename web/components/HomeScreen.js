"use client";

import { useEffect, useRef, useState } from "react";
import { listClips } from "../lib/api";
import { clipLine } from "../lib/cue";
import { Alert, Btn, Icon, cx } from "./ui";

// Videos and their poster stills live in web/public/showcase.
const TAKES = [
  { id: "input", label: "Input", file: "1_input.mp4" },
  { id: "prompted", label: "Prompted", file: "2_problem.mp4" },
  { id: "directed", label: "Directed", file: "4_output.mp4", accent: true },
];

const MOTION_LINE = "Follow the lead hand through the kick and release off the fist. The directed take holds that path. The prompted take leaves the hand.";

export default function HomeScreen({ onNew, onOpen }) {
  const [clips, setClips] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    listClips().then(setClips).catch((err) => { setClips([]); setError(err); });
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="flex max-h-64 w-full flex-none flex-col border-b border-line bg-panel md:max-h-none md:w-72 md:border-b-0 md:border-r">
        <header className="flex h-12 flex-none items-center gap-2 border-b border-line px-3">
          <Icon name="home" className="text-mute" />
          <h1 className="text-sm font-semibold">Shots</h1>
          {clips && !error && <span className="text-xs text-faint tnum">{clips.length}</span>}
          <span className="flex-1" />
          <Btn variant="primary" icon="upload" onClick={onNew}>Try it out</Btn>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && <Alert error={error} action={<Btn variant="primary" onClick={load}>Try again</Btn>}>Clips could not be loaded</Alert>}
          {clips === null && !error && <p className="px-2 py-3 text-sm text-faint">Loading clips…</p>}
          {clips && clips.length === 0 && !error && (
            <div className="rounded-md border border-dashed border-line2 px-3 py-6 text-center">
              <p className="text-sm font-semibold">No shots yet</p>
              <p className="mt-1 text-xs text-mute">Upload a clip and click the hand. CueFX follows it and renders a stand-in on the footage.</p>
              <Btn variant="primary" icon="upload" className="mt-3" onClick={onNew}>Try it out</Btn>
            </div>
          )}
          {clips && clips.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {clips.map((clip) => (
                <li key={clip.clip_id}>
                  <button type="button" onClick={() => onOpen(clip)} className="flex w-full items-center gap-3 rounded-md border border-line bg-bg px-2.5 py-2.5 text-left hover:border-line2 hover:bg-raised">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded border border-line2 text-mute"><Icon name="film" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{clip.filename}</span>
                      <span className="block truncate text-xs text-faint tnum">{clipLine(clip)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1080px] flex-col px-6 py-6">
          <Showcase />
        </div>
      </div>
    </main>
  );
}

// The takes start together once every video can play through, and restart together
// once every one has ended, so a shorter take holds its last frame instead of drifting.
function Showcase() {
  const videos = useRef([]);

  useEffect(() => {
    const all = videos.current.filter(Boolean);
    const loaded = new Set();
    let ended = new Set();
    let started = false;
    const live = () => all.filter((video) => !video.error);
    const playAll = () => {
      for (const video of live()) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    };
    const maybeStart = () => {
      if (started || !live().every((video) => loaded.has(video))) return;
      started = true;
      playAll();
    };
    const onReady = (event) => { loaded.add(event.target); maybeStart(); };
    const onEnded = (event) => {
      ended.add(event.target);
      if (!live().every((video) => ended.has(video))) return;
      ended = new Set();
      playAll();
    };
    for (const video of all) {
      video.addEventListener("canplaythrough", onReady);
      video.addEventListener("ended", onEnded);
      video.addEventListener("error", maybeStart);
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) loaded.add(video);
    }
    maybeStart();
    return () => {
      for (const video of all) {
        video.removeEventListener("canplaythrough", onReady);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", maybeStart);
      }
    };
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.22em] text-track">In the video</p>
        <h2 className="mt-1.5 text-2xl font-semibold tracking-tight">Control the effect.</h2>
        <p className="mt-1 max-w-[520px] text-sm text-mute">Same kick. The path decides where the effect lands.</p>
      </div>
      <div className="rounded-md bg-black px-2 pb-4 pt-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TAKES.map((take, index) => (
            <Take key={take.id} take={take} videoRef={(node) => { videos.current[index] = node; }} />
          ))}
        </div>
      </div>
      <TypedPrompt />
      <img
        src="/showcase/under-the-hood.jpg"
        width={1024}
        height={382}
        alt="Under the hood: footage, MediaPipe body tracking, a CueFX directed path, layout control, an LTX-2.5 render in ComfyUI, and the final composite."
        className="w-full rounded-md bg-black"
      />
    </section>
  );
}

function TypedPrompt() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(MOTION_LINE.length);
      return;
    }
    let n = 0;
    let timer = 0;
    const step = () => {
      n += 1;
      setCount(n);
      if (n >= MOTION_LINE.length) return;
      const previous = MOTION_LINE[n - 1];
      timer = window.setTimeout(step, previous === "." || previous === "," ? 280 : 26);
    };
    timer = window.setTimeout(step, 420);
    return () => window.clearTimeout(timer);
  }, []);

  const done = count >= MOTION_LINE.length;

  return (
    <div className="rounded-md border border-line bg-panel p-3" aria-label={MOTION_LINE}>
      <p className="text-2xs font-semibold uppercase tracking-wider text-mute">Prompt</p>
      <p className="mt-1.5 min-h-[4.75rem] rounded border border-line bg-field px-2.5 py-2 text-sm leading-5 text-ink" aria-hidden="true">
        {MOTION_LINE.slice(0, count)}
        {!done && <span className="caret ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-ink align-middle" />}
      </p>
    </div>
  );
}

function Take({ take, videoRef }) {
  return (
    <figure className="min-w-0">
      <div className="relative aspect-[336/192] overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={`/showcase/${take.file}`}
          poster={`/showcase/${take.id}.jpg`}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="auto"
        />
      </div>
      <figcaption className={cx("mt-3 text-center text-xs font-semibold uppercase tracking-[0.28em]", take.accent ? "text-[#56b4e9]" : "text-white/75")}>
        <span className={take.accent ? "border-b-2 border-[#56b4e9] pb-1" : undefined}>{take.label}</span>
      </figcaption>
    </figure>
  );
}

export function ServerMark({ server }) {
  if (!server) return <span className="text-xs text-faint">Connecting…</span>;
  if (server.error) return <span className="text-xs text-err">Server not reachable</span>;
  return <span className="text-xs text-mute tnum">v{server.version} · contract {server.contract_version}</span>;
}
