"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCue, defaults as loadDefaults, normalize, preview, validate } from "../lib/api";
import {
  BEHAVIOURS, BEHAVIOUR_NOTE, EASINGS, ENDING_NOTE, ENDINGS, PARTS, SHAPES, addPathPoint, anchorAt,
  clipLine, deletePathPoint, drawnRoute, holdsOnBody, lookById, movePathPoint, orbitValue, orbAt, partName,
  partOf, cueForWire, phaseTimes, pointAt, setPointEasing, setPointFrame, setTiming, sideOf, spinOf, timecode,
  toThrow, withDiameter, withEnding, withLook, withShape,
} from "../lib/cue";
import LookPicker, { LookStill } from "./LookPicker";
import Plate, { platePoint } from "./Plate";
import StandinPanel from "./StandinPanel";
import Timeline from "./Timeline";
import { Alert, Btn, Icon, IconBtn, Note, Num, Row, Section, Seg, Slider } from "./ui";

const ORBIT_FIELDS = [
  ["radius_sizes", "Radius", "sizes", 0.1, 10, 0.1],
  ["speed_deg_per_s", "Speed", "°/s", -3600, 3600, 1],
  ["tilt_deg", "Tilt", "°", 0, 90, 1],
];

function seedOf(point) {
  if (!point) return null;
  return { frame: point.frame ?? point.f, x: point.x, y: point.y };
}

function adoptTrack(current, tracked) {
  const part = partOf(tracked);
  const next = {
    ...current,
    hand: part === "palm" ? tracked.hand : current.hand,
    hand_seed: tracked.hand_seed,
    track: tracked.track,
    diameter_px: tracked.diameter_px,
    anchor_offset: tracked.anchor_offset,
    corrections: [],
    route: (current.route || []).map((point) => ({ ...point, diameter_px: tracked.diameter_px })),
  };
  if (tracked.body_point) next.body_point = tracked.body_point;
  else delete next.body_point;
  return next;
}

