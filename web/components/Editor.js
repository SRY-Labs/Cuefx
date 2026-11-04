"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clipUploadIssue, createCue, defaults as loadDefaults, frameUrl, normalize, preview, proposeTiming, uploadClip, validate,
} from "../lib/api";
import {
  addPathPoint, anchorAt, clipLine, cueForWire, deletePathPoint, drawnRoute, holdsOnBody, lookById, movePathPoint, moveRelease, orbAt,
  partName, partOf, phaseTimes, pointAt, setPointFrame, setTiming, sideOf, timecode, toThrow, withDiameter, withLook,
} from "../lib/cue";
import { SAMPLE_CLIP, SAMPLE_ROUTE, autoPrompt } from "../lib/presets";
import { checkPrompt } from "../lib/prompt";
import { LTX_PROMPT, STAGES, newTake, runTake, stagesOf, takeDownloads, takeMedia } from "../lib/takes";
import Inspector from "./Inspector";
import MediaLoading, { useMediaLoading } from "./MediaLoading";
import Plate, { platePoint } from "./Plate";
import TakesPlayer, { stageLine, takeProgress } from "./TakesPlayer";
import Timeline from "./Timeline";
import { Btn, Icon, Tip, cx } from "./ui";

const HISTORY_LIMIT = 100;

function seedOf(point) {
  if (!point) return null;
  return { frame: point.frame ?? point.f, x: point.x, y: point.y };
}

function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function adoptTrack(current, tracked) {
  const part = partOf(tracked);
  const next = {
    ...current,
    hand: part === "palm" ? tracked.hand : current.hand,
    hand_seed: tracked.hand_seed,
    track: tracked.track,
    anchor_offset: tracked.anchor_offset,
    corrections: [],
  };
  if (tracked.body_point) next.body_point = tracked.body_point;
  else delete next.body_point;
  return next;
}

// Settings the backend stores but does not render yet. They are not the artist's problem, so the editor hides them.
const hidden = (list) => (list || []).filter((warning) => warning.code !== "setting_not_used");

function merge(primary, extra) {
  const seen = new Set(primary.map((warning) => warning.code));
  return [...primary, ...(extra || []).filter((warning) => !seen.has(warning.code))];
}

/** The first cue the editor shows: the preset's behaviour and look, the sample's path, at a size people can see. */
function prepare(cue, preset, clip, sampleRoute) {
  let next = withLook({ ...cue }, preset?.look || "blue_plasma");
  const behaviour = preset?.behaviour || next.behaviour || "hold_throw";
  if (behaviour !== (next.behaviour || "hold_throw")) {
    if (holdsOnBody(behaviour)) next = { ...next, behaviour, release_frame: null, route: [] };
    else if (holdsOnBody(next.behaviour)) next = toThrow(next, behaviour);
    else next = { ...next, behaviour };
  }
  if (sampleRoute && !holdsOnBody(next.behaviour)) {
    const d = next.diameter_px;
    next = {
      ...next,
      appear_frame: SAMPLE_ROUTE.appear_frame,
      release_frame: SAMPLE_ROUTE.release_frame,
      vanish: { ...SAMPLE_ROUTE.vanish },
      route: [
        { f: SAMPLE_ROUTE.release_frame, x: null, y: null, diameter_px: d, easing_in: "linear" },
        ...SAMPLE_ROUTE.points.map(([f, x, y]) => ({ f, x, y, diameter_px: d, easing_in: "linear" })),
      ],
    };
  }
  const [plateW, plateH] = clip.plate_size || [1920, 1080];
  const readable = Math.round(Math.min(plateW, plateH) * 0.12);
  if (!next.diameter_px || next.diameter_px < readable) next = withDiameter(next, readable);
  return next;
}

function trackHelp(error, part) {
  if (error?.code === "no_hand" || error?.code === "no_track" || error?.code === "track_lost" || error?.code === "no_body_point") {
    return `CueFX could not find the ${part}. Check that one person is in frame and the ${part} is visible for most of the clip. Choose another body point, or pick the person on the video.`;
  }
  return error?.message || "Tracking stopped without a reason.";
}

function uploadHelp(error) {
  if (error?.code === "clip_too_long") return error.message;
  if (error?.status === 413) return "This file is larger than 500 MB.";
  return error?.message || "The clip could not be prepared.";
}

/**
 * One workspace for the whole shot: the clip uploads and tracks here, the effect is shaped here, and takes render
 * here. Nothing moves the artist between screens; background work reports in place.
 * `source` is { kind: "sample" } | { kind: "file", file } | { kind: "clip", clip }.
 */
