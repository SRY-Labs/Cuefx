"use client";

import { useEffect, useState } from "react";
import Editor from "../components/Editor";
import HomeScreen, { ServerMark } from "../components/HomeScreen";
import { IconBtn } from "../components/ui";
import { health } from "../lib/api";

export default function Page() {
  const [view, setView] = useState("home");
  const [source, setSource] = useState(null);
  const [preset, setPreset] = useState(null);
  const [session, setSession] = useState(0);
  const [server, setServer] = useState(null);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("cuefx-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
    health().then(setServer).catch((error) => setServer({ error }));
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { window.localStorage.setItem("cuefx-theme", next); } catch { /* storage can be blocked */ }
  }

  function open(nextSource, nextPreset) {
    setSource(nextSource);
    setPreset(nextPreset || null);
    setSession((value) => value + 1);
    setView("editor");
  }

  function home() {
    setView("home");
    setSource(null);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className={`flex h-12 flex-none items-center gap-3 border-b px-4 text-xs text-mute ${view === "home" ? "border-line bg-bg" : "border-line bg-panel"}`}>
        <button type="button" onClick={view === "editor" ? undefined : home} disabled={view === "editor"} className="flex items-center gap-2 rounded-[10px] px-1 py-1 disabled:cursor-default" aria-label="CueFX home">
          <span className="grid h-6 w-7 place-items-center rounded-[6px] bg-accent text-on-accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 18c4-9 10-12 16-12M17 3l3 3-3 3" /><circle cx="6" cy="17" r="2" />
            </svg>
          </span>
          <span className="t-h2 text-ink">CueFX</span>
        </button>
        <span className="flex-1" />
        <ServerMark server={server} />
        <IconBtn icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"} onClick={toggleTheme} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "home" && (
          <HomeScreen
            onStart={({ source: nextSource, preset: nextPreset }) => open(nextSource, nextPreset)}
            onOpen={(clip, nextPreset) => open({ kind: "clip", clip }, nextPreset)}
          />
        )}
        {view === "editor" && source && <Editor key={session} source={source} preset={preset} onBack={home} />}
      </div>
    </div>
  );
}
