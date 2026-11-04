"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const ICONS = {
  film: "M4 6h16v12H4zM8 6v12M16 6v12M4 10h4M4 14h4M16 10h4M16 14h4",
  upload: "M12 16V6M8 9l4-4 4 4M5 19h14",
  download: "M12 5v10M8 11l4 4 4-4M5 19h14",
  play: "M8 6l10 6-10 6z",
  pause: "M7 6h4v12H7zM13 6h4v12h-4z",
  check: "M5 12l5 5L20 7",
  x: "M7 7l10 10M17 7L7 17",
  loader: "M12 4a8 8 0 1 1-8 8",
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
  alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
  info: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01",
  route: "M4 16c4-8 12-8 16 0M8 16h.01M16 10h.01",
  cursor: "M5 4l6 16 2-6 6-2z",
  hand: "M8 11V6M12 11V4M16 11V6M8 11c0 5 1.5 8 4 8s4-3 4-8",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z",
  plus: "M12 5v14M5 12h14",
  target: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  chevDown: "M6 9l6 6 6-6",
  chevRight: "M9 6l6 6-6 6",
  image: "M4 5h16v14H4zM4 15l4-4 3 3 3-4 6 6",
  orb: "M5 12a7 7 0 1 0 14 0 7 7 0 1 0-14 0",
  trash: "M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12",
  palette: "M12 4a8 8 0 0 0 0 16c1.1 0 1.6-.8 1.3-1.7-.4-1.1.3-2.3 1.5-2.3H17a3 3 0 0 0 3-3c0-5-3.6-9-8-9zM8 11h.01M10.5 7.5h.01M14.5 7.5h.01",
  sliders: "M5 7h8M17 7h2M15 5v4M5 17h2M11 17h8M9 15v4",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  palm: "M7 12.5V7a1.5 1.5 0 0 1 3 0v4M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V12M16 12V8.5a1.5 1.5 0 0 1 3 0V14c0 4-3 7-7 7-3 0-5-2-6.5-4.5L4 13a1.5 1.5 0 0 1 2.6-1.5L7 12.5",
  fist: "M6 10a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v3a7 7 0 0 1-7 7h-1a5 5 0 0 1-5-5zM10 7v4M13.5 7v4M6 12.5h5",
  foot: "M10 3h3.5c0 4-.5 7 1.5 9.5s4 3.5 4 5.5a3 3 0 0 1-3 3H10c-2.2 0-3.5-1.8-3.5-4 0-3 1.8-5 2-8 .1-2.2.5-4.2 1.5-6z",
  knee: "M9 3l4 8.5L8 21M16 21l-3-9.5M13 9.3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z",
  shoulder: "M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.5 20c0-4.2 3.5-7 8.5-7s8.5 2.8 8.5 7M5.8 14.6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  head: "M12 3.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM9.5 10h.01M14.5 10h.01M9.5 14c1.4 1 3.6 1 5 0",
  hold_throw: "M5 19c4-1 7-5 9-11M16 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  charge_up: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 4.5a7.5 7.5 0 0 1 7.5 7.5M12 19.5A7.5 7.5 0 0 1 4.5 12",
  orbit: "M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5.5 17.5C2.6 15 6.3 9.3 12 7.2s10.5-.6 8.6 2.6M18.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM16 17.6c-3.6 1.4-7 1.2-8.4-.1",
  hold: "M12 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM8 19.5h8",
  sphere: "M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM4.5 12c2.5 2 12.5 2 15 0",
  ring: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  crystal: "M12 3l6 7-6 11-6-11zM6 10h12",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  fade: "M12 4.5a7.5 7.5 0 0 1 0 15M9.1 5.1l-.6.3M6.2 7.1l-.4.5M4.7 10.3l-.1.7M4.7 13.7l.2.6M6.2 16.9l.4.5M9.1 18.9l.6.2",
  burst: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1",
  shatter: "M5 6l5 1-1 5zM14 4l5 4-5 2zM4 15l5-1 1 6zM13 14l6 1-2 5z",
  pen: "M4 18c3-6 6-9 9-9M13 9l3-3 3 3-3 3zM4 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  undo: "M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  redo: "M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2",
  stepBack: "M7 6v12M18 6l-8 6 8 6z",
  stepFwd: "M17 6v12M6 6l8 6-8 6z",
  loop: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  magnet: "M6 4v7a6 6 0 0 0 12 0V4M6 8h4M14 8h4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18",
  dice: "M5 5h14v14H5zM9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01",
  text: "M5 6h14M5 12h14M5 18h9",
  retry: "M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5",
  even: "M4 7h16M4 12h16M4 17h16M8 5v4M12 10v4M16 15v4",
  stack: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  minus: "M5 12h14",
  compare: "M4 5h16v14H4zM12 5v14",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
};

