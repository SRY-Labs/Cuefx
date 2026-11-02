"use client";

import { useEffect, useState } from "react";
import Editor from "../components/Editor";
import HomeScreen, { ServerMark } from "../components/HomeScreen";
import NewShot from "../components/NewShot";
import { IconBtn } from "../components/ui";
import { health } from "../lib/api";

export default function Page() {
  const [view, setView] = useState("home");
  const [clip, setClip] = useState(null);
  const [shot, setShot] = useState(null);
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
    window.localStorage.setItem("cuefx-theme", next);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex h-12 flex-none items-center gap-3 border-b border-line bg-panel px-3 text-xs text-mute">
        <span className="font-semibold text-ink">CueFX</span>
        <span className="flex-1" />
        <ServerMark server={server} />
        <IconBtn icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"} onClick={toggleTheme} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "home" && (
          <HomeScreen
            onNew={() => { setClip(null); setShot(null); setView("new"); }}
            onOpen={(next) => { setClip(next); setShot(null); setView("new"); }}
          />
        )}
        {view === "new" && (
          <NewShot
            initialClip={clip}
            onBack={() => setView("home")}
            onReady={(nextClip, created) => { setClip(nextClip); setShot(created); setView("editor"); }}
          />
        )}
        {view === "editor" && shot && (
          <Editor clip={clip} created={shot} onBack={() => setView("home")} />
        )}
      </div>
    </div>
  );
}
