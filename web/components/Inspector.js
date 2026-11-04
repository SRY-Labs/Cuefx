"use client";

import { useEffect, useState } from "react";
import {
  BEHAVIOURS, BEHAVIOUR_NOTE, EASINGS, ENDINGS, ENDING_NOTE, LOOKS, PARTS, SHAPES, holdsOnBody, lookById, movePathPoint,
  orbitValue, partOf, setPointEasing, setPointFrame, setTiming, sideOf, spinOf, withDiameter, withEnding, withShape,
} from "../lib/cue";
import { checkPrompt } from "../lib/prompt";
import { LookStill } from "./LookStill";
import { Btn, Icon, Note, Num, Slider, Tip, cx } from "./ui";

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
      {notes.map((warning) => <li key={warning.id || warning.code}><Note severity={warning.severity}>{warning.message}</Note></li>)}
    </ul>
  );
}

function Group({ id, icon, iconClass, title, summary, open, onToggle, disabled, warn, children }) {
  return (
    <section className="border-t border-line first:border-t-0" aria-labelledby={`group-${id}`}>
      <button type="button" id={`group-${id}`} aria-expanded={open} disabled={disabled} onClick={onToggle}
        className="flex h-11 w-full items-center gap-2 text-left text-[13px] font-semibold text-ink disabled:opacity-50">
        <Icon name={open && !disabled ? "chevDown" : "chevRight"} size={14} className="text-faint" />
        <Icon name={icon} size={15} className={iconClass} />
        {title}
        <span className="flex-1" />
        {warn && <Icon name="alert" size={13} className="text-warn" />}
        {summary && <span className="min-w-0 truncate text-xs font-normal text-faint">{summary}</span>}
      </button>
      {open && !disabled && <div className="flex flex-col gap-3 pb-4">{children}</div>}
    </section>
  );
}

function Prop({ label, children, top }) {
  return (
    <div className={cx("grid grid-cols-[72px_minmax(0,1fr)] gap-2.5 text-xs", top ? "items-start" : "items-center")}>
      <span className={cx("text-mute", top && "pt-1.5")}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Icon-only choices; each one names itself in a tooltip with a line on what it does. */
function IconSeg({ label, value, options, notes, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[8px] border border-line bg-field p-0.5">
      {options.map(([id, name]) => (
        <Tip key={id} title={name} note={notes?.[id]} className="flex-1">
          <button type="button" role="radio" aria-checked={value === id} aria-label={name} disabled={disabled} onClick={() => onChange(id)}
            className={cx("flex h-[30px] w-full items-center justify-center rounded-[6px] disabled:opacity-40", value === id ? "bg-raised text-ink" : "text-mute hover:text-ink")}>
            <Icon name={id} size={16} stroke={1.75} />
          </button>
        </Tip>
      ))}
    </div>
  );
}

function TextSeg({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[8px] border border-line bg-field p-0.5">
      {options.map(([id, name]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}
          className={cx("h-[28px] flex-1 rounded-[6px] text-[11.5px] font-medium", value === id ? "bg-raised text-ink" : "text-mute hover:text-ink")}>
          {name}
        </button>
      ))}
    </div>
  );
}

function FrameField({ label, value, min, max, onChange, unit = "f", step = 1 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-faint">{label}</span>
      <span className="flex items-center gap-1">
        <Num value={value} min={min} max={max} step={step} onChange={onChange} />
        <span className="w-3 flex-none text-[11px] text-faint">{unit}</span>
      </span>
    </label>
  );
}

function PromptBox({ id, label, value, auto, onChange, onAuto, autoNote, customNote, check }) {
  const issues = check ? checkPrompt(value) : [];
  const error = issues.some((issue) => issue.severity === "error");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-ink">{label}</label>
        <span className={cx("tnum", error ? "text-err" : "text-faint")}>{auto ? "Auto" : "Custom"} · {value.trim().length} / 800</span>
      </div>
      <p className="text-[11.5px] leading-4 text-faint">
        {auto ? autoNote : customNote}{" "}
        {!auto && <button type="button" className="font-medium text-accent hover:underline" onClick={onAuto}>Back to auto</button>}
      </p>
      <textarea id={id} rows={4} value={value} onChange={(event) => onChange(event.target.value)}
        className={cx("w-full resize-y rounded-[8px] border bg-field px-2.5 py-2 text-xs leading-[18px] text-ink", error ? "border-err" : "border-line focus:border-accent")} />
      {issues.filter((issue) => issue.severity !== "info").map((issue) => (
        <p key={issue.message} className={cx("flex items-start gap-1.5 text-[11.5px] leading-4", issue.severity === "error" ? "text-err" : "text-mute")}>
          <Icon name="alert" size={12} className={cx("mt-0.5 flex-none", issue.severity === "error" ? "text-err" : "text-warn")} />{issue.message}
        </p>
      ))}
    </div>
  );
}

