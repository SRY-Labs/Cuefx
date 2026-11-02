"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LOOKS, PROMPT_PLACEHOLDER, REFERENCE_LOOK, lookById } from "../lib/cue";
import { Btn, Icon, IconBtn } from "./ui";

function mixHex(a, b, t) {
  const read = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const from = read(a);
  const to = read(b);
  const mixed = from.map((value, index) => Math.round(value + (to[index] - value) * t));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function lookArt(id, prefix, tint) {
  const u = prefix + id;
  const color = tint || lookById(id).tint;
  const defs = (
    <defs>
      <radialGradient id={`${u}h`}><stop offset="0" stopColor={color} stopOpacity="0.75" /><stop offset="0.55" stopColor={color} stopOpacity="0.18" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
      <radialGradient id={`${u}c`}><stop offset="0" stopColor="#fff" /><stop offset="0.35" stopColor={mixHex(color, "#ffffff", 0.6)} /><stop offset="0.8" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0.7" /></radialGradient>
    </defs>
  );
  if (id === "fireball") {
    return (
      <>
        {defs}
        <circle cx="50" cy="52" r="46" fill={`url(#${u}h)`} />
        <path d="M50 14 C58 26 70 30 68 46 C67 40 60 38 58 34 C58 44 66 50 62 60 L38 60 C34 48 44 42 42 32 C40 38 36 40 34 44 C32 32 42 24 50 14Z" fill="#ff8a2a" opacity="0.85" />
        <circle cx="50" cy="56" r="20" fill={`url(#${u}c)`} />
        {[[24, 30], [76, 26], [30, 78], [74, 74], [62, 12], [16, 56], [84, 52]].map(([x, y], index) => <circle key={index} cx={x} cy={y} r={1.1 + (index % 3) * 0.5} fill="#ffd9a0" />)}
      </>
    );
  }
  if (id === "blue_plasma") {
    return (
      <>
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${u}h)`} />
        <circle cx="50" cy="50" r="19" fill={`url(#${u}c)`} />
        {[0, 60, 120].map((angle) => <ellipse key={angle} cx="50" cy="50" rx="34" ry="12" fill="none" stroke="#bfe6ff" strokeWidth="1.6" opacity="0.85" transform={`rotate(${angle} 50 50)`} />)}
      </>
    );
  }
  if (id === "electric_orb") {
    return (
      <>
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${u}h)`} />
        <circle cx="50" cy="50" r="17" fill={`url(#${u}c)`} />
        {[[50, 50, 22, 8, 34, 22, 30, 4], [50, 50, 74, 22, 62, 34, 86, 30], [50, 50, 78, 70, 64, 62, 90, 80], [50, 50, 24, 74, 38, 64, 14, 84], [50, 50, 50, 84, 56, 72, 46, 96]].map((points, index) => (
          <polyline key={index} points={`${points[0]},${points[1]} ${points[4]},${points[5]} ${points[2]},${points[3]} ${points[6]},${points[7]}`} fill="none" stroke="#efe9ff" strokeWidth="1.4" strokeLinejoin="round" />
        ))}
      </>
    );
  }
  if (id === "ice_sphere") {
    return (
      <>
        {defs}
        <circle cx="50" cy="50" r="44" fill={`url(#${u}h)`} />
        <circle cx="50" cy="50" r="22" fill="#cfeeff" opacity="0.9" />
        <circle cx="50" cy="50" r="22" fill={`url(#${u}c)`} opacity="0.55" />
        <path d="M36 44 L50 30 L64 44 L58 62 L42 62Z" fill="none" stroke="#fff" strokeWidth="1" opacity="0.7" />
        <ellipse cx="43" cy="40" rx="6" ry="3.5" fill="#fff" opacity="0.85" transform="rotate(-30 43 40)" />
        <ellipse cx="50" cy="76" rx="34" ry="5" fill="#dff4ff" opacity="0.18" />
      </>
    );
  }
  if (id === "shadow_energy") {
    return (
      <>
        {defs}
        <circle cx="50" cy="50" r="46" fill={`url(#${u}h)`} opacity="0.7" />
        <circle cx="50" cy="50" r="21" fill="#07050c" stroke="#9a73e6" strokeWidth="2.2" />
        <circle cx="50" cy="50" r="24" fill="none" stroke="#c4a8ff" strokeWidth="0.8" opacity="0.6" />
        <path d="M30 70 C22 60 34 56 28 46 M70 70 C80 60 66 54 74 42 M50 28 C44 20 54 14 48 6" fill="none" stroke="#6d4cc0" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </>
    );
  }
  return (
    <>
      {defs}
      <circle cx="50" cy="50" r="46" fill={`url(#${u}h)`} />
      <circle cx="50" cy="50" r="18" fill={`url(#${u}c)`} />
    </>
  );
}

export function LookStill({ id, className = "h-full w-full" }) {
  const uid = `ls${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 100 100" className={`block rounded bg-black ${className}`} aria-hidden="true">
      {lookArt(id, uid)}
    </svg>
  );
}

function checkPrompt(prompt, lookId) {
  const text = prompt.trim();
  if (!text) return [{ severity: "info", message: `No prompt: the ${lookById(lookId).name} example is used.` }];
  const issues = [];
  if (text.length > 800) issues.push({ severity: "error", message: `The prompt is ${text.length} characters. Cut it down to 800: what the effect is made of, and what happens over time.` });
  if (text.length < 40) issues.push({ severity: "warning", message: "Short prompts leave the picture guessing. Say what the effect is made of and what happens over time." });
  if (!/camera (stays|is|remains) (fixed|still|locked)|locked[- ]off|static camera/i.test(text)) issues.push({ severity: "warning", message: "Add “camera stays fixed” at the end so the shot itself does not move." });
  return issues;
}

function probeImage(file) {
  return new Promise((resolve) => {
    if (!file.type?.startsWith("image/")) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, 48, 48);
        const data = context.getImageData(0, 0, 48, 48).data;
        let sum = 0;
        let count = 0;
        for (let y = 0; y < 48; y += 1) {
          for (let x = 0; x < 48; x += 1) {
            if (x < 4 || y < 4 || x > 43 || y > 43) {
              const index = (y * 48 + x) * 4;
              sum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
              count += 1;
            }
          }
        }
        resolve({ width: image.naturalWidth, height: image.naturalHeight, borderLuma: sum / count, url });
      } catch {
        resolve({ width: image.naturalWidth, height: image.naturalHeight, borderLuma: 0, url });
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function IssueLine({ severity, children }) {
  const tone = severity === "error" ? "text-err" : severity === "warning" ? "text-warn" : "text-mute";
  const icon = severity === "info" ? "info" : "alert";
  return (
    <div className="flex items-start gap-2 text-sm text-ink">
      <Icon name={icon} size={15} className={`mt-0.5 ${tone}`} />
      <span>{children}</span>
    </div>
  );
}

function startingPicked(cue, variants) {
  const known = LOOKS.some((look) => look.id === cue.look) || (cue.look === "reference");
  const main = known ? cue.look : "fireball";
  return [main, ...variants.filter((id) => id !== main)].slice(0, 3);
}

export default function LookPicker({ cue, variants, reference: referenceIn, onClose, onApply }) {
  const panel = useRef(null);
  const fileInput = useRef(null);
  const [picked, setPicked] = useState(() => startingPicked(cue, variants));
  const [prompt, setPrompt] = useState(cue.prompt || lookById(startingPicked(cue, variants)[0]).prompt);
  const [reference, setReference] = useState(referenceIn);
  const [refState, setRefState] = useState(referenceIn ? "ready" : "none");
  const [refErr, setRefErr] = useState(null);
  const [limit, setLimit] = useState(false);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const main = picked[0];
  const look = lookById(main);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function swapPrompt(previous, next) {
    if (previous !== next && (prompt === lookById(previous).prompt || !prompt.trim())) setPrompt(lookById(next).prompt);
  }

  function toggle(id) {
    setLimit(false);
    if (picked.includes(id)) {
      if (picked.length === 1) return;
      const next = picked.filter((item) => item !== id);
      setPicked(next);
      swapPrompt(main, next[0]);
      return;
    }
    if (picked.length >= 3) {
      setLimit(id === "reference" ? "ref" : "max");
      return;
    }
    setPicked([...picked, id]);
  }

  function makeMain(id) {
    const next = [id, ...picked.filter((item) => item !== id)];
    setPicked(next);
    swapPrompt(main, id);
  }

  async function onRefFile(file) {
    setRefState("checking");
    setRefErr(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setRefErr("That file is not a PNG, JPG or WebP image. Export a still of the effect and upload it again.");
      setRefState(reference ? "ready" : "error");
      return;
    }
    if (file.size > 20 * 1048576) {
      setRefErr("The image is over 20 MB. Save it as a JPG or scale it down, then upload it again.");
      setRefState(reference ? "ready" : "error");
      return;
    }
    const probe = await probeImage(file);
    if (!probe) {
      setRefErr("The image could not be read. It may be damaged; export it again and retry.");
      setRefState(reference ? "ready" : "error");
      return;
    }
    const warnings = [];
    if (probe.borderLuma > 0.25) warnings.push("The background is bright. A still of the effect on black works best, so the background is not copied into the shot.");
    if (Math.min(probe.width, probe.height) < 256) warnings.push(`The image is only ${probe.width}×${probe.height}. Below 256 px the details turn soft.`);
    const nextRef = { name: file.name, url: probe.url, width: probe.width, height: probe.height, warnings };
    setReference(nextRef);
    setRefState("ready");
    const current = pickedRef.current;
    if (!current.includes("reference")) {
      if (current.length >= 3) setLimit("ref");
      else setPicked([...current, "reference"]);
    }
  }

  function removeRef() {
    setReference(null);
    setRefState("none");
    setRefErr(null);
    const next = picked.filter((id) => id !== "reference");
    const fallback = next.length ? next : ["fireball"];
    setPicked(fallback);
    swapPrompt(main, fallback[0]);
  }

  const issues = checkPrompt(prompt, main);
  const promptErr = issues.some((issue) => issue.severity === "error");
  const refWarn = reference && picked.includes("reference") ? reference.warnings : [];
  const warningCount = issues.filter((issue) => issue.severity === "warning").length + refWarn.length;

  function card(id, name, note, art) {
    const selected = picked.includes(id);
    const index = picked.indexOf(id);
    return (
      <button key={id} type="button" role="checkbox" aria-checked={selected} aria-label={`${name}${selected ? `, selected, number ${index + 1}${index === 0 ? ", main look" : ""}` : ""}`} onClick={() => toggle(id)}
        className={`relative rounded-md border bg-panel p-1.5 text-left ${selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line2"}`}>
        <div className="relative aspect-square">
          {art}
          {selected && <span className="absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent tnum">{index + 1}</span>}
          {selected && index === 0 && <span className="absolute right-1.5 top-1.5 inline-flex h-4 items-center rounded bg-black/70 px-1.5 text-2xs text-white">Main</span>}
        </div>
        <div className="px-1 pb-0.5 pt-1.5">
          <div className="text-sm font-medium text-ink">{name}</div>
          <div className="truncate text-2xs text-mute">{note}</div>
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Choose a look" onMouseDown={onClose}>
      <div ref={panel} className="flex h-[660px] max-h-full w-[1000px] max-w-full flex-col overflow-hidden rounded-lg border border-line2 bg-bg shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex h-14 flex-none items-center gap-3 border-b border-line bg-panel px-5">
          <div>
            <h2 className="text-base font-semibold leading-5">Choose a look</h2>
            <p className="text-xs text-mute">Pick up to 3. The first one is the look you direct with, and the one the stand-in draws.</p>
          </div>
          <div className="flex-1" />
          <IconBtn icon="x" label="Close the look picker" onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {limit && (
              <p className="mb-3 text-sm text-warn" role="status">
                {limit === "ref" ? "Your reference is added, but 3 looks are already selected. Remove one to include it." : "You can pick up to 3 looks. Remove one first, then add this one."}
              </p>
            )}
            {refErr && <p className="mb-3 text-sm text-err" role="alert">{refErr}</p>}
            <div className="grid grid-cols-3 gap-3">
              {LOOKS.map((item) => card(item.id, item.name, item.note, <LookStill id={item.id} />))}
              {reference ? (
                <div className="relative">
                  {card("reference", reference.name, `${reference.width}×${reference.height} · your reference`, (
                    <>
                      <img src={reference.url} alt="Your reference still" className="block h-full w-full rounded bg-black object-cover" />
                      {reference.warnings.length > 0 && <span className="absolute bottom-1.5 left-1.5 inline-flex h-5 items-center gap-1 rounded bg-black/80 px-1.5 text-2xs font-medium text-warn"><Icon name="alert" size={12} />{reference.warnings[0].startsWith("The background") ? "Bright background" : "Small image"}</span>}
                    </>
                  ))}
                  <span className="absolute right-3 top-3">
                    <IconBtn icon="trash" label="Remove the reference image" className="!h-6 !w-6 bg-black/70" onClick={removeRef} />
                  </span>
                </div>
              ) : (
                <div className={`flex min-h-[190px] flex-col items-center justify-center rounded-md border border-dashed bg-panel p-3 text-center ${refState === "error" ? "border-err/60" : "border-line2"}`}
                  onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) onRefFile(event.dataTransfer.files[0]); }}>
                  {refState === "checking" ? (
                    <div role="status" className="flex flex-col items-center gap-2 text-sm text-mute"><Icon name="loader" size={20} className="spin" />Checking the image…</div>
                  ) : (
                    <>
                      <Icon name="image" size={22} className="text-mute" />
                      <div className="mt-1.5 text-sm font-medium text-ink">Upload your own reference image</div>
                      <p className="mt-1 text-2xs text-mute">A still of the effect on black works best.</p>
                      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a reference image" tabIndex={-1} onChange={(event) => { if (event.target.files[0]) onRefFile(event.target.files[0]); event.target.value = ""; }} />
                      <Btn size="sm" className="mt-2" icon="upload" onClick={() => fileInput.current?.click()}>Choose image</Btn>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <aside className="flex w-[340px] flex-none flex-col border-l border-line bg-panel" aria-label="Prompt and selection">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="look-prompt" className="text-2xs font-semibold uppercase tracking-wider text-mute">Prompt for {look.name}</label>
                  <span className={`text-2xs tnum ${promptErr ? "text-err" : "text-faint"}`}>{prompt.trim().length} / 800</span>
                </div>
                <textarea id="look-prompt" rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={PROMPT_PLACEHOLDER}
                  className={`mt-1.5 w-full resize-none rounded border bg-field px-2.5 py-2 text-sm leading-5 text-ink ${promptErr ? "border-err" : "border-line focus:border-accent"}`} />
                <div className="mt-1 flex gap-1">
                  <Btn size="sm" variant="ghost" onClick={() => setPrompt(LOOKS[Math.floor(Math.random() * LOOKS.length)].prompt)}>Surprise Me</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setPrompt(look.prompt || REFERENCE_LOOK.prompt)}>Use the {look.name} example</Btn>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {issues.map((issue) => <IssueLine key={issue.message} severity={issue.severity}>{issue.message}</IssueLine>)}
                  {refWarn.map((warning) => <IssueLine key={warning} severity="warning">{warning}</IssueLine>)}
                  {issues.length === 0 && refWarn.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-mute"><Icon name="check" size={15} className="text-accent" />The prompt follows the format.</div>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-mute">Selected · {picked.length} of 3</div>
                <ol className="flex flex-col gap-1">
                  {picked.map((id, index) => {
                    const item = lookById(id);
                    return (
                      <li key={id} className="flex items-center gap-2 rounded border border-line bg-field p-1.5">
                        <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent tnum">{index + 1}</span>
                        <span className="h-7 w-7 flex-none">
                          {id === "reference" && reference ? <img src={reference.url} alt="" className="h-full w-full rounded object-cover" /> : <LookStill id={id} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{item.name}{index === 0 && <span className="text-2xs text-faint"> · main</span>}</span>
                        {index > 0 && <Btn size="sm" variant="ghost" className="!h-6 !px-1.5" onClick={() => makeMain(id)}>Make main</Btn>}
                        <IconBtn icon="x" label={`Remove ${item.name}`} className="!h-6 !w-6" disabled={picked.length === 1} onClick={() => toggle(id)} />
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
            <div className="flex flex-none flex-col gap-2 border-t border-line p-4">
              <div className="flex items-center justify-between text-xs text-mute tnum">
                <span>{picked.length} look{picked.length > 1 ? "s" : ""} · the stand-in draws the main look</span>
                {warningCount > 0 && <span className="text-warn">{warningCount} warning{warningCount > 1 ? "s" : ""}</span>}
              </div>
              <Btn variant="primary" icon="orb" disabled={promptErr || refState === "checking"} onClick={() => onApply({ picked, prompt, reference, generate: true })}>{`Generate ${picked.length} ${picked.length > 1 ? "looks" : "look"}`}</Btn>
              <div className="flex gap-2">
                <Btn className="flex-1" disabled={promptErr || refState === "checking"} onClick={() => onApply({ picked, prompt, reference, generate: false })}>Use {look.name}</Btn>
                <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              </div>
              {promptErr && <p className="text-xs text-err">Shorten the prompt to continue.</p>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