export default function Editor({ clip, created, onBack }) {
  const [cue, setCue] = useState(created.cue);
  const [warnings, setWarnings] = useState(created.warnings || []);
  const [effectRange, setEffectRange] = useState(created.cue.effect_range);
  const [frames, setFrames] = useState(null);
  const [frame, setFrame] = useState(Math.min(created.cue.appear_frame || 0, clip.frames - 1));
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [standin, setStandin] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [variants, setVariants] = useState([]);
  const [reference, setReference] = useState(null);
  const pickerRef = useRef(false);
  pickerRef.current = pickerOpen;
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(null);
  const [switching, setSwitching] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const [clickPick, setClickPick] = useState(null);
  const [serverDefaults, setServerDefaults] = useState(null);
  const [scale, setScale] = useState(0);
  const onScale = useCallback((value) => setScale(value), []);
  const [palms, setPalms] = useState(() => {
    const part = partOf(created.cue);
    return part === "palm" ? { [created.cue.hand]: created.cue.hand_seed } : {};
  });
  const flight = useRef(null);
  const cueRef = useRef(cue);
  const svgRef = useRef(null);
  const origin = useRef(created.cue.route || []);
  cueRef.current = cue;

  useEffect(() => { loadDefaults().then(setServerDefaults).catch(() => {}); }, []);

  useEffect(() => {
    refresh(created.cue);
    return () => flight.current?.abort();
  }, [created]);

  useEffect(() => {
    function onKey(event) {
      if (pickerRef.current || event.target.closest("input, textarea, select, button")) return;
      if (event.key === "ArrowLeft") setFrame((value) => Math.max(0, value - (event.shiftKey ? 10 : 1)));
      if (event.key === "ArrowRight") setFrame((value) => Math.min(clip.frames - 1, value + (event.shiftKey ? 10 : 1)));
      if (event.key === " ") { event.preventDefault(); togglePlay(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selected > 0) {
        event.preventDefault();
        const next = deletePathPoint(cueRef.current, selected);
        setSelected(null);
        commit(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip.frames, selected]);

  const playhead = useRef({ frame, playing });
  playhead.current = { frame, playing };

  function togglePlay() {
    const { frame: at, playing: on } = playhead.current;
    if (!on && at >= clip.frames - 1) setFrame(0);
    setPlaying(!on);
  }

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
    setError(null);
    try {
      const norm = await normalize(cueForWire(next), signal);
      const checked = await validate(norm.cue, signal);
      const blocked = checked.warnings.some((warning) => warning.severity === "error");
      const drawn = blocked ? null : await preview(norm.cue, signal);
      if (signal.aborted) return false;
      remember(norm.cue);
      setWarnings(merge(checked.warnings, norm.warnings));
      setEffectRange(checked.effect_range);
      setFrames(drawn ? drawn.frames : null);
      return true;
    } catch (err) {
      if (!err?.aborted) setError(err);
      return false;
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  function applyLook({ picked, prompt, reference: still, generate }) {
    const main = picked[0];
    const next = withLook(cueRef.current, main, prompt);
    if (main === "reference" && still) next.reference_image = still.name;
    else delete next.reference_image;
    setVariants(picked);
    setReference(still || null);
    setPickerOpen(false);
    refresh(next).then((ok) => {
      if (ok && generate) setStandin(true);
    });
  }

  function commit(next) {
    remember(next);
    setPlaying(false);
    setNotice(null);
    refresh(next);
  }

  function setBehaviour(behaviour) {
    const current = cueRef.current;
    if (behaviour === current.behaviour) return;
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

  async function follow(part, side, seed) {
    setSwitching(part);
    setSwitchError(null);
    const body = { hand: part === "palm" ? (side || cueRef.current.hand) : cueRef.current.hand };
    if (part === "palm") {
      if (!seed) {
        setClickPick({ part, side: side || cueRef.current.hand });
        setSwitching(null);
        return;
      }
      body.hand_seed = seedOf(seed);
    } else {
      body.body_point = { part, side: part === "head" ? null : side };
    }
    try {
      const result = await createCue(clip.clip_id, body);
      if (part === "palm") setPalms((map) => ({ ...map, [body.hand]: result.cue.hand_seed }));
      setClickPick(null);
      setWarnings(result.warnings || []);
      commit(adoptTrack(cueRef.current, result.cue));
    } catch (err) {
      setSwitchError(err);
    } finally {
      setSwitching(null);
    }
  }

  function requestPart(part) {
    const current = cueRef.current;
    const side = part === "head" ? null : (sideOf(current) || current.hand);
    if (part === partOf(current) && side === sideOf(current)) return;
    const seed = part === "palm" ? palms[side] : null;
    follow(part, side, seed);
  }

  function requestSide(side) {
    const current = cueRef.current;
    const part = partOf(current);
    if (part === "head" || side === sideOf(current)) return;
    follow(part, side, part === "palm" ? palms[side] : null);
  }

  function onPlate(point) {
    if (clickPick) {
      follow(clickPick.part, clickPick.side, { frame, x: Math.round(point.x), y: Math.round(point.y) });
      return;
    }
    if (tool !== "draw") return;
    const result = addPathPoint(cueRef.current, point.x, point.y);
    if (result.refused) {
      setNotice(result.refused);
      return;
    }
    setSelected(result.index);
    commit(result.cue);
  }

  function dragPoint(event, index) {
    if (index < 1) {
      setSelected(index);
      setFrame(cueRef.current.route[index].f);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelected(index);
    const move = (ev) => {
      const at = platePoint(svgRef.current, ev);
      if (!at) return;
      remember(movePathPoint(cueRef.current, index, at.x, at.y));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      refresh(cueRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const hold = holdsOnBody(cue.behaviour);
  const here = pointAt(cue.track, frame);
  const releaseAt = pointAt(cue.track, phaseTimes(cue).release);
  const anchor = anchorAt(cue, hold ? here : releaseAt);
  const route = drawnRoute(cue, anchor).filter((point) => point.x != null && point.y != null);
  const orb = orbAt(frames, frame);
  const tint = cue.grade?.tint || "#9fd4ff";
  const errors = warnings.filter((warning) => warning.severity === "error");
  const part = partOf(cue);
  const side = sideOf(cue);
  const length = effectRange ? effectRange.end - effectRange.start : 0;
  const cap = serverDefaults?.max_window_frames || 193;
  const k = scale > 0 ? 1 / scale : 5;
  const trail = (cue.track || []).filter((point) => point.frame <= frame && point.frame > frame - 18);
  const selectedPoint = selected != null ? route[selected] : null;

  return (
    <main className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-12 flex-none items-center gap-3 border-b border-line bg-panel px-4">
        <Btn variant="ghost" onClick={onBack}>Shots</Btn>
        <h1 className="min-w-0 truncate text-base font-semibold">{clip.filename}</h1>
        <span className="hidden text-xs text-faint tnum sm:inline">{clipLine(clip)}</span>
        <span className="flex-1" />
        {busy && <span className="text-xs text-mute">Updating…</span>}
        {switching && <span className="inline-flex items-center gap-1.5 text-xs text-mute"><Icon name="loader" size={13} className="spin" /> Tracking the {switching}</span>}
        <Btn variant="primary" disabled={busy || !!switching || errors.length > 0} onClick={() => { setPlaying(false); setStandin(true); }}>Render stand-in</Btn>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col p-3">
            {error && <Alert error={error}>The cue could not be checked</Alert>}
            <Plate clip={clip} frame={frame} setFrame={setFrame} playing={playing} onEnded={() => setPlaying(false)} onClick={onPlate} svgRef={svgRef} onScale={onScale} cursor={tool === "draw" || clickPick ? "crosshair" : "default"}>
              {trail.length > 1 && (
                <polyline points={trail.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="rgb(var(--c-track))" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.85" />
              )}
              {here && (
                <g pointerEvents="none">
                  <circle cx={here.x} cy={here.y} r={10 * k} fill={here.uncertain ? "none" : "rgb(var(--c-track) / 0.25)"} stroke="rgb(var(--c-track))" strokeWidth="2.5" strokeDasharray={here.uncertain ? "4 3" : undefined} vectorEffect="non-scaling-stroke" />
                  <circle cx={here.x} cy={here.y} r={3 * k} fill="rgb(var(--c-track))" />
                  <path d={`M${here.x - 16 * k} ${here.y}h${6 * k}M${here.x + 10 * k} ${here.y}h${6 * k}M${here.x} ${here.y - 16 * k}v${6 * k}M${here.x} ${here.y + 10 * k}v${6 * k}`} stroke="rgb(var(--c-track))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                  <text x={here.x + 18 * k} y={here.y + 22 * k} fill="rgb(var(--c-track))" fontSize={11 * k} fontWeight="600" className="halo-text">{here.uncertain ? `${partName(cue)} · uncertain` : partName(cue)}</text>
                </g>
              )}
              {route.length > 1 && (
                <polyline points={route.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="rgb(var(--c-path))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
              {selectedPoint && (
                <circle cx={selectedPoint.x} cy={selectedPoint.y} r={(selectedPoint.diameter_px || cue.diameter_px) / 2} fill="none" stroke="rgb(var(--c-accent))" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
              )}
              {route.map((point, index) => (
                <g key={`${point.f}-${index}`} data-handle="1" className="cursor-move" onPointerDown={(event) => dragPoint(event, index)}>
                  <circle cx={point.x} cy={point.y} r={16 * k} fill="transparent" />
                  <polygon points={diamond(point.x, point.y, (index === 0 ? 5.5 : 7.5) * k)} fill="rgb(var(--c-path))" stroke={selected === index ? "rgb(var(--c-accent))" : "#000"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  <text x={point.x + 14 * k} y={point.y + (index === 0 ? 22 : -12) * k} fill="rgb(var(--c-path))" fontSize={11 * k} fontWeight="600" className="halo-text">{index === 0 && selected === 0 ? `Release ${point.f}` : point.f}</text>
                </g>
              ))}
              {orb?.visible && (
                <PreviewShape x={orb.x} y={orb.y} diameter={orb.diameter} tint={tint} shape={cue.shape || "sphere"} opacity={orb.visibility ?? 1} />
              )}
            </Plate>
            <div className="absolute left-5 top-5 flex gap-1">
              <IconBtn icon="cursor" label="Select" active={tool === "select" && !clickPick} onClick={() => { setTool("select"); setClickPick(null); }} />
              <IconBtn icon="route" label="Draw path" active={tool === "draw"} disabled={hold} onClick={() => { setTool("draw"); setClickPick(null); }} />
            </div>
            {tool === "draw" && !hold && <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/75 px-3 py-1.5 text-sm text-white">Click the picture to add a path point</p>}
            {clickPick && <p className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded bg-black/75 px-3 py-1.5 text-sm text-white">Click the {clickPick.part} in the picture</p>}
            {notice && <p className="absolute bottom-16 left-1/2 w-[420px] max-w-[90%] -translate-x-1/2 rounded border border-warn/40 bg-panel px-3 py-2 text-sm text-warn" role="status">{notice}</p>}
          </div>
          <div className="flex h-10 flex-none items-center gap-2 border-t border-line px-3">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded border border-line2 bg-raised" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
              <Icon name={playing ? "pause" : "play"} size={14} />
            </button>
            <span className="text-xs text-mute tnum">{frame} · {timecode(frame, clip.fps)}</span>
            <span className="flex-1" />
            <span className="text-2xs text-faint">{tool === "draw" ? "Draw" : "Select"} · Space plays · arrows step</span>
          </div>
        </div>
        <aside className="flex w-[380px] flex-none flex-col overflow-y-auto border-l border-line bg-panel" aria-label="Inspector">
          <Section title="Whole effect">
            <Row label="Behaviour" hint={BEHAVIOUR_NOTE[cue.behaviour || "hold_throw"]}>
              <Seg label="Behaviour" value={cue.behaviour || "hold_throw"} options={BEHAVIOURS} columns={2} onChange={setBehaviour} />
            </Row>
            {cue.behaviour === "orbit" && ORBIT_FIELDS.map(([key, label, unit, min, max, step]) => (
              <Row key={key} label={label}>
                <label className="flex items-center gap-2">
                  <Num value={orbitValue(cue, key, serverDefaults)} min={min} max={max} step={step} onChange={(value) => commit({ ...cue, orbit: { ...cue.orbit, [key]: value } })} />
                  <span className="text-2xs text-faint">{unit}</span>
                </label>
              </Row>
            ))}
            <Row label="Attached to" hint="Chooses the body point the effect follows. Pose points do not need a click.">
              <Seg label="Attached to" value={part} options={PARTS} columns={3} disabled={!!switching} onChange={requestPart} />
              {part !== "head" && (
                <div className="mt-1">
                  <Seg label="Side" value={side} options={[["right", "Right"], ["left", "Left"]]} disabled={!!switching} onChange={requestSide} />
                </div>
              )}
              {switchError && <p className="mt-1 text-2xs text-err" role="alert">{switchError.message}</p>}
              <button type="button" className="mt-1 text-2xs text-mute underline underline-offset-2 hover:text-ink disabled:opacity-40" disabled={!!switching} onClick={() => setClickPick({ part, side: side || cue.hand })}>Wrong person or hand? Click it in the video</button>
            </Row>
            <Row label="Shape" hint="Sets the outline the stand-in draws.">
              <Seg label="Shape" value={cue.shape || "sphere"} options={SHAPES} columns={2} onChange={(value) => commit(withShape(cue, value))} />
            </Row>
            <Row label="Spin" hint="Degrees per second. Default uses the shape's own spin.">
              <div className="flex items-center gap-2">
                <Num value={spinOf(cue, serverDefaults)} min={-1440} max={1440} onChange={(value) => commit({ ...cue, spin_deg_per_s: value })} />
                <span className="text-2xs text-faint">°/s</span>
                <Btn size="sm" variant="ghost" disabled={cue.spin_deg_per_s == null} onClick={() => { const next = { ...cue }; delete next.spin_deg_per_s; commit(next); }}>Default</Btn>
              </div>
            </Row>
            <Row label="Look" hint="Chooses the effect's material and colour.">
              <div className="flex items-center gap-2">
                {cue.look === "reference" && reference?.url
                  ? <img src={reference.url} alt="" className="h-9 w-9 flex-none rounded border border-line2 object-cover" />
                  : <LookStill id={lookById(cue.look).id} className="h-9 w-9 flex-none rounded border border-line2" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{lookById(cue.look).name}</span>
                <Btn size="sm" onClick={() => { setPickerKey((value) => value + 1); setPickerOpen(true); }}>Change</Btn>
              </div>
            </Row>
            <Row label="Ending" hint={ENDING_NOTE[cue.ending || "fade"]}>
              <Seg label="Ending" value={cue.ending || "fade"} options={ENDINGS} onChange={(value) => commit(withEnding(cue, value, serverDefaults))} />
            </Row>
            <Row label="Size" hint="Sets the outer size of the effect, including its path.">
              <div className="flex items-center gap-2">
                <Num value={cue.diameter_px} min={8} max={800} onChange={(value) => commit(withDiameter(cue, value))} />
                <span className="text-2xs text-faint">px</span>
              </div>
              <Slider label="Size" value={cue.diameter_px || 80} min={8} max={400} onChange={(value) => commit(withDiameter(cue, value))} />
            </Row>
            <Row label={`Offset from ${part === "palm" ? "palm" : part}`} hint="Moves the effect away from the tracked body point.">
              <div className="grid grid-cols-2 gap-1.5">
                <Num value={cue.anchor_offset?.[0] ?? 0} min={-600} max={600} onChange={(value) => commit({ ...cue, anchor_offset: [value, cue.anchor_offset?.[1] ?? 0] })} />
                <Num value={cue.anchor_offset?.[1] ?? 0} min={-600} max={600} onChange={(value) => commit({ ...cue, anchor_offset: [cue.anchor_offset?.[0] ?? 0, value] })} />
              </div>
            </Row>
          </Section>
          <Section title="Timing">
            {effectRange && (
              <div className="mb-2">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-mute">Effect length</span>
                  <span className={`tnum ${length > cap ? "text-err" : "text-ink"}`}>{(length / clip.fps).toFixed(1)} s / {(cap / clip.fps).toFixed(1)} s</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-field" role="progressbar" aria-valuenow={length} aria-valuemax={cap}>
                  <div className={`h-full ${length > cap ? "bg-err" : "bg-accent"}`} style={{ width: `${Math.min(100, (length / cap) * 100)}%` }} />
                </div>
              </div>
            )}
            <Row label="Entrance" hint="How long the effect takes to become fully visible.">
              <div className="flex items-center gap-2">
                <Num value={cue.entrance?.seconds ?? 0} min={0} max={3} step={0.05} onChange={(value) => commit({ ...cue, entrance: { seconds: value } })} />
                <span className="text-2xs text-faint">s</span>
              </div>
            </Row>
            <Row label="Appear"><Num value={cue.appear_frame} min={0} max={clip.frames - 1} onChange={(value) => commit(setTiming(cue, "appear", value))} /></Row>
            {!hold && <Row label="Release" hint="When the effect leaves the body point."><Num value={cue.release_frame} min={0} max={clip.frames - 1} onChange={(value) => commit(setTiming(cue, "release", value))} /></Row>}
            <Row label="Vanish start"><Num value={cue.vanish?.start} min={0} max={clip.frames - 1} onChange={(value) => commit(setTiming(cue, "vanishStart", value))} /></Row>
            <Row label="Vanish end"><Num value={cue.vanish?.end} min={0} max={clip.frames} onChange={(value) => commit(setTiming(cue, "vanishEnd", value))} /></Row>
          </Section>
          <Section title="Path">
            {hold ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-mute">{BEHAVIOUR_NOTE[cue.behaviour]}</p>
                <Btn size="sm" icon="route" onClick={() => setBehaviour("hold_throw")}>Switch to Hold + throw</Btn>
              </div>
            ) : (
              <>
                <p className="text-xs text-mute">{Math.max(0, (cue.route?.length || 1) - 1)} path {(cue.route?.length || 1) === 2 ? "point" : "points"}. Click the picture to add one, then drag the diamond.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn size="sm" icon="route" onClick={() => setTool("draw")}>Draw path</Btn>
                  <Btn size="sm" icon="plus" onClick={() => {
                    const at = anchor || { x: clip.plate_size[0] / 2, y: clip.plate_size[1] / 2 };
                    const result = addPathPoint(cue, at.x + 120, at.y);
                    if (result.refused) setNotice(result.refused);
                    else { setSelected(result.index); setTool("select"); commit(result.cue); }
                  }}>Add point</Btn>
                  <Btn size="sm" variant="ghost" disabled={!origin.current || sameRoute(origin.current, cue.route)} onClick={() => { setSelected(null); commit({ ...cue, route: origin.current.map((point) => ({ ...point })) }); }}>Reset path</Btn>
                </div>
              </>
            )}
            {selected != null && cue.route?.[selected] && (
              <div className="mt-3 rounded border border-line bg-field p-2">
                <div className="text-2xs font-semibold uppercase tracking-wider text-faint">Point {selected + 1}{selected === 0 ? " · release" : ""}</div>
                <Row label="Frame">
                  <Num value={cue.route[selected].f} min={0} max={clip.frames - 1} disabled={selected === 0} onChange={(value) => { const next = setPointFrame(cue, selected, value); commit(next); setFrame(next.route[selected].f); }} />
                </Row>
                {selected > 0 && (
                  <>
                    <Row label="Position">
                      <div className="grid grid-cols-2 gap-1.5">
                        <Num value={Math.round(cue.route[selected].x)} min={-2000} max={4000} onChange={(value) => commit(movePathPoint(cue, selected, value, cue.route[selected].y))} />
                        <Num value={Math.round(cue.route[selected].y)} min={-2000} max={3000} onChange={(value) => commit(movePathPoint(cue, selected, cue.route[selected].x, value))} />
                      </div>
                    </Row>
                    <Row label="Easing">
                      <Seg label="Easing" value={cue.route[selected].easing_in || "linear"} options={EASINGS} columns={2} onChange={(value) => commit(setPointEasing(cue, selected, value))} />
                    </Row>
                    <Btn size="sm" variant="danger" className="mt-1" onClick={() => { const next = deletePathPoint(cue, selected); setSelected(null); commit(next); }}>Delete point</Btn>
                  </>
                )}
                {selected === 0 && <p className="text-2xs text-faint">The release starts on the body point. Drag a later diamond, or draw the flight.</p>}
              </div>
            )}
          </Section>
          <Section title="Appearance">
            <Row label="Tint" hint="Colour mixed into the stand-in.">
              <input aria-label="Tint" type="color" className="h-8 w-full cursor-pointer rounded border border-line bg-field" value={tint} onChange={(event) => commit({ ...cue, grade: { ...cue.grade, tint: event.target.value } })} />
            </Row>
            <Row label="Glow">
              <Slider label="Glow" value={cue.grade?.glow ?? 0.6} min={0} max={1} step={0.05} onChange={(value) => commit({ ...cue, grade: { ...cue.grade, glow: value } })} format={(value) => `${Math.round(value * 100)}%`} />
            </Row>
          </Section>
          <ul className="flex flex-col gap-1.5 px-3 py-3">
            {here && <li className="text-xs text-mute tnum">{partName(cue)} {Math.round(here.x)}, {Math.round(here.y)} · {Math.round(here.confidence * 100)}%{here.uncertain ? " · uncertain" : ""}</li>}
            {warnings.map((warning) => (
              <li key={warning.id}><Note severity={warning.severity}>{warning.message}</Note></li>
            ))}
          </ul>
        </aside>
      </div>
      <Timeline
        clip={clip}
        cue={cue}
        frame={frame}
        setFrame={setFrame}
        effectRange={effectRange}
        selected={selected}
        onSelect={(index) => { setSelected(index); setFrame(cueRef.current.route[index].f); }}
        onTiming={(key, value) => remember(setTiming(cueRef.current, key, value))}
        onPointFrame={(index, value) => { const next = setPointFrame(cueRef.current, index, value); remember(next); return next.route[index].f; }}
        onCommit={() => refresh(cueRef.current)}
      />
      {standin && <StandinPanel clip={clip} cue={cue} onClose={() => setStandin(false)} />}
      {pickerOpen && (
        <LookPicker key={pickerKey} cue={cue} variants={variants} reference={reference} onClose={() => setPickerOpen(false)} onApply={applyLook} />
      )}
    </main>
  );
}

function merge(primary, extra) {
  const seen = new Set(primary.map((warning) => warning.code));
  return [...primary, ...(extra || []).filter((warning) => !seen.has(warning.code))];
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