export default function Inspector(props) {
  const {
    cue, ready, anchor, switching, trackError, uncertain, picking, onPart, onSide, onPick, onShowUncertain,
    warnings, selected, setSelected, setFrame, frames, defaults, change, begin, end, onBehaviour, onLook,
    onReset, canReset, onEvenOut, evening, onAddPoint, onDeletePoint,
    prompt, promptAuto, onPrompt, onPromptAuto, promptStale, onPromptUpdate,
    videoPrompt, videoAuto, onVideoPrompt, onVideoAuto, onNewSeed,
  } = props;
  const [open, setOpen] = useState({ anchor: true, motion: true, look: false, prompt: false });
  const toggle = (id) => setOpen((value) => ({ ...value, [id]: !value[id] }));

  // Selecting a path point (on the video or the timeline) shows its fields, so open the group it lives in.
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

  return (
    <aside aria-label="Effect settings" className="flex w-full flex-none flex-col min-[901px]:min-h-0 border-line bg-panel min-[901px]:w-[340px] min-[901px]:border-l">
      <div className="flex h-12 flex-none items-center gap-2 px-4">
        <h2 className="text-sm font-semibold text-ink">Effect</h2>
        <span className="flex-1" />
        {cue?.effect_range && <span className="text-xs text-faint tnum">f {cue.effect_range.start}–{cue.effect_range.end - 1}</span>}
      </div>
      <div className="px-4 pb-6 min-[901px]:min-h-0 min-[901px]:flex-1 min-[901px]:overflow-y-auto">
        <Group id="anchor" icon="target" iconClass="text-track" title="Anchor" summary={anchorName} open={open.anchor} onToggle={() => toggle("anchor")} warn={!!trackError || has("anchor") || uncertain > 0}>
          <div role="radiogroup" aria-label="Body point" className="grid grid-cols-3 gap-1">
            {PARTS.map(([id, name]) => (
              <Tip key={id} title={name} note={PART_NOTE[id]} className="w-full">
                <button type="button" role="radio" aria-checked={part === id} disabled={!!switching} onClick={() => onPart(id)}
                  className={cx("flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-[9px] border text-[11px] font-medium disabled:opacity-50",
                    part === id ? "border-track/70 bg-track/15 text-track" : "border-line bg-field text-mute hover:border-line2 hover:text-ink")}>
                  <Icon name={id} size={20} stroke={1.6} />{name}
                </button>
              </Tip>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
            {part !== "head" ? (
              <TextSeg label="Side" value={side} options={[["left", "Left"], ["right", "Right"]]} onChange={(value) => { if (!switching) onSide(value); }} />
            ) : <span />}
            <Tip title="Pick on the video" note="Click the person, or the exact point, to track." kbd="B" align="end">
              <button type="button" aria-label="Pick on the video" aria-pressed={picking} disabled={!!switching} onClick={onPick}
                className={cx("inline-flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border disabled:opacity-50", picking ? "border-track bg-track/15 text-track" : "border-line bg-field text-mute hover:text-ink")}>
                <Icon name="target" size={15} />
              </button>
            </Tip>
          </div>
          {switching && <p className="flex items-center gap-1.5 text-xs text-mute" role="status"><Icon name="loader" size={13} className="spin" />Tracking the {switching}… about 20 s. Your path, look and timing stay.</p>}
          {trackError && <Note severity="error">{trackError}</Note>}
          {ready && uncertain > 0 && (
            <div className="flex items-center gap-2 text-xs text-warn">
              <Icon name="alert" size={13} />Unsure on {uncertain} frame{uncertain === 1 ? "" : "s"}
              <span className="flex-1" />
              <button type="button" className="font-medium text-accent hover:underline" onClick={onShowUncertain}>Show</button>
            </div>
          )}
          <Notes group="anchor" warnings={warnings} />
        </Group>

        <Group id="motion" icon="route" iconClass="text-path" title="Motion" summary={ready ? BEHAVIOURS.find(([id]) => id === behaviour)?.[1] : null} open={open.motion} onToggle={() => toggle("motion")} disabled={!ready} warn={has("motion")}>
          {ready && (
            <>
              <Prop label="Behaviour"><IconSeg label="Behaviour" value={behaviour} options={BEHAVIOURS} notes={BEHAVIOUR_NOTE} onChange={onBehaviour} /></Prop>
              <Prop label="Timing" top>
                <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                  <FrameField label="Appear" value={cue.appear_frame} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "appear", value))} />
                  {!hold && <FrameField label="Release" value={cue.release_frame} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "release", value))} />}
                  <FrameField label="Vanish" value={cue.vanish?.start} min={0} max={frames - 1} onChange={(value) => change(setTiming(cue, "vanishStart", value))} />
                  <FrameField label="Gone" value={cue.vanish?.end} min={0} max={frames} onChange={(value) => change(setTiming(cue, "vanishEnd", value))} />
                  <FrameField label="Entrance" unit="s" step={0.05} value={cue.entrance?.seconds ?? 0} min={0} max={3} onChange={(value) => change({ ...cue, entrance: { seconds: value } })} />
                </div>
              </Prop>
              {!hold && (
                <Prop label="Path">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-ink tnum">{Math.max(0, (cue.route?.length || 1) - 1)} point{(cue.route?.length || 1) === 2 ? "" : "s"}</span>
                    <span className="flex-1" />
                    <Tip title="Add point" note="Adds a point after the last one. Or press P and click the video." kbd="P">
                      <button type="button" className="font-medium text-accent hover:underline" onClick={onAddPoint}>Add</button>
                    </Tip>
                    <Tip title="Reset path" note="Back to the path the editor opened with." >
                      <button type="button" className="font-medium text-accent hover:underline disabled:text-faint disabled:no-underline" disabled={!canReset} onClick={onReset}>Reset</button>
                    </Tip>
                    <Tip title="Even out" note="Re-times the points between release and the last one to a constant speed." align="end">
                      <button type="button" className="font-medium text-accent hover:underline disabled:text-faint disabled:no-underline" disabled={evening || (cue.route?.length || 0) < 3} onClick={onEvenOut}>{evening ? "Timing…" : "Even out"}</button>
                    </Tip>
                  </div>
                </Prop>
              )}
              {!hold && point && (
                <div className="-mx-2.5 flex flex-col gap-2.5 rounded-[10px] border border-path/30 bg-path/[0.07] p-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-path">
                    {selected === 0 ? "Release point" : `Point ${selected}`}
                    <span className="flex items-center gap-1">
                      {selected > 0 && (
                        <Tip title="Delete point" kbd="Delete" align="end">
                          <button type="button" aria-label="Delete point" className="inline-flex h-6 w-6 items-center justify-center rounded text-mute hover:bg-raised hover:text-err" onClick={onDeletePoint}><Icon name="trash" size={14} /></button>
                        </Tip>
                      )}
                      <Tip title="Done" kbd="Esc" align="end">
                        <button type="button" aria-label="Deselect point" className="inline-flex h-6 w-6 items-center justify-center rounded text-mute hover:bg-raised hover:text-ink" onClick={() => setSelected(null)}><Icon name="x" size={14} /></button>
                      </Tip>
                    </span>
                  </div>
                  {selected === 0 ? (
                    <p className="text-[11.5px] leading-4 text-mute">The path starts on the body point at release, frame {point.f}. Change the release in Timing or drag it on the timeline.</p>
                  ) : (
                    <>
                      <Prop label="Frame"><Num value={point.f} min={0} max={frames - 1} onChange={(value) => { const next = setPointFrame(cue, selected, value); change(next); setFrame(next.route[selected].f); }} /></Prop>
                      <Prop label="Position">
                        <div className="grid grid-cols-2 gap-1.5">
                          <Num value={Math.round(point.x)} min={-2000} max={4000} onChange={(value) => change(movePathPoint(cue, selected, value, point.y))} />
                          <Num value={Math.round(point.y)} min={-2000} max={3000} onChange={(value) => change(movePathPoint(cue, selected, point.x, value))} />
                        </div>
                      </Prop>
                      <Prop label="Easing"><TextSeg label="Easing" value={point.easing_in || "linear"} options={EASINGS} onChange={(value) => change(setPointEasing(cue, selected, value))} /></Prop>
                    </>
                  )}
                </div>
              )}
              {behaviour === "orbit" && ORBIT_FIELDS.map(([key, label, unit, min, max, step]) => (
                <Prop key={key} label={label}>
                  <span className="flex items-center gap-1.5">
                    <Num value={orbitValue(cue, key, defaults)} min={min} max={max} step={step} onChange={(value) => change({ ...cue, orbit: { ...cue.orbit, [key]: value } })} />
                    <span className="w-6 flex-none text-[11px] text-faint">{unit}</span>
                  </span>
                </Prop>
              ))}
              <Notes group="motion" warnings={warnings} />
            </>
          )}
        </Group>

        <Group id="look" icon="sparkle" iconClass="text-mute" title="Look" summary={look?.name} open={open.look} onToggle={() => toggle("look")} disabled={!ready} warn={has("look")}>
          {ready && (
            <>
              <div role="radiogroup" aria-label="Look" className="flex flex-wrap gap-1.5">
                {LOOKS.map((item) => (
                  <Tip key={item.id} title={item.name} note={item.note}>
                    <button type="button" role="radio" aria-checked={cue.look === item.id} aria-label={item.name} onClick={() => onLook(item.id)}
                      className={cx("h-10 w-10 overflow-hidden rounded-full border-2 bg-black p-0.5", cue.look === item.id ? "border-accent" : "border-transparent hover:border-line2")}>
                      <LookStill id={item.id} className="h-full w-full rounded-full" />
                    </button>
                  </Tip>
                ))}
              </div>
              <Prop label="Size">
                <div className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2">
                  <Slider label="Size" value={cue.diameter_px || 80} min={8} max={400} onChange={(value) => change(withDiameter(cue, value), { live: true })} format={(value) => `${value} px`} />
                  <Num value={cue.diameter_px} min={8} max={800} onChange={(value) => change(withDiameter(cue, value))} />
                </div>
              </Prop>
              <Prop label="Ending"><IconSeg label="Ending" value={cue.ending || "fade"} options={ENDINGS} notes={ENDING_NOTE} onChange={(value) => change(withEnding(cue, value, defaults))} /></Prop>
              <Prop label="Shape"><IconSeg label="Shape" value={cue.shape || "sphere"} options={SHAPES} notes={SHAPE_NOTE} onChange={(value) => change(withShape(cue, value))} /></Prop>
              <Prop label="Spin">
                <span className="flex items-center gap-1.5">
                  <Num value={spinOf(cue, defaults)} min={-1440} max={1440} onChange={(value) => change({ ...cue, spin_deg_per_s: value })} />
                  <span className="flex-none text-[11px] text-faint">°/s</span>
                  <Btn size="sm" variant="ghost" className="!h-7 !px-2" disabled={cue.spin_deg_per_s == null} onClick={() => { const next = { ...cue }; delete next.spin_deg_per_s; change(next); }}>Default</Btn>
                </span>
              </Prop>
              <Prop label="Glow">
                <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2">
                  <Slider label="Glow" value={cue.grade?.glow ?? 0.6} min={0} max={1} step={0.05} onChange={(value) => change({ ...cue, grade: { ...cue.grade, glow: value } }, { live: true })} format={(value) => `${Math.round(value * 100)}%`} />
                  <span className="text-right text-[11px] text-mute tnum">{Math.round((cue.grade?.glow ?? 0.6) * 100)}%</span>
                </div>
              </Prop>
              <Prop label="Tint">
                <input aria-label="Tint" type="color" className="h-7 w-full cursor-pointer rounded border border-line bg-field" value={cue.grade?.tint || "#9fd4ff"} onChange={(event) => change({ ...cue, grade: { ...cue.grade, tint: event.target.value } }, { live: true })} />
              </Prop>
              <Prop label="Offset">
                <div className="grid grid-cols-2 gap-1.5">
                  <Num value={cue.anchor_offset?.[0] ?? 0} min={-600} max={600} onChange={(value) => change({ ...cue, anchor_offset: [value, cue.anchor_offset?.[1] ?? 0] })} />
                  <Num value={cue.anchor_offset?.[1] ?? 0} min={-600} max={600} onChange={(value) => change({ ...cue, anchor_offset: [cue.anchor_offset?.[0] ?? 0, value] })} />
                </div>
              </Prop>
              <Notes group="look" warnings={warnings} />
            </>
          )}
        </Group>

        <Group id="prompt" icon="text" iconClass="text-mute" title="Prompt" summary={ready ? (promptAuto ? "Auto" : "Custom") : null} open={open.prompt} onToggle={() => toggle("prompt")} disabled={!ready} warn={ready && checkPrompt(prompt).some((issue) => issue.severity === "error")}>
          {ready && (
            <>
              <PromptBox id="frame-prompt" label="Styled frame" value={prompt} auto={promptAuto} onChange={onPrompt} onAuto={onPromptAuto} check
                autoNote="Written from Look and Motion. Type to make it your own."
                customNote="Your own wording. It no longer follows Look and Motion." />
              {promptStale && (
                <div className="flex items-center gap-2 rounded-[8px] border border-line bg-field px-2.5 py-2 text-xs text-mute">
                  <span className="flex-1">Still describes {promptStale}</span>
                  <Btn size="sm" icon="retry" onClick={onPromptUpdate}>Update</Btn>
                </div>
              )}
              <PromptBox id="video-prompt" label="Video" value={videoPrompt} auto={videoAuto} onChange={onVideoPrompt} onAuto={onVideoAuto}
                autoNote="The default motion prompt for the LTX pass."
                customNote="Your own wording for the LTX pass." />
              <Prop label="Seed">
                <span className="flex items-center gap-1.5">
                  <Num value={cue.seed ?? 42} min={0} max={2147483647} onChange={(value) => change({ ...cue, seed: Math.round(value) })} />
                  <Tip title="New seed" note="Same settings, a different result." align="end">
                    <button type="button" aria-label="New seed" className="inline-flex h-7 w-7 flex-none items-center justify-center rounded border border-line2 bg-raised text-mute hover:text-ink" onClick={onNewSeed}><Icon name="dice" size={14} /></button>
                  </Tip>
                </span>
              </Prop>
            </>
          )}
        </Group>
      </div>
    </aside>
  );
}
