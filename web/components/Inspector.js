"use client";

import { useEffect, useState } from "react";
import {
  BEHAVIOURS, BEHAVIOUR_NOTE, EASINGS, ENDINGS, ENDING_NOTE, LOOKS, PARTS, SHAPES, holdsOnBody, lookById, movePathPoint,
  orbitValue, partOf, setPointEasing, setPointFrame, setTiming, sideOf, spinOf, withDiameter, withEnding, withShape,
} from "../lib/cue";
import { checkPrompt } from "../lib/prompt";
import { LookStill } from "./LookStill";
import { Btn, Icon, Slider, Tip, cx } from "./ui";

const PART_NOTE = {
  palm: "Follows the open hand. Click the palm on the video if CueFX picks the wrong one.",
  fist: "Follows the closed hand.",
  foot: "Follows the foot.",
  knee: "Follows the knee joint.",
  shoulder: "Follows the shoulder.",
  head: "Follows the head. It has no side.",
};
const SHAPE_NOTE = {
  sphere: "A round core. The default.",
  ring: "A flat ring that spins on its axis.",
  crystal: "A faceted shard with sharp edges.",
  cube: "A hard-edged cube.",
};
const ORBIT_FIELDS = [
  ["radius_sizes", "Radius", "×", 0.1, 10, 0.1],
  ["speed_deg_per_s", "Speed", "°/s", -3600, 3600, 1],
  ["tilt_deg", "Tilt", "°", 0, 90, 1],
];

const PATH_GROUP = [
  [/^(grade|look|shape|reference_image|diameter|spin|ending|anchor_offset)/, "look"],
  [/^(route|path|behaviour|orbit)/, "motion"],
  [/^(appear_frame|release_frame|vanish|entrance|effect_range)/, "motion"],
  [/^(hand|body_point|track|corrections)/, "anchor"],
];

/** The group a server note belongs to, from its cause. */
export function groupOf(warning) {
  const { kind, path = "" } = warning.cause || {};
  if (kind === "track") return "anchor";
  if (kind === "timing" || kind === "tool-draw") return "motion";
  if (kind === "field" || kind === "setting") {
    const hit = PATH_GROUP.find(([pattern]) => pattern.test(path));
    if (hit) return hit[1];
  }
  return "motion";
}

function Notes({ group, warnings }) {
  const notes = (warnings || []).filter((warning) => groupOf(warning) === group);
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {notes.map((warning) => <ErrorLine key={warning.id || warning.code}>{warning.message}</ErrorLine>)}
    </ul>
  );
}

function ErrorLine({ children, as: Tag = "li" }) {
  return (
    <Tag role="alert" className="flex items-start gap-2 rounded-[8px] bg-err/[0.1] px-2.5 py-2 text-xs leading-[17px] text-ink">
      <Icon name="alert" size={13} className="mt-0.5 flex-none text-err" /><span className="min-w-0 break-words">{children}</span>
    </Tag>
  );
}

/*
 * Enhanced UI: the panel follows one grid. Every section has the same header and padding, every
 * row has a 72 px label column and a control column that fills the rest, and every control is 30 px tall. A label
 * next to a control that spans several rows sits at the top, the height of the first row.
 */
const ROW = "h-[30px]";

function Section({ id, title, summary, open, onToggle, disabled, warn, children }) {
  const shown = open && !disabled;
  return (
    <section className="border-b border-line" aria-labelledby={`group-${id}`}>
      <button type="button" id={`group-${id}`} aria-expanded={shown} disabled={disabled} onClick={onToggle}
        className="group flex h-11 w-full items-center gap-2 px-4 text-left text-[13px] font-semibold text-ink disabled:text-faint">
        {title}
        {warn && <Icon name="alert" size={13} className="text-err" />}
        <span className="flex-1" />
        {!shown && summary && <span className="min-w-0 truncate text-xs font-normal text-faint">{summary}</span>}
        <Icon name="chevDown" size={14} className={cx("flex-none text-mute transition-transform duration-200 ease-out motion-reduce:transition-none group-hover:text-ink", shown && "rotate-180")} />
      </button>
      {shown && <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>}
    </section>
  );
}