export function Icon({ name, size = 16, className, stroke = 2 }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Btn({ variant = "secondary", size = "md", children, className, icon, ...props }) {
  const styles = {
    primary: "bg-accent text-on-accent hover:bg-accent-hi",
    secondary: "bg-panel text-ink border border-line2 hover:bg-raised",
    ghost: "text-mute hover:text-ink hover:bg-raised",
    danger: "bg-err/15 text-err border border-err/40 hover:bg-err/25",
  };
  const height = size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  return (
    <button type="button" className={cx("inline-flex items-center gap-2 rounded-[10px] font-medium transition-colors disabled:opacity-45", height, styles[variant], className)} {...props}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function IconBtn({ icon, label, active, className, ...props }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("inline-flex h-8 w-8 items-center justify-center rounded border disabled:opacity-40", active ? "border-accent bg-accent/20 text-accent" : "border-line2 bg-raised text-mute hover:text-ink", className)} {...props}>
      <Icon name={icon} size={15} />
    </button>
  );
}

export function Alert({ error, children, action, icon }) {
  return (
    <div role="alert" title={error?.code ? `${error.code}${error.status ? ` · ${error.status}` : ""}` : undefined} className={cx("rounded-[10px] border border-err/40 px-3 py-2 text-sm", icon ? "bg-err/5" : "bg-err/10")}>
      {icon
        ? <div className="flex items-center gap-1.5 font-semibold text-err"><Icon name={icon} size={15} className="flex-none" />{children}</div>
        : <div className="font-semibold text-ink">{children}</div>}
      {error?.message && <p className="mt-1 text-mute">{error.message}</p>}
      {/* The code stays available for support, without putting it in front of people. */}
      {error?.code && <span className="sr-only">{error.code}{error.status ? ` ${error.status}` : ""}</span>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-mute">
      {label}
      {children}
    </label>
  );
}

export function Num({ value, min, max, step = 1, onChange, disabled }) {
  const [text, setText] = useState(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      className="h-7 w-full min-w-[4.5rem] rounded border border-line bg-field px-1.5 text-xs text-ink tnum disabled:opacity-40"
      value={text ?? value ?? ""}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
        const next = Number(raw);
        if (Number.isFinite(next)) onChange(next);
      }}
      onBlur={() => setText(null)}
    />
  );
}

const SEG_COLUMNS = { 2: "grid grid-cols-2", 3: "grid grid-cols-3" };

export function Seg({ label, value, options, onChange, disabled, columns }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("gap-0.5 rounded border border-line bg-field p-0.5", columns ? SEG_COLUMNS[columns] : "flex")}>
      {options.map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} title={text} disabled={disabled} onClick={() => onChange(id)}
          className={cx("flex min-h-[30px] min-w-0 items-center justify-center rounded-sm px-0.5 py-0.5 text-center text-[10.5px] leading-tight disabled:opacity-35", columns ? "" : "flex-1", value === id ? "bg-accent/20 text-accent" : "text-mute hover:bg-raised hover:text-ink")}>
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-8 w-full items-center gap-1 px-2 text-left text-2xs font-semibold uppercase tracking-wider text-mute hover:text-ink">
        <Icon name={open ? "chevDown" : "chevRight"} size={14} />
        <span className="flex-1">{title}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Row({ label, hint, children }) {
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)] items-start gap-1.5 py-1">
      <div className="pt-1.5 text-2xs text-mute">{label}</div>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-0.5 text-[10.5px] leading-[14px] text-faint">{hint}</p>}
      </div>
    </div>
  );
}

export function Note({ severity = "info", children }) {
  const tone = severity === "error" ? "text-err" : severity === "warning" ? "text-warn" : "text-mute";
  return (
    <div className="flex gap-1.5 rounded border border-line bg-bg px-2 py-1.5" role="status">
      <Icon name={severity === "info" ? "info" : "alert"} size={14} className={cx("mt-px flex-none", tone)} />
      <p className="text-xs leading-4 text-ink">{children}</p>
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input aria-label={label} className="cue-range" type="range" min={min} max={max} step={step} value={value} style={{ "--fill": `${fill}%` }}
      onChange={(event) => onChange(Number(event.target.value))} title={format ? format(value) : String(value)} />
  );
}

/**
 * A hover and focus tooltip: the name, one line on what it does, and the shortcut. It shows after a short pause,
 * so passing the pointer over a row of controls does not flash a stack of them. It renders above everything, so a
 * scrolling panel never clips it.
 */
export function Tip({ title, note, kbd, side = "top", children, className, preview }) {
  const anchor = useRef(null);
  const timer = useRef(0);
  const [at, setAt] = useState(null);
  const id = useId();

  function show() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box || (!box.width && !box.height)) return;
      setAt({ x: box.left + box.width / 2, top: box.top, bottom: box.bottom });
    }, 350);
  }
  function hide() {
    clearTimeout(timer.current);
    setAt(null);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span ref={anchor} className={cx("relative inline-flex", className)} onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }} onPointerLeave={hide}
      onFocus={(event) => { if (event.target.matches?.(":focus-visible")) show(); }} onBlur={hide} onPointerDown={hide} aria-describedby={at ? id : undefined}>
      {children}
      {at && typeof document !== "undefined" && createPortal(<TipBox id={id} at={at} side={side} title={title} note={note} kbd={kbd} preview={preview} />, document.body)}
    </span>
  );
}

function TipBox({ id, at, side, title, note, kbd, preview }) {
  const box = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const gap = 8;
    let top = side === "bottom" ? at.bottom + gap : at.top - h - gap;
    if (top < 4) top = at.bottom + gap;
    if (top + h > window.innerHeight - 4) top = at.top - h - gap;
    const left = Math.min(Math.max(8, at.x - w / 2), window.innerWidth - w - 8);
    setPos({ left, top });
  }, [at, side]);
  return (
    <span ref={box} id={id} role="tooltip" style={pos}
      className="pointer-events-none fixed z-[200] flex w-max max-w-[240px] flex-col gap-1 rounded-[10px] border border-line2 bg-raised px-3 py-2 text-left shadow-[0_14px_34px_-10px_rgb(0_0_0/0.7)]">
      {preview}
      <span className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-ink">
        {title}
        {kbd && <kbd className="ml-auto rounded border border-line2 px-1.5 font-sans text-[10px] font-medium text-mute">{kbd}</kbd>}
      </span>
      {note && <span className="text-[11.5px] font-normal leading-4 text-mute">{note}</span>}
    </span>
  );
}
