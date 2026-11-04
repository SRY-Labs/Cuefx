"use client";

import { useEffect, useState } from "react";
import Editor from "../components/Editor";
import HomeScreen from "../components/HomeScreen";
import { health } from "../lib/api";

export default function Page() {
  const [view, setView] = useState("home");
  const [source, setSource] = useState(null);
  const [preset, setPreset] = useState(null);
  const [session, setSession] = useState(0);
  const [server, setServer] = useState(null);

  // Dark only for now. The light tokens stay in globals.css for later.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    health().then(setServer).catch((error) => setServer({ error }));
  }, []);

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
      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "home" && (
          <HomeScreen
            server={server}
            onStart={({ source: nextSource, preset: nextPreset }) => open(nextSource, nextPreset)}
            onOpen={(clip, nextPreset) => open({ kind: "clip", clip }, nextPreset)}
          />
        )}
        {view === "editor" && source && <Editor key={session} source={source} preset={preset} onBack={home} />}
      </div>
    </div>
  );
}