function Prop({ label, children, top }) {
  return (
    <div className={cx("grid grid-cols-[72px_minmax(0,1fr)] gap-x-2", top ? "items-start" : "items-center")}>
      <span className={cx("flex items-center text-xs text-mute", ROW)}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A number field with its unit or name inside it, on the right: "63  appear". */
function Field({ label, value, min, max, step = 1, onChange, unit, disabled }) {
  const [text, setText] = useState(null);
  return (
    <label className={cx("fx-field flex min-w-0 items-center gap-1.5 px-2.5 focus-within:border-accent/80", ROW, disabled && "opacity-40")}>
      <input type="number" inputMode="decimal" aria-label={label} disabled={disabled} min={min} max={max} step={step}
        className="w-full min-w-0 bg-transparent text-xs text-ink tnum outline-none"
        value={text ?? value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
          const next = Number(raw);
          if (Number.isFinite(next)) onChange(next);
        }}
        onBlur={() => setText(null)} />
      {unit && <span className="flex-none text-xs text-faint">{unit}</span>}
    </label>
  );
}

function Pair({ children }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

/** Icon-only choices; each one names itself in a tooltip with a line on what it does. */
function IconSeg({ label, value, options, notes, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex gap-0.5 rounded-[8px] bg-field p-0.5", ROW)}>
      {options.map(([id, name]) => (
        <Tip key={id} title={name} note={notes?.[id]} className="flex-1">
          <button type="button" role="radio" aria-checked={value === id} aria-label={name} disabled={disabled} onClick={() => onChange(id)}
            className={cx("flex h-[26px] w-full items-center justify-center rounded-[6px] disabled:opacity-40", value === id ? "bg-sel text-ink" : "text-mute hover:text-ink")}>
            <Icon name={id} size={15} stroke={1.75} />
          </button>
        </Tip>
      ))}
    </div>
  );
}

function TextSeg({ label, value, options, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex gap-0.5 rounded-[8px] bg-field p-0.5", ROW)}>
      {options.map(([id, name]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} disabled={disabled} onClick={() => onChange(id)}
          className={cx("h-[26px] min-w-0 flex-1 truncate rounded-[6px] px-1 text-xs font-medium disabled:opacity-40", value === id ? "bg-sel text-ink" : "text-mute hover:text-ink")}>
          {name}
        </button>
      ))}
    </div>
  );
}

/** A full-width button in the control column, grey when it is on. */
function Tool({ icon, label, tip, note, kbd, active, disabled, busy, onClick }) {
  return (
    <Tip title={tip || label} note={note} kbd={kbd} className="w-full min-w-0">
      <button type="button" aria-pressed={active === undefined ? undefined : active} disabled={disabled} onClick={onClick}
        className={cx("flex w-full min-w-0 items-center justify-center gap-1.5 rounded-[8px] px-1.5 text-xs font-medium disabled:opacity-40", ROW,
          active ? "bg-sel text-ink" : "bg-field text-mute hover:bg-sel/70 hover:text-ink")}>
        <Icon name={busy ? "loader" : icon} size={14} className={cx("flex-none", busy && "spin")} /><span className="truncate">{label}</span>
      </button>
    </Tip>
  );
}

function Square({ icon, label, kbd, note, onClick, disabled, danger }) {
  return (
    <Tip title={label} note={note} kbd={kbd} align="end">
      <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
        className={cx("inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] bg-field text-mute disabled:opacity-40", danger ? "hover:text-err" : "hover:bg-sel hover:text-ink")}>
        <Icon name={icon} size={14} />
      </button>
    </Tip>
  );
}

function PromptBox({ id, label, value, auto, onChange, onAuto, onCustom, autoNote, customNote, check }) {
  const issues = check ? checkPrompt(value) : [];
  const errors = issues.filter((issue) => issue.severity === "error");
  return (
    <>
      <Prop label="Source"><TextSeg label={`${label} source`} value={auto ? "auto" : "custom"} options={[["auto", "Auto"], ["custom", "Custom"]]} onChange={(next) => (next === "auto" ? onAuto() : onCustom())} /></Prop>
      <Prop label="Prompt" top>
        <div className="flex flex-col gap-1.5">
          <textarea id={id} aria-label={`${label} prompt`} rows={5} value={value} aria-invalid={errors.length > 0} onChange={(event) => onChange(event.target.value)}
            className="fx-field w-full resize-y px-2.5 py-2 text-xs leading-[18px]" />
          <span className="flex items-start justify-between gap-2 text-[11px] leading-4 text-faint">
            <span>{auto ? autoNote : customNote}</span>
            <span className={cx("flex-none tnum", errors.length && "text-err")}>{value.trim().length} / 800</span>
          </span>
          {errors.map((issue) => <ErrorLine key={issue.message} as="p">{issue.message}</ErrorLine>)}
        </div>
      </Prop>
    </>
  );
}

/** Whether the Prompt tab needs a look: an error in the frame prompt, or wording that still describes another look. */
export function promptAttention(prompt, promptStale) {
  return checkPrompt(prompt).some((issue) => issue.severity === "error") ? "error" : promptStale ? "stale" : null;
}

export default function Inspector(props) {
  const {
    cue, ready, anchor, switching, trackError, picking, onPart, onSide, onPick, drawing, onDraw, onSnapRelease,
    warnings, selected, setSelected, setFrame, frames, defaults, change, onBehaviour, onLook,
    onReset, canReset, onEvenOut, evening, onAddPoint, onDeletePoint,
    prompt, promptAuto, onPrompt, onPromptAuto, promptStale, onPromptUpdate,
    videoPrompt, videoAuto, onVideoPrompt, onVideoAuto, onNewSeed,
  } = props;
  const [tab, setTab] = useState("effect");
  const [open, setOpen] = useState({ anchor: true, motion: true, look: false, frame: true, video: false, seed: true });
  const toggle = (id) => setOpen((value) => ({ ...value, [id]: !value[id] }));

  // Selecting a path point (on the video or the timeline) shows its fields, so open the group it lives in.
  // It never switches the tab: if the Prompt tab is showing, the point is still selected on the video.
  useEffect(() => {
    if (selected != null) setOpen((value) => (value.motion ? value : { ...value, motion: true }));
  }, [selected]);

  const part = cue ? partOf(cue) : anchor.part;
  const side = cue ? sideOf(cue) : anchor.side;
  const hold = cue ? holdsOnBody(cue.behaviour) : false;
  const behaviour = cue?.behaviour || "hold_throw";
  const look = cue ? lookById(cue.look) : null;
  const point = cue && selected != null ? cue.route?.[selected] : null;
  const anchorName = `${PARTS.find(([id]) => id === part)?.[1] || part}${part === "head" || !side ? "" : ` · ${side === "left" ? "L" : "R"}`}`;
  const has = (group) => (warnings || []).some((warning) => groupOf(warning) === group && warning.severity !== "info");
  const attention = ready ? promptAttention(prompt, promptStale) : null;
  const effectWarn = !!trackError || has("anchor") || has("motion") || has("look");
  const points = Math.max(0, (cue?.route?.length || 1) - 1);

  const tabs = [
    ["effect", "Effect", effectWarn ? "error" : null],
    ["prompt", "Prompt", attention],
  ];

  return (
    <aside aria-label="Effect settings" className="flex w-full flex-none flex-col border-line bg-panel min-[901px]:min-h-0 min-[901px]:w-[300px] min-[901px]:border-l">
      <div className="flex h-12 flex-none items-center gap-1 border-b border-line px-3">
        <div role="tablist" aria-label="Settings" className="flex gap-1">
          {tabs.map(([id, name, flag]) => (
            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}
              title={flag === "error" ? `${name} has something to fix` : flag === "stale" ? `The prompt still describes ${promptStale}` : undefined}
              className={cx("relative inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium", tab === id ? "bg-sel text-ink" : "text-mute hover:text-ink")}>
              {name}
              {flag && <span aria-hidden="true" className={cx("h-1.5 w-1.5 rounded-full", flag === "error" ? "bg-err" : "bg-warn")} />}
              {flag && <span className="sr-only">{flag === "error" ? ", needs a fix" : ", out of date"}</span>}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {cue?.effect_range && <span className="text-xs text-faint tnum" title="The frames the render covers">f {cue.effect_range.start}–{cue.effect_range.end - 1}</span>}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pb-6 min-[901px]:min-h-0 min-[901px]:flex-1 min-[901px]:overflow-y-auto">
        {tab === "effect" ? (
          <>
            <Section id="anchor" title="Anchor" summary={anchorName} open={open.anchor} onToggle={() => toggle("anchor")} warn={!!trackError || has("anchor")}>
              <Prop label="Body point" top>
                <div role="radiogroup" aria-label="Body point" className="grid grid-cols-3 gap-1">
                  {PARTS.map(([id, name]) => (
                    <Tip key={id} title={name} note={PART_NOTE[id]} className="w-full min-w-0">
                      <button type="button" role="radio" aria-checked={part === id} disabled={!!switching} onClick={() => onPart(id)}
                        className={cx("flex h-12 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-[8px] text-[11px] font-medium disabled:opacity-50",
                          part === id ? "bg-sel text-ink" : "bg-field text-mute hover:text-ink")}>
                        <Icon name={id} size={17} stroke={1.6} /><span className="max-w-full truncate px-0.5">{name}</span>
                      </button>
                    </Tip>
                  ))}
                </div>
              </Prop>
              {part !== "head" && (
                <Prop label="Side"><TextSeg label="Side" value={side} disabled={!!switching} options={[["left", "Left"], ["right", "Right"]]} onChange={(value) => { if (!switching) onSide(value); }} /></Prop>
              )}
              <Prop label="On video">
                <Tool icon="target" label={picking ? "Click the video…" : "Pick the point"} tip="Pick on the video" note="Click the person, or the exact point, to track." kbd="B" active={picking} disabled={!!switching} onClick={onPick} />
              </Prop>
              {trackError && <ErrorLine as="p">{trackError}</ErrorLine>}
              <Notes group="anchor" warnings={warnings} />
            </Section>

            <Section id="motion" title="Motion" summary={ready ? BEHAVIOURS.find(([id]) => id === behaviour)?.[1] : "After tracking"} open={open.motion} onToggle={() => toggle("motion")} disabled={!ready} warn={has("motion")}>
              {ready && (
                <>
                  <Prop label="Behaviour"><IconSeg label="Behaviour" value={behaviour} options={BEHAVIOURS} notes={BEHAVIOUR_NOTE} onChange={onBehaviour} /></Prop>
                  <Prop label="Timing" top>
                    <Pair>
                      <Field label="Appear frame" unit="appear" value={cue.appear_frame} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "appear", value))} />
                      {hold
                        ? <Field label="Vanish frame" unit="vanish" value={cue.vanish?.start} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "vanishStart", value))} />
                        : <Field label="Release frame" unit="release" value={cue.release_frame} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "release", value))} />}
                      {!hold && <Field label="Vanish frame" unit="vanish" value={cue.vanish?.start} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "vanishStart", value))} />}
                      <Field label="Gone frame" unit="gone" value={cue.vanish?.end} min={0} max={frames} onChange={(value) => change(setTiming(cue, "vanishEnd", value))} />
                    </Pair>
                  </Prop>
                  <Prop label="Entrance"><Field label="Entrance seconds" unit="s" step={0.05} value={cue.entrance?.seconds ?? 0} min={0} max={3} onChange={(value) => change({ ...cue, entrance: { seconds: value } })} /></Prop>
                  {!hold && (
                    <>
                      <Prop label="Path"><span className={cx("flex items-center text-xs text-ink tnum", ROW)}>{points} point{points === 1 ? "" : "s"} after the release</span></Prop>
                      <Prop label="">
                        <div className="grid grid-cols-2 gap-1.5">
                          <Tool icon="pen" label="Draw" active={drawing} onClick={onDraw} tip="Draw path" note="Click the video to add points after the last one." kbd="P" />
                          <Tool icon="plus" label="Add" onClick={onAddPoint} tip="Add point" note="Adds one point after the last, to drag into place." />
                          <Tool icon="even" label="Even out" onClick={onEvenOut} disabled={evening || (cue.route?.length || 0) < 3} busy={evening} tip="Even out" note="Re-times the points to a constant speed. Positions stay." />
                          <Tool icon="retry" label="Reset" onClick={onReset} disabled={!canReset} tip="Reset path" note="Back to the path the editor opened with." />
                        </div>
                      </Prop>
                    </>
                  )}
                  {!hold && point && (
                    <div className="-mx-2 mt-1 flex flex-col gap-2 rounded-[10px] border border-line2 bg-bg p-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                        <span aria-hidden="true" className={cx("h-2 w-2 rotate-45", selected === 0 ? "bg-ph-held" : "bg-path")} />
                        {selected === 0 ? "Release point" : `Point ${selected}`}
                        <span className="flex-1" />
                        {selected > 0 && <Square icon="trash" label="Delete point" kbd="Delete" danger onClick={onDeletePoint} />}
                        <Square icon="x" label="Done" kbd="Esc" onClick={() => setSelected(null)} />
                      </div>
                      {selected === 0 ? (
                        point.x == null ? (
                          <p className="text-[11.5px] leading-4 text-mute">Starts on the body point at frame {point.f}. Drag it on the video to start the flight somewhere else.</p>
                        ) : (
                          <>
                            <Prop label="Position">
                              <Pair>
                                <Field label="Release X" unit="x" value={Math.round(point.x)} min={-2000} max={4000} onChange={(value) => change({ ...cue, route: cue.route.map((item, i) => (i === 0 ? { ...item, x: Math.round(value) } : item)) })} />
                                <Field label="Release Y" unit="y" value={Math.round(point.y)} min={-2000} max={3000} onChange={(value) => change({ ...cue, route: cue.route.map((item, i) => (i === 0 ? { ...item, y: Math.round(value) } : item)) })} />
                              </Pair>
                            </Prop>
                            <Prop label=""><Tool icon="target" label="Back on the body" tip="Back on the body point" note="The flight starts from the tracked point again." onClick={onSnapRelease} /></Prop>
                          </>
                        )
                      ) : (
                        <>
                          <Prop label="Frame"><Field label="Point frame" unit="f" value={point.f} min={0} max={frames - 1} onChange={(value) => { const next = setPointFrame(cue, selected, value); change(next); setFrame(next.route[selected].f); }} /></Prop>
                          <Prop label="Position">
                            <Pair>
                              <Field label="Point X" unit="x" value={Math.round(point.x)} min={-2000} max={4000} onChange={(value) => change(movePathPoint(cue, selected, value, point.y))} />
                              <Field label="Point Y" unit="y" value={Math.round(point.y)} min={-2000} max={3000} onChange={(value) => change(movePathPoint(cue, selected, point.x, value))} />
                            </Pair>
                          </Prop>
                          <Prop label="Easing"><TextSeg label="Easing" value={point.easing_in || "linear"} options={EASINGS} onChange={(value) => change(setPointEasing(cue, selected, value))} /></Prop>
                        </>
                      )}
                    </div>
                  )}
                  {behaviour === "orbit" && ORBIT_FIELDS.map(([key, label, unit, min, max, step]) => (
                    <Prop key={key} label={label}><Field label={label} unit={unit} value={orbitValue(cue, key, defaults)} min={min} max={max} step={step} onChange={(value) => change({ ...cue, orbit: { ...cue.orbit, [key]: value } })} /></Prop>
                  ))}
                  {hold && <p className="text-[11.5px] leading-4 text-faint">{behaviour === "orbit" ? "Orbit" : "Hold"} stays on the body point, so there is no path to draw.</p>}
                  <Notes group="motion" warnings={warnings} />
                </>
              )}
            </Section>

            <Section id="look" title="Look" summary={look?.name || "After tracking"} open={open.look} onToggle={() => toggle("look")} disabled={!ready} warn={has("look")}>
              {ready && (
                <>
                  <Prop label="Look" top>
                    <div role="radiogroup" aria-label="Look" className="flex flex-wrap gap-1.5">
                      {LOOKS.map((item) => (
                        <Tip key={item.id} title={item.name} note={item.note}>
                          <button type="button" role="radio" aria-checked={cue.look === item.id} aria-label={item.name} onClick={() => onLook(item.id)}
                            className={cx("h-[30px] w-[30px] overflow-hidden rounded-full border-2 bg-black p-px", cue.look === item.id ? "border-ink" : "border-transparent hover:border-line2")}>
                            <LookStill id={item.id} className="h-full w-full rounded-full" />
                          </button>
                        </Tip>
                      ))}
                    </div>
                  </Prop>
                  <Prop label="Size">
                    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2">
                      <Slider label="Size" value={cue.diameter_px || 80} min={8} max={400} onChange={(value) => change(withDiameter(cue, value), { live: true })} format={(value) => `${value} px`} />
                      <Field label="Size in pixels" unit="px" value={cue.diameter_px} min={8} max={800} onChange={(value) => change(withDiameter(cue, value))} />
                    </div>
                  </Prop>
                  <Prop label="Ending"><IconSeg label="Ending" value={cue.ending || "fade"} options={ENDINGS} notes={ENDING_NOTE} onChange={(value) => change(withEnding(cue, value, defaults))} /></Prop>
                  <Prop label="Shape"><IconSeg label="Shape" value={cue.shape || "sphere"} options={SHAPES} notes={SHAPE_NOTE} onChange={(value) => change(withShape(cue, value))} /></Prop>
                  <Prop label="Spin">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                      <Field label="Spin" unit="°/s" value={spinOf(cue, defaults)} min={-1440} max={1440} onChange={(value) => change({ ...cue, spin_deg_per_s: value })} />
                      <Btn size="sm" className="!h-[30px]" disabled={cue.spin_deg_per_s == null} onClick={() => { const next = { ...cue }; delete next.spin_deg_per_s; change(next); }}>Default</Btn>
                    </div>
                  </Prop>
                  <Prop label="Glow">
                    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2">
                      <Slider label="Glow" value={cue.grade?.glow ?? 0.6} min={0} max={1} step={0.05} onChange={(value) => change({ ...cue, grade: { ...cue.grade, glow: value } }, { live: true })} format={(value) => `${Math.round(value * 100)}%`} />
                      <span className={cx("fx-field flex items-center justify-between px-2.5 text-xs tnum", ROW)}>{Math.round((cue.grade?.glow ?? 0.6) * 100)}<span className="text-faint">%</span></span>
                    </div>
                  </Prop>
                  <Prop label="Tint">
                    <label className={cx("fx-field flex cursor-pointer items-center gap-2 px-1.5", ROW)}>
                      <input aria-label="Tint" type="color" className="h-5 w-7 flex-none cursor-pointer rounded-[4px] border-0 bg-transparent p-0" value={cue.grade?.tint || "#9fd4ff"} onChange={(event) => change({ ...cue, grade: { ...cue.grade, tint: event.target.value } }, { live: true })} />
                      <span className="text-xs uppercase text-ink tnum">{cue.grade?.tint || "#9fd4ff"}</span>
                    </label>
                  </Prop>
                  <Prop label="Offset">
                    <Pair>
                      <Field label="Offset X" unit="x" value={cue.anchor_offset?.[0] ?? 0} min={-600} max={600} onChange={(value) => change({ ...cue, anchor_offset: [value, cue.anchor_offset?.[1] ?? 0] })} />
                      <Field label="Offset Y" unit="y" value={cue.anchor_offset?.[1] ?? 0} min={-600} max={600} onChange={(value) => change({ ...cue, anchor_offset: [cue.anchor_offset?.[0] ?? 0, value] })} />
                    </Pair>
                  </Prop>
                  <Notes group="look" warnings={warnings} />
                </>
              )}
            </Section>
          </>
        ) : !ready ? (
          <p className="px-4 py-4 text-xs leading-[18px] text-faint">The prompts and the seed open when tracking finishes. The styled-frame prompt is written from the look and behaviour, so it is ready to render as it is.</p>
        ) : (
          <>
            <Section id="frame" title="Styled frame" summary={promptAuto ? "Auto" : "Custom"} open={open.frame} onToggle={() => toggle("frame")} warn={attention === "error"}>
              <PromptBox id="frame-prompt" label="Styled frame" value={prompt} auto={promptAuto} onChange={onPrompt} onAuto={onPromptAuto} onCustom={() => onPrompt(prompt)} check
                autoNote="Written from the look and behaviour."
                customNote="Your own words. It no longer follows the look." />
              {promptStale && (
                <div className="flex items-center gap-2 rounded-[8px] bg-warn/[0.1] py-1 pl-2.5 pr-1 text-xs text-ink" role="status">
                  <Icon name="alert" size={13} className="flex-none text-warn" />
                  <span className="min-w-0 flex-1">Still describes {promptStale}</span>
                  <Btn size="sm" icon="retry" onClick={onPromptUpdate}>Update</Btn>
                </div>
              )}
            </Section>
            <Section id="video" title="Video" summary={videoAuto ? "Auto" : "Custom"} open={open.video} onToggle={() => toggle("video")}>
              <PromptBox id="video-prompt" label="Video" value={videoPrompt} auto={videoAuto} onChange={onVideoPrompt} onAuto={onVideoAuto} onCustom={() => onVideoPrompt(videoPrompt)}
                autoNote="The default motion prompt for the LTX pass."
                customNote="Your own words for the LTX pass." />
            </Section>
            <Section id="seed" title="Seed" summary={String(cue.seed ?? 42)} open={open.seed} onToggle={() => toggle("seed")}>
              <Prop label="Seed">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <Field label="Seed" value={cue.seed ?? 42} min={0} max={2147483647} onChange={(value) => change({ ...cue, seed: Math.round(value) })} />
                  <Square icon="dice" label="New seed" note="Same settings, a different result." onClick={onNewSeed} />
                </div>
              </Prop>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