export default function Editor({ source, preset, onBack }) {
  const sample = source.kind === "sample";
  const [clip, setClip] = useState(source.kind === "clip" ? source.clip : null);
  const [upload, setUpload] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [anchor, setAnchor] = useState(sample ? { part: SAMPLE_CLIP.part, side: SAMPLE_CLIP.side } : { part: "fist", side: "right" });
  const [trackState, setTrackState] = useState(source.kind === "clip" ? "track" : "upload");
  const [trackError, setTrackError] = useState(null);
  const [trackStarted, setTrackStarted] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [cue, setCue] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [effectRange, setEffectRange] = useState(null);
  const [orbFrames, setOrbFrames] = useState(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkError, setCheckError] = useState(null);
  const [tool, setTool] = useState("select");
  const [picking, setPicking] = useState(null);
  const [selected, setSelected] = useState(null);
  const [guides, setGuides] = useState(true);
  const [renderMenu, setRenderMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [serverDefaults, setServerDefaults] = useState(null);
  const [scale, setScale] = useState(0);
  const [promptAuto, setPromptAuto] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customLook, setCustomLook] = useState(null);
  const [videoAuto, setVideoAuto] = useState(true);
  const [customVideo, setCustomVideo] = useState("");
  const [evening, setEvening] = useState(false);
  const [takes, setTakes] = useState([]);
  const [player, setPlayer] = useState(null);
  const playerRef = useRef(null);
  playerRef.current = player;
  const [pending, setPending] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [, setHistoryTick] = useState(0);
  const onScale = useCallback((value) => setScale(value), []);
  const palms = useRef({});
  const flight = useRef(null);
  const trackReq = useRef(0);
  const cueRef = useRef(null);
  const svgRef = useRef(null);
  const origin = useRef([]);
  const history = useRef({ past: [], future: [] });
  const lastLive = useRef(0);
  const takeControllers = useRef(new Map());
  const fileInput = useRef(null);
  const localUrl = useRef(null);
  const toastTimer = useRef(0);
  cueRef.current = cue;
  const ready = trackState === "ready" && !!cue;
  const frames = clip?.frames || 1;
  const fps = clip?.fps || 24;

  useEffect(() => { loadDefaults().then(setServerDefaults).catch(() => {}); }, []);

  /* ------------------------------------------------------------ toast */
  /** A short message in the snackbar: a title, an optional line under it, a tone and up to two actions. */
  function say(text, { detail, tone = "info", action, actions, ms = 6000 } = {}) {
    clearTimeout(toastTimer.current);
    setToast({ text, detail, tone, actions: actions || (action ? [action] : []), id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ------------------------------------------------------------ upload and tracking */
  useEffect(() => {
    let stopped = false;
    (async () => {
      if (source.kind === "clip") { track(source.clip, anchor); return; }
      let file = source.file;
      if (sample) {
        setUpload({ phase: "check", name: SAMPLE_CLIP.name });
        try {
          const blob = await fetch(SAMPLE_CLIP.url).then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.blob(); });
          file = new File([blob], SAMPLE_CLIP.name, { type: "video/mp4" });
        } catch {
          if (!stopped) { setUploadError({ code: "sample_unavailable", message: "The sample clip did not load. Check the connection and try again." }); setTrackState("failed"); }
          return;
        }
      }
      if (!stopped && file) startUpload(file);
    })();
    return () => {
      stopped = true;
      flight.current?.abort();
      for (const controller of takeControllers.current.values()) controller.abort();
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    };
  }, []);

  async function startUpload(file) {
    setUploadError(null);
    setTrackError(null);
    setTrackState("upload");
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = URL.createObjectURL(file);
    setUpload({ phase: "check", name: file.name, url: localUrl.current });
    const issue = await clipUploadIssue(file);
    if (issue) {
      setUploadError(issue);
      setTrackState("failed");
      return;
    }
    setUpload({ phase: "upload", pct: 0, name: file.name, url: localUrl.current, started: Date.now() });
    try {
      const next = await uploadClip(file, (progress) => {
        setUpload((prev) => ({ ...prev, ...progress, started: progress.phase === "prepare" && prev?.phase !== "prepare" ? Date.now() : prev?.started }));
      });
      setClip(next);
      setFrame(Math.min(Math.round(next.frames / 3), next.frames - 1));
      track(next, anchor);
    } catch (err) {
      setUploadError(err);
      setTrackState("failed");
    }
  }

  /** Tracks `part`/`side` (or the clicked `seed`) on `target`. Before the first cue this fills the editor; after it,
   *  only the track changes and the path, look and timing are kept. */
  async function track(target, { part, side }, seed = null) {
    const id = ++trackReq.current;
    const first = !cueRef.current;
    setPicking(null);
    setTrackError(null);
    if (first) { setTrackState("track"); setTrackStarted(Date.now()); } else setSwitching(part);
    const hand = side || cueRef.current?.hand || "right";
    const body = { hand };
    if (part !== "palm") body.body_point = { part, side: part === "head" ? null : side };
    if (seed) body.hand_seed = seedOf(seed);
    try {
      const result = await createCue(target.clip_id, body);
      if (id !== trackReq.current) return;
      if (part === "palm") palms.current[hand] = result.cue.hand_seed;
      if (first) {
        const start = prepare(result.cue, preset, target, sample && part === SAMPLE_CLIP.part && side === SAMPLE_CLIP.side && !seed);
        origin.current = (start.route || []).map((point) => ({ ...point }));
        setCue(start);
        cueRef.current = start;
        setWarnings(hidden(result.warnings));
        setFrame(Math.min(start.appear_frame || 0, target.frames - 1));
        setTrackState("ready");
        refresh(start);
        const total = result.summary?.total || target.frames;
        const tracked = result.summary?.tracked ?? total;
        say("Tracking done", { tone: "success", detail: `The ${partName(result.cue)} is followed on ${tracked} of ${total} frames.` });
      } else {
        record(cueRef.current);
        commit(adoptTrack(cueRef.current, result.cue));
        say(`Now tracking the ${partName(result.cue)}`, { tone: "success", detail: "Path, look, size and timing are kept." });
      }
      setAnchor({ part, side });
    } catch (err) {
      if (id !== trackReq.current) return;
      const message = trackHelp(err, part);
      setTrackError(message);
      if (first) setTrackState("failed");
    } finally {
      if (id === trackReq.current) setSwitching(null);
    }
  }

  function requestPart(part) {
    const current = cueRef.current;
    const side = part === "head" ? null : (current ? (sideOf(current) || current.hand) : anchor.side) || "right";
    if (current && part === partOf(current) && side === sideOf(current)) return;
    setAnchor({ part, side });
    if (!clip || trackState === "upload") return;
    if (part === "palm" && current && !palms.current[side]) {
      setPicking({ part, side });
      say("Click the palm on the video", { detail: "So CueFX tracks the right hand." });
      return;
    }
    track(clip, { part, side }, part === "palm" ? palms.current[side] : null);
  }

  function requestSide(side) {
    const current = cueRef.current;
    const part = current ? partOf(current) : anchor.part;
    if (part === "head" || (current && side === sideOf(current))) return;
    setAnchor({ part, side });
    if (!clip || trackState === "upload") return;
    if (part === "palm" && current && !palms.current[side]) {
      setPicking({ part, side });
      say("Click the palm on the video", { detail: "So CueFX tracks the right hand." });
      return;
    }
    track(clip, { part, side }, part === "palm" ? palms.current[side] : null);
  }

  function togglePick() {
    if (!clip) return;
    if (picking) { setPicking(null); return; }
    const part = cueRef.current ? partOf(cueRef.current) : anchor.part;
    const side = cueRef.current ? (sideOf(cueRef.current) || cueRef.current.hand) : anchor.side;
    setPlaying(false);
    setPicking({ part, side });
  }

  /* ------------------------------------------------------------ cue, server checks, history */
  function remember(next) {
    cueRef.current = next;
    setCue(next);
  }

  async function refresh(next) {
    flight.current?.abort();
    const controller = new AbortController();
    flight.current = controller;
    const { signal } = controller;
    setBusy(true);
    setCheckError(null);
    try {
      const norm = await normalize(cueForWire(next), signal);
      const checked = await validate(norm.cue, signal);
      const blocked = checked.warnings.some((warning) => warning.severity === "error");
      const drawn = blocked ? null : await preview(norm.cue, signal);
      if (signal.aborted) return false;
      remember(norm.cue);
      setWarnings(hidden(merge(checked.warnings, norm.warnings)));
      setEffectRange(checked.effect_range);
      setOrbFrames(drawn ? drawn.frames : null);
      return true;
    } catch (err) {
      if (!err?.aborted) setCheckError(err);
      return false;
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  function commit(next) {
    remember(next);
    setPlaying(false);
    refresh(next);
  }

  function record(previous) {
    if (!previous) return;
    const { past } = history.current;
    past.push(previous);
    if (past.length > HISTORY_LIMIT) past.shift();
    history.current.future = [];
    setHistoryTick((value) => value + 1);
  }

  /** A change from a control. Sliders send many in a row; those count as one step of undo. */
  function change(next, { live = false } = {}) {
    const at = Date.now();
    if (!live || at - lastLive.current > 700) record(cueRef.current);
    if (live) lastLive.current = at;
    commit(next);
  }

  function undo() {
    const { past, future } = history.current;
    if (!past.length || !cueRef.current) return;
    future.push(cueRef.current);
    const previous = past.pop();
    setSelected(null);
    setHistoryTick((value) => value + 1);
    commit(previous);
  }

  function redo() {
    const { past, future } = history.current;
    if (!future.length || !cueRef.current) return;
    past.push(cueRef.current);
    const next = future.pop();
    setSelected(null);
    setHistoryTick((value) => value + 1);
    commit(next);
  }

  function setBehaviour(behaviour) {
    const current = cueRef.current;
    if (!current || behaviour === current.behaviour) return;
    record(current);
    setSelected(null);
    if (holdsOnBody(behaviour)) {
      commit({ ...current, behaviour, release_frame: null, route: [] });
      setTool("select");
      return;
    }
    if (holdsOnBody(current.behaviour)) {
      const next = toThrow(current, behaviour);
      origin.current = next.route.map((point) => ({ ...point }));
      commit(next);
      return;
    }
    commit({ ...current, behaviour });
  }

  function addPoint(at) {
    const current = cueRef.current;
    const last = current.route?.[current.route.length - 1]?.f;
    if (last != null && last >= frames - 1) { say("No room for another point", { tone: "warn", detail: "The path already reaches the last frame of the clip. Move a point earlier, then add one." }); return; }
    const result = addPathPoint(current, at.x, at.y);
    if (result.refused) { say("The point was not added", { tone: "warn", detail: result.refused }); return; }
    record(cueRef.current);
    setSelected(result.index);
    setFrame(result.cue.route[result.index].f);
    commit(result.cue);
  }

  function deleteSelected() {
    if (selected == null || selected < 1 || !cueRef.current?.route?.[selected]) return;
    record(cueRef.current);
    const next = deletePathPoint(cueRef.current, selected);
    setSelected(null);
    commit(next);
  }

  function resetPath() {
    if (!cueRef.current) return;
    record(cueRef.current);
    setSelected(null);
    commit({ ...cueRef.current, route: origin.current.map((point) => ({ ...point })) });
  }

  async function evenOut() {
    if (!cueRef.current) return;
    setEvening(true);
    try {
      const result = await proposeTiming(cueForWire(cueRef.current));
      record(cueRef.current);
      commit(result.cue);
      say("Points re-timed", { tone: "success", detail: "They now move at a constant speed. Positions stay.", action: { label: "Undo", run: undo } });
    } catch (err) {
      say("The points could not be re-timed", { tone: "error", detail: err?.message });
    } finally {
      setEvening(false);
    }
  }

  /* ------------------------------------------------------------ prompts */
  const autoText = cue ? autoPrompt(cue.look, cue.behaviour) : "";
  const prompt = promptAuto ? autoText : customPrompt;
  const videoPrompt = videoAuto ? LTX_PROMPT : customVideo;
  const promptStale = !promptAuto && cue && customLook && customLook !== cue.look ? lookById(customLook).name : null;
  function onPrompt(text) {
    if (promptAuto) setCustomLook(cue?.look || null);
    setPromptAuto(false);
    setCustomPrompt(text);
  }
  function onPromptAuto() { setPromptAuto(true); setCustomLook(null); }
  function onVideoPrompt(text) { setVideoAuto(false); setCustomVideo(text); }

  /* ------------------------------------------------------------ plate interaction */
  function onPlate(point) {
    if (picking) {
      track(clip, picking, { frame, x: Math.round(point.x), y: Math.round(point.y) });
      return;
    }
    if (tool !== "draw" || !ready) return;
    addPoint(point);
  }

  function dragPoint(event, index) {
    if (picking) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(index);
    if (index === 0) setFrame(cueRef.current.route[0].f);
    record(cueRef.current);
    const move = (ev) => {
      const at = platePoint(svgRef.current, ev);
      if (!at) return;
      remember(index === 0 ? moveRelease(cueRef.current, at.x, at.y) : movePathPoint(cueRef.current, index, at.x, at.y));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      refresh(cueRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /* ------------------------------------------------------------ playback */
  const playhead = useRef({ frame, playing });
  playhead.current = { frame, playing };
  function togglePlay() {
    if (!clip) return;
    const { frame: at, playing: on } = playhead.current;
    if (!on) {
      if (loop && effectRange && (at < effectRange.start || at >= effectRange.end - 1)) setFrame(effectRange.start);
      else if (at >= frames - 1) setFrame(0);
    }
    setPlaying(!on);
  }

  // Loop: at the end of the effect, jump back to its first frame and keep playing.
  useEffect(() => {
    if (!loop || !playing || !effectRange) return undefined;
    if (frame < effectRange.end - 1) return undefined;
    setPlaying(false);
    setFrame(effectRange.start);
    const handle = requestAnimationFrame(() => setPlaying(true));
    return () => cancelAnimationFrame(handle);
  }, [frame, loop, playing, effectRange]);

  /* ------------------------------------------------------------ takes */
  const running = takes.some((take) => take.status === "running");
  useEffect(() => {
    if (!running && !(trackState === "track" || upload?.phase === "prepare")) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, trackState, upload?.phase]);

  const errors = warnings.filter((warning) => warning.severity === "error");
  const promptBlocked = checkPrompt(prompt).some((issue) => issue.severity === "error") || checkPrompt(videoPrompt).some((issue) => issue.severity === "error" && issue.message.startsWith("The prompt is empty"));
  const renderBlock = !clip || trackState === "failed" ? "Load a clip and track it first."
    : errors.length ? "Fix the settings marked in red first."
      : null;

  function updateTake(id, patch) {
    setTakes((list) => list.map((take) => (take.id === id ? { ...take, ...patch } : take)));
  }

  function launch(take) {
    takeControllers.current.get(take.id)?.abort();
    const controller = new AbortController();
    takeControllers.current.set(take.id, controller);
    runTake(take, (patch) => {
      updateTake(take.id, patch);
      if (playerRef.current === take.id && (patch.status === "done" || patch.status === "failed")) return;
      if (patch.status === "done") say(`Take ${take.n} is ready`, { tone: "success", detail: "Watch it, compare it or download it.", action: { label: "Watch", run: () => setPlayer(take.id) } });
      if (patch.status === "failed") say(`Take ${take.n} stopped`, { tone: "error", detail: `At the ${STAGES.find((stage) => stage.id === patch.failedStage)?.name.toLowerCase() || "render"}. The stages before it are kept, so it can retry from there.`, action: { label: "Show", run: () => setPlayer(take.id) } });
    }, controller.signal);
  }

  // Pressing Render opens the take's own view, where its stages fill in. A render that was queued while tracking
  // starts later without taking the screen over: it says so, with Watch.
  function render(kind = "full", { open = true } = {}) {
    setRenderMenu(false);
    if (renderBlock) return;
    if (!ready || busy) { setPending(kind); return; }
    if (kind === "full" && promptBlocked) {
      say("The prompt needs fixing", { tone: "error", detail: "The styled frame cannot render with it. It is in the Prompt tab." });
      return;
    }
    setPlaying(false);
    const take = newTake({
      n: takes.length + 1, kind, clipId: clip.clip_id, cue: cueForWire(cueRef.current), prompt: prompt.trim(), videoPrompt: videoPrompt.trim(),
      look: cueRef.current.look, behaviour: cueRef.current.behaviour,
    });
    setTakes((list) => [...list, take]);
    launch(take);
    if (open) setPlayer(take.id);
    else say(`Take ${take.n} started rendering`, { detail: "Tracking finished, so the queued render began.", action: { label: "Watch", run: () => setPlayer(take.id) } });
  }

  // A render asked for while the clip was still uploading or tracking starts as soon as the cue is checked.
  useEffect(() => {
    if (pending && ready && !busy) {
      const kind = pending;
      setPending(null);
      render(kind, { open: false });
    }
  }, [pending, ready, busy]);

  function retry(take) {
    const next = { ...take, status: "running", error: null, failedStage: null };
    updateTake(take.id, next);
    launch(next);
  }

  function useSettings(take) {
    const previous = cueRef.current;
    record(previous);
    commit({ ...take.settings.cue });
    if (take.settings.prompt !== autoPrompt(take.settings.look, take.settings.behaviour)) {
      setPromptAuto(false);
      setCustomPrompt(take.settings.prompt);
      setCustomLook(take.settings.look);
    } else setPromptAuto(true);
    if (take.settings.videoPrompt !== LTX_PROMPT) { setVideoAuto(false); setCustomVideo(take.settings.videoPrompt); } else setVideoAuto(true);
    setPlayer(null);
    say(`Settings from take ${take.n} are back`, { tone: "success", detail: "The editor now matches that take.", action: { label: "Undo", run: undo } });
  }

  const lastTake = takes[takes.length - 1];
  const changed = lastTake && cue ? JSON.stringify(cueForWire(cue)) !== JSON.stringify(lastTake.settings.cue) || prompt.trim() !== lastTake.settings.prompt || videoPrompt.trim() !== lastTake.settings.videoPrompt : true;
  const renderLabel = pending ? "Queued" : takes.length === 0 ? "Render" : changed ? `Render take ${takes.length + 1}` : "Render again";

  /* ------------------------------------------------------------ keyboard */
  const keyState = useRef({});
  keyState.current = { selected, ready, player, picking, tool, cue };
  useEffect(() => {
    function onKey(event) {
      const target = event.target;
      if (target.closest?.("input, textarea, select, [contenteditable=true]")) return;
      if (keyState.current.player) return;
      if (target.closest?.("button, [role=slider]") && (event.key === " " || event.key === "Enter")) return;
      const mod = event.metaKey || event.ctrlKey;
      const state = keyState.current;
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (mod || event.altKey) return;
      if (event.key === " ") { event.preventDefault(); togglePlay(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); setPlaying(false); setFrame((value) => Math.max(0, value - (event.shiftKey ? 10 : 1))); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); setPlaying(false); setFrame((value) => Math.min(frames - 1, value + (event.shiftKey ? 10 : 1))); return; }
      if (event.key === "Escape") {
        if (state.picking) setPicking(null);
        else if (state.selected != null) setSelected(null);
        else setTool("select");
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "v") setTool("select");
      if (key === "p" && state.ready && state.cue && !holdsOnBody(state.cue.behaviour)) setTool("draw");
      if (key === "b") togglePick();
      if (key === "g") setGuides((value) => !value);
      if (key === "l" && state.ready) setLoop((value) => !value);
      if ((event.key === "Delete" || event.key === "Backspace") && state.selected > 0) { event.preventDefault(); deleteSelected(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Closes the small menus when the pointer goes elsewhere.
  useEffect(() => {
    if (!renderMenu) return undefined;
    const away = (event) => { if (!event.target.closest?.("[data-menu]")) setRenderMenu(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [renderMenu]);

  // Entering the draw tool says once how it works, in the snackbar.
  useEffect(() => {
    if (tool === "draw" && ready && cue && !holdsOnBody(cue.behaviour)) say("Drawing the path", { detail: "Click the video to add points after the last one. V moves points, including the release.", ms: 4000 });
  }, [tool]);

  function goHome() {
    if (running) {
      say("A take is still rendering", { tone: "warn", detail: "Leaving stops following it here.", actions: [{ label: "Leave", run: onBack }, { label: "Stay", run: () => setToast(null) }] });
      return;
    }
    onBack();
  }

  /* ------------------------------------------------------------ what the viewer draws */
  const hold = cue ? holdsOnBody(cue.behaviour) : false;
  const here = cue ? pointAt(cue.track, frame) : null;
  const releaseAt = cue ? pointAt(cue.track, phaseTimes(cue).release) : null;
  const anchorPoint = cue ? anchorAt(cue, hold ? here : releaseAt) : null;
  const route = cue ? drawnRoute(cue, anchorPoint).filter((point) => point.x != null && point.y != null) : [];
  const orb = orbAt(orbFrames, frame);
  const flightPath = useMemo(() => {
    if (!orbFrames || !cue || hold) return null;
    const T = phaseTimes(cue);
    const pts = orbFrames.filter((point) => point.frame >= T.release && point.frame <= T.ve && point.x != null);
    return pts.length > 1 ? pts.map((point) => `${point.x},${point.y}`).join(" ") : null;
  }, [orbFrames, cue, hold]);
  const tint = cue?.grade?.tint || "#9fd4ff";
  const k = scale > 0 ? 1 / scale : 5;
  const trail = cue ? (cue.track || []).filter((point) => point.frame <= frame && point.frame > frame - 18) : [];
  const selectedPoint = selected != null ? route[selected] : null;
  const errorsOnly = warnings.filter((warning) => warning.severity === "error");
  const playerTake = player ? takes.find((take) => take.id === player) : null;
  const partLabel = cue ? partName(cue) : `${anchor.part === "head" || anchor.part === "palm" ? "" : `${anchor.side} `}${anchor.part}`;

  // Every message lives in one place, the snackbar at the top centre: ongoing work and modes as a standing notice,
  // one-off results as a toast that replaces it for a few seconds. Nothing is written over the video.
  let notice = null;
  if (uploadError && !clip) {
    notice = {
      tone: "error", text: uploadError.code === "clip_too_long" ? "This clip is too long" : "The clip could not be used", detail: uploadHelp(uploadError),
      actions: [{ label: "Choose another clip", run: () => fileInput.current?.click() }, { label: "Back", run: goHome }],
    };
  } else if (trackState === "failed" && trackError && !picking) {
    notice = { tone: "error", text: "Tracking did not find it", detail: trackError, actions: [{ label: "Pick on the video", run: togglePick }, { label: "Try again", run: () => track(clip, anchor) }] };
  } else if (picking) {
    notice = { text: `Click the ${picking.part === "head" ? "head" : `${picking.side} ${picking.part}`} on the video`, detail: "CueFX tracks the point you click.", kbd: "Esc", actions: [{ label: "Cancel", run: () => setPicking(null) }] };
  } else if (trackState === "upload" && upload) {
    notice = {
      busy: true,
      text: upload.phase === "prepare" ? `Preparing the clip · ${clock(now - (upload.started || now))}` : upload.phase === "upload" ? `Uploading${upload.pct != null ? ` · ${upload.pct}%` : "…"}` : sample ? "Loading the sample…" : "Checking the clip…",
      detail: upload.phase === "prepare" ? "A 24 fps copy to track, usually 10 to 20 s. Tracking starts next." : "The clip plays meanwhile.",
      pct: upload.phase === "upload" ? upload.pct : null,
    };
  } else if (trackState === "track") {
    notice = { busy: true, text: `Tracking the ${partLabel} · ${clock(now - (trackStarted || now))}`, detail: "The clip plays meanwhile." };
  } else if (switching) {
    notice = { busy: true, text: `Tracking the ${switching}…`, detail: "About 20 s. Your path, look and timing stay." };
  }

  return (
    <main className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="grid h-12 flex-none grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line bg-bg px-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-1">
          <Tip title="CueFX home" note="Back to the landing page." side="bottom">
            <button type="button" aria-label="CueFX home" onClick={goHome} className="inline-flex h-8 flex-none items-center gap-2 rounded-[8px] bg-raised pl-1.5 pr-2.5 text-[13px] font-semibold text-ink hover:bg-sel">
              <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-accent text-on-accent"><Mark /></span>CueFX
            </button>
          </Tip>
          <Tip title="Undo" kbd="Ctrl Z" side="bottom">
            <button type="button" aria-label="Undo" disabled={!history.current.past.length} onClick={undo} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-mute hover:bg-raised hover:text-ink disabled:opacity-35"><Icon name="undo" size={15} /></button>
          </Tip>
          <Tip title="Redo" kbd="Ctrl Shift Z" side="bottom">
            <button type="button" aria-label="Redo" disabled={!history.current.future.length} onClick={redo} className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-mute hover:bg-raised hover:text-ink disabled:opacity-35"><Icon name="redo" size={15} /></button>
          </Tip>
          <h1 className="ml-1 min-w-0 truncate text-[13px] font-medium text-ink md:hidden">{clip?.filename || upload?.name || (sample ? SAMPLE_CLIP.name : "New shot")}</h1>
        </div>
        <div className="hidden min-w-0 max-w-[44vw] items-center justify-center gap-2 md:flex">
          <span className="min-w-0 truncate text-[13px] font-medium text-ink">{clip?.filename || upload?.name || (sample ? SAMPLE_CLIP.name : "New shot")}</span>
          {clip && <span className="hidden h-5 flex-none items-center rounded-[5px] bg-raised px-1.5 text-[11px] text-faint tnum lg:inline-flex">{clipLine(clip)}</span>}
          {busy && !notice && <span className="flex-none text-faint" title="Checking the settings"><Icon name="loader" size={12} className="spin" /><span className="sr-only">Checking the settings</span></span>}
        </div>
        <div className="flex items-center justify-end gap-1.5">
        <TakesButton takes={takes} now={now} onOpen={() => takes.length && setPlayer(takes[takes.length - 1].id)} />
        <div className="relative flex" data-menu>
          <Tip side="bottom" align="end" title={pending ? "Queued" : "Render"}
            note={renderBlock || (pending ? "Starts as soon as tracking finishes. Click to cancel." : "Guide pass, styled frame, then video · about 3 to 4 minutes. You can keep editing.")}>
            <button type="button" disabled={!!renderBlock} onClick={() => (pending ? setPending(null) : render("full"))}
              className={cx("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-l-[8px] px-3 text-[13px] font-medium disabled:opacity-45", pending ? "bg-accent/20 text-accent" : "bg-accent text-on-accent hover:bg-accent-hi")}>
              <Icon name={pending ? "clock" : "sparkle"} size={14} />{renderLabel}
            </button>
          </Tip>
          <button type="button" aria-label="Render options" aria-haspopup="menu" aria-expanded={renderMenu} disabled={!!renderBlock} onClick={() => setRenderMenu((value) => !value)}
            className={cx("inline-flex h-8 w-7 items-center justify-center rounded-r-[8px] border-l border-black/20 disabled:opacity-45", pending ? "bg-accent/20 text-accent" : "bg-accent text-on-accent hover:bg-accent-hi")}>
            <Icon name="chevDown" size={14} />
          </button>
          {renderMenu && (
            <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 flex w-[260px] flex-col rounded-[10px] border border-line2 bg-raised p-1 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.7)]">
              <button type="button" role="menuitem" onClick={() => render("full")} className="flex flex-col rounded-[6px] px-2.5 py-2 text-left hover:bg-sel">
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink"><Icon name="sparkle" size={14} />Render take</span>
                <span className="pl-[22px] text-xs text-faint">Guide pass, styled frame, video</span>
              </button>
              <button type="button" role="menuitem" onClick={() => render("guide")} className="flex flex-col rounded-[6px] px-2.5 py-2 text-left hover:bg-sel">
                <span className="flex items-center gap-2 text-[13px] font-medium text-ink"><Icon name="film" size={14} />Guide pass only</span>
                <span className="pl-[22px] text-xs text-faint">The effect drawn on your footage, under a minute</span>
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto min-[901px]:flex-row min-[901px]:overflow-hidden">
        <div className="flex min-w-0 flex-none flex-col gap-3 p-3 min-[901px]:min-h-0 min-[901px]:flex-1">
          {checkError && <div role="alert" className="rounded-[8px] bg-err/10 px-3 py-2 text-[13px]"><span className="font-semibold">The settings could not be checked.</span> <span className="text-mute">{checkError.message}</span> <button type="button" className="font-medium text-accent hover:underline" onClick={() => cue && refresh(cue)}>Try again</button></div>}
          <div className="flex min-h-0 flex-1 flex-col max-[900px]:flex-none">
          <div className="flex h-8 flex-none items-center gap-2 rounded-t-[10px] border border-b-0 border-line bg-panel pl-3 pr-1 text-xs text-mute">
            <span className="font-medium text-ink">Viewer</span>
            {clip ? <span className="tnum">f {frame} · {timecode(frame, fps)}</span> : <span>{upload || sample ? "Getting the clip ready" : "No clip"}</span>}
            <span className="flex-1" />
            {clip && (
              <Tip title={guides ? "Hide guides" : "Show guides"} note="The tracked point, the path and the preview effect." kbd="G" side="bottom" align="end">
                <button type="button" aria-pressed={guides} onClick={() => setGuides((value) => !value)} className={cx("inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-xs font-medium hover:bg-raised", guides ? "text-ink" : "text-mute")}>
                  <Icon name={guides ? "eye" : "eyeOff"} size={13} />Guides
                </button>
              </Tip>
            )}
          </div>
          <div className="relative flex min-h-[240px] flex-1 flex-col overflow-hidden rounded-b-[10px] border border-t-0 border-line bg-well max-[900px]:aspect-video max-[900px]:flex-none">
            {!clip ? (
              <LocalPreview upload={upload} sample={sample} />
            ) : (
              <>
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute inset-0 flex flex-col">
                    <Plate clip={clip} frame={frame} setFrame={setFrame} playing={playing} onEnded={() => setPlaying(false)} onClick={onPlate} svgRef={svgRef} onScale={onScale}
                      cursor={picking || (tool === "draw" && ready) ? "crosshair" : "default"}>
                      {guides && trail.length > 1 && (
                        <polyline points={trail.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="rgb(var(--c-track))" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
                      )}
                      {guides && here && (
                        <g pointerEvents="none">
                          <circle cx={here.x} cy={here.y} r={10 * k} fill="rgb(var(--c-track) / 0.25)" stroke="rgb(var(--c-track))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                          <circle cx={here.x} cy={here.y} r={3 * k} fill="rgb(var(--c-track))" />
                          <text x={here.x + 16 * k} y={here.y + 20 * k} fill="rgb(var(--c-track))" fontSize={11 * k} fontWeight="600" className="halo-text">{partName(cue)}</text>
                        </g>
                      )}
                      {guides && !hold && (flightPath ? (
                        <polyline points={flightPath} fill="none" stroke="rgb(var(--c-path))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                      ) : route.length > 1 && (
                        <polyline points={route.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="rgb(var(--c-path))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                      ))}
                      {guides && selectedPoint && (
                        <circle cx={selectedPoint.x} cy={selectedPoint.y} r={(selectedPoint.diameter_px || cue.diameter_px) / 2} fill="none" stroke="rgb(var(--c-ink))" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                      )}
                      {guides && !hold && route.map((point, index) => (
                        <g key={`${index}-${point.f}`} data-handle="1" className="cursor-move" onPointerDown={(event) => dragPoint(event, index)}>
                          <circle cx={point.x} cy={point.y} r={16 * k} fill="transparent" />
                          <polygon points={diamond(point.x, point.y, (index === 0 ? 6 : 7.5) * k)} fill={index === 0 ? "rgb(var(--c-ph-held))" : "rgb(var(--c-path))"} stroke={selected === index ? "rgb(var(--c-ink))" : "#000"} strokeWidth={selected === index ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
                          {(selected === index || index === 0) && (
                            <text x={point.x + 14 * k} y={point.y + (index === 0 ? 22 : -12) * k} fill={index === 0 ? "rgb(var(--c-ph-held))" : "rgb(var(--c-path))"} fontSize={11 * k} fontWeight="600" className="halo-text">{index === 0 ? `Release · f ${point.f}${cue.route?.[0]?.x != null ? " · moved" : ""}` : `f ${point.f}`}</text>
                          )}
                        </g>
                      ))}
                      {guides && orb?.visible && (
                        <PreviewShape x={orb.x} y={orb.y} diameter={orb.diameter} tint={tint} shape={cue?.shape || "sphere"} opacity={orb.visibility ?? 1} />
                      )}
                    </Plate>
                  </div>
                </div>
                <div role="toolbar" aria-label="Viewer tools" className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] border border-line2 bg-panel/90 p-1 shadow-[0_10px_30px_rgb(0_0_0/0.5)] backdrop-blur-md">
                  <ToolBtn icon="cursor" label="Select and move" kbd="V" active={tool === "select" && !picking} onClick={() => { setTool("select"); setPicking(null); }} />
                  <ToolBtn icon="pen" label="Draw path" note={hold ? "Hold and Orbit stay on the body point, so they have no path." : "Each click adds a point after the last one."} kbd="P" active={tool === "draw" && !picking} disabled={!ready || hold} onClick={() => { setTool("draw"); setPicking(null); }} />
                  <ToolBtn icon="target" label="Pick on the video" note="Click the person, or the exact point, to track." kbd="B" active={!!picking} disabled={!clip || !!switching} onClick={togglePick} />
                  <span aria-hidden="true" className="mx-1 h-[18px] w-px bg-line2" />
                  <Tip title="Loop the effect" note="Playback repeats the effect's frames." kbd="L" side="top">
                    <button type="button" aria-pressed={loop} disabled={!ready} onClick={() => setLoop((value) => !value)}
                      className={cx("inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium disabled:opacity-35", loop ? "bg-sel text-ink" : "text-mute hover:text-ink")}>
                      <Icon name="loop" size={14} />Loop
                    </button>
                  </Tip>
                </div>
              </>
            )}
          </div>
          </div>
          <Timeline
            clip={clip} frames={frames} fps={fps} cue={ready ? cue : null} frame={frame}
            setFrame={(value) => { setPlaying(false); setFrame(value); }}
            effectRange={ready ? effectRange : null} selected={selected}
            onSelect={(index) => { setSelected(index); setFrame(cueRef.current.route[index].f); }}
            onBegin={() => record(cueRef.current)}
            onTiming={(key, value) => remember(setTiming(cueRef.current, key, value))}
            onPointFrame={(index, value) => { const next = setPointFrame(cueRef.current, index, value); remember(next); return next.route[index].f; }}
            onCommit={() => refresh(cueRef.current)}
            playing={playing} onPlay={togglePlay} loop={loop} setLoop={setLoop}
            state={trackState === "failed" && !clip ? "upload" : trackState}
          />
        </div>
        <Inspector
          cue={cue} ready={ready} anchor={anchor} switching={switching} trackError={ready ? trackError : null}
          picking={!!picking} onPart={requestPart} onSide={requestSide} onPick={togglePick}
          warnings={errorsOnly} selected={selected} setSelected={setSelected} setFrame={setFrame} frames={frames} defaults={serverDefaults}
          change={change} onBehaviour={setBehaviour} onLook={(id) => change(withLook(cueRef.current, id))}
          drawing={tool === "draw"} onDraw={() => { setPicking(null); setTool((value) => (value === "draw" ? "select" : "draw")); }}
          onSnapRelease={() => change(moveRelease(cueRef.current, null, null))}
          onReset={resetPath} canReset={!!cue && !sameRoute(origin.current, cue.route)} onEvenOut={evenOut} evening={evening}
          onAddPoint={() => { const at = anchorPoint || { x: clip.plate_size[0] / 2, y: clip.plate_size[1] / 2 }; const last = route[route.length - 1] || at; addPoint({ x: last.x + 120, y: last.y }); }}
          onDeletePoint={deleteSelected}
          prompt={prompt} promptAuto={promptAuto} onPrompt={onPrompt} onPromptAuto={onPromptAuto} promptStale={promptStale} onPromptUpdate={onPromptAuto}
          videoPrompt={videoPrompt} videoAuto={videoAuto} onVideoPrompt={onVideoPrompt} onVideoAuto={() => setVideoAuto(true)}
          onNewSeed={() => change({ ...cueRef.current, seed: 1 + Math.floor(Math.random() * 2147483646) })}
        />
      </div>
      <Snackbar toast={toast} notice={notice} onClose={() => setToast(null)} />
      {playerTake && <TakesPlayer takes={takes} current={playerTake} clip={clip} now={now} onPick={setPlayer} onClose={() => setPlayer(null)} onRetry={retry} onUse={useSettings} />}
      <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.mkv,.webm" className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) startUpload(file); }} />
    </main>
  );
}

/* ------------------------------------------------------------------ pieces */

function ToolBtn({ icon, label, note, kbd, active, disabled, onClick }) {
  return (
    <Tip title={label} note={note} kbd={kbd} side="top">
      <button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
        className={cx("inline-flex h-8 w-8 items-center justify-center rounded-[8px] disabled:opacity-35", active ? "bg-sel text-ink" : "text-mute hover:bg-raised hover:text-ink")}>
        <Icon name={icon} size={15} />
      </button>
    </Tip>
  );
}

/**
 * The app's one place for messages, at the top centre under the bar. A toast (a result, with an optional action)
 * shows for a few seconds and then gives the place back to the standing notice (work in progress, a mode, or a
 * problem with its fixes). Only one shows at a time, so a message is never repeated somewhere else.
 */
const TONE_ICON = { success: ["checkCircle", "text-ink"], error: ["alert", "text-err"], warn: ["alert", "text-warn"], info: ["info", "text-mute"] };

function Snackbar({ toast, notice, onClose }) {
  const item = toast || notice;
  if (!item) return null;
  const tone = item.tone || "info";
  const [icon, iconTone] = TONE_ICON[tone] || TONE_ICON.info;
  const actions = item.actions || [];
  return (
    <div role={tone === "error" ? "alert" : "status"} key={toast ? toast.id : notice.text.replace(/[\d:]+/g, "")}
      className="fixed left-1/2 top-14 z-[150] flex w-[min(380px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] border border-line2 bg-panel text-ink shadow-[0_18px_44px_-12px_rgb(0_0_0/0.75)]">
      <div className="flex items-start gap-3 py-3.5 pl-4 pr-2.5">
        {item.busy ? <Icon name="loader" size={16} className="spin mt-px flex-none text-mute" /> : <Icon name={icon} size={16} className={cx("mt-px flex-none", iconTone)} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-semibold leading-[18px] tnum">{item.text}</span>
          {item.detail && <span className="mt-0.5 text-[13px] leading-[18px] text-faint">{item.detail}</span>}
          {(actions.length > 0 || item.kbd) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              {actions.map((action, i) => (
                i === 0
                  ? <Btn key={action.label} size="sm" onClick={() => { if (toast) onClose(); action.run(); }}>{action.label}</Btn>
                  : <button key={action.label} type="button" className="h-7 rounded-[8px] px-2 text-xs font-medium text-mute hover:text-ink hover:underline" onClick={() => { if (toast) onClose(); action.run(); }}>{action.label}</button>
              ))}
              {item.kbd && <span className="ml-1 text-xs text-faint">or press <kbd className="rounded-[4px] bg-sel px-1.5 font-sans text-[10px] font-medium text-mute">{item.kbd}</kbd></span>}
            </div>
          )}
        </div>
        {toast && <button type="button" aria-label="Dismiss" className="-mt-1 inline-flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-faint hover:bg-raised hover:text-ink" onClick={onClose}><Icon name="x" size={13} /></button>}
      </div>
      {!toast && item.busy && (
        <span className="h-[2px] w-full bg-line2">
          {item.pct != null ? <span className="block h-full bg-accent transition-[width]" style={{ width: `${item.pct}%` }} /> : <span className="bar-processing block h-full w-full" />}
        </span>
      )}
    </div>
  );
}

/** Before the server has the clip: the file plays from the browser while it uploads and prepares. */
function LocalPreview({ upload, sample }) {
  const src = upload?.url || (sample ? SAMPLE_CLIP.url : null);
  return (
    <div className="absolute inset-0">
      {src && <video src={src} muted loop playsInline autoPlay className="absolute inset-0 h-full w-full object-contain opacity-80" />}
    </div>
  );
}

function Mark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 18c4-9 10-12 16-12M17 3l3 3-3 3" /><circle cx="6" cy="17" r="2" />
    </svg>
  );
}

/** The way into the takes: a count, and the progress of the one rendering. Takes play in their own view. */
function TakesButton({ takes, now, onOpen }) {
  const live = takes.find((take) => take.status === "running");
  const failed = takes.some((take) => take.status === "failed");
  const pct = live ? takeProgress(live, now) : 0;
  return (
    <Tip title="Takes" note={takes.length ? (live ? `Take ${live.n}: ${stageLine(live, now)}` : "Watch, compare and download your takes.") : "Rendered takes open here."} side="bottom">
      <button type="button" onClick={onOpen} disabled={!takes.length}
        className="relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-[8px] bg-raised px-3 text-[13px] font-medium text-ink hover:bg-sel disabled:bg-transparent disabled:text-faint">
        <Icon name="film" size={14} className={live ? "text-accent" : failed ? "text-err" : "text-mute"} />
        Takes{takes.length ? <span className="tnum text-mute">{takes.length}</span> : null}
        {live && <span className="absolute bottom-0 left-0 h-[2px] bg-accent transition-[width] duration-1000" style={{ width: `${pct}%` }} />}
      </button>
    </Tip>
  );
}

function PreviewShape({ x, y, diameter, tint, shape, opacity }) {
  const radius = Math.max(diameter / 2, 8);
  if (shape === "ring") {
    return (
      <g pointerEvents="none" opacity={opacity}>
        <circle cx={x} cy={y} r={radius * 1.7} fill={tint} fillOpacity="0.16" />
        <circle cx={x} cy={y} r={radius} fill="none" stroke={tint} strokeWidth={Math.max(radius * 0.28, 4)} />
      </g>
    );
  }
  if (shape === "cube") {
    const side = radius * 1.4;
    return (
      <g pointerEvents="none" opacity={opacity}>
        <circle cx={x} cy={y} r={radius * 1.5} fill={tint} fillOpacity="0.16" />
        <rect x={x - side / 2} y={y - side / 2} width={side} height={side} fill={tint} stroke="#fff" strokeOpacity="0.35" />
      </g>
    );
  }
  if (shape === "crystal") {
    return (
      <g pointerEvents="none" opacity={opacity}>
        <circle cx={x} cy={y} r={radius * 1.5} fill={tint} fillOpacity="0.16" />
        <polygon points={diamond(x, y, radius)} fill={tint} stroke="#fff" strokeOpacity="0.35" />
      </g>
    );
  }
  return (
    <g pointerEvents="none" opacity={opacity}>
      <circle cx={x} cy={y} r={Math.max(diameter * 0.85, 12)} fill={tint} fillOpacity="0.22" />
      <circle cx={x} cy={y} r={radius} fill={tint} />
      <circle cx={x} cy={y} r={Math.max(diameter * 0.16, 4)} fill="#fff" fillOpacity="0.9" />
    </g>
  );
}

function diamond(x, y, radius) {
  return `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`;
}

function sameRoute(originRoute, route) {
  if (!originRoute || !route || originRoute.length !== route.length) return false;
  return originRoute.every((point, index) => point.f === route[index].f && point.x === route[index].x && point.y === route[index].y);
}
