"use client";

import { useEffect, useState } from "react";
import { listClips } from "../lib/api";
import { clipLine } from "../lib/cue";
import { Alert, Btn, Icon } from "./ui";

export default function HomeScreen({ server, onNew, onOpen }) {
  const [clips, setClips] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    listClips().then(setClips).catch((err) => { setClips([]); setError(err); });
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="flex h-full flex-col">
      <header className="flex h-12 flex-none items-center gap-3 border-b border-line px-4">
        <Icon name="home" className="text-mute" />
        <h1 className="text-base font-semibold">Shots</h1>
        <span className="flex-1" />
        <ServerMark server={server} />
        <Btn variant="primary" icon="upload" onClick={onNew}>New shot</Btn>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[960px] flex-col gap-4 px-6 py-6">
          {error && <Alert error={error} action={<Btn variant="primary" onClick={load}>Try again</Btn>}>Clips could not be loaded</Alert>}
          {clips === null && <p className="text-sm text-faint">Loading clips…</p>}
          {clips && clips.length === 0 && !error && (
            <div className="mt-10 rounded-lg border-2 border-dashed border-line2 bg-panel px-8 py-14 text-center">
              <h2 className="text-xl font-semibold">No shots yet</h2>
              <p className="mx-auto mt-1 max-w-[440px] text-sm text-mute">Upload a clip and click the hand. CueFX follows it and renders a stand-in on the footage.</p>
              <Btn variant="primary" icon="upload" className="mt-4" onClick={onNew}>New shot</Btn>
            </div>
          )}
          {clips && clips.length > 0 && (
            <>
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-semibold">Your shots</h2>
                <span className="text-sm text-faint tnum">{clips.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {clips.map((clip) => (
                  <li key={clip.clip_id}>
                    <button type="button" onClick={() => onOpen(clip)} className="flex w-full items-center gap-4 rounded-md border border-line bg-panel px-3 py-3 text-left hover:border-line2 hover:bg-raised">
                      <span className="flex h-10 w-10 items-center justify-center rounded border border-line2 text-mute"><Icon name="film" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{clip.filename}</span>
                        <span className="block text-xs text-faint tnum">{clipLine(clip)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export function ServerMark({ server }) {
  if (!server) return <span className="text-xs text-faint">Connecting…</span>;
  if (server.error) return <span className="text-xs text-err">Server not reachable</span>;
  return <span className="text-xs text-mute tnum">v{server.version} · contract {server.contract_version}</span>;
}
