"use client";

import { useState } from "react";

export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const ICONS = {
  film: "M4 6h16v12H4zM8 6v12M16 6v12M4 10h4M4 14h4M16 10h4M16 14h4",
  upload: "M12 16V6M8 9l4-4 4 4M5 19h14",
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
};

export function Icon({ name, size = 16, className }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Btn({ variant = "secondary", size = "md", children, className, icon, ...props }) {
  const styles = {
    primary: "bg-accent text-on-accent hover:bg-accent-hi",
    secondary: "bg-raised text-ink border border-line2 hover:border-mute",
    ghost: "text-mute hover:text-ink hover:bg-raised",
    danger: "bg-err/15 text-err border border-err/40 hover:bg-err/25",
  };
  const height = size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm";
  return (
    <button type="button" className={cx("inline-flex items-center gap-1.5 rounded disabled:opacity-40", height, styles[variant], className)} {...props}>
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

export function Alert({ error, children, action }) {
  return (
    <div role="alert" className="rounded-md border border-err/40 bg-err/10 px-3 py-2 text-sm">
      <div className="font-semibold text-ink">{children}</div>
      {error?.message && <p className="mt-1 text-mute">{error.message}</p>}
      {error?.code && <p className="mt-1 text-xs text-faint tnum">{error.code}{error.status ? ` · ${error.status}` : ""}</p>}
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
  return (
    <input
      type="number"
      className="h-8 w-full rounded border border-line bg-field px-2 text-sm text-ink tnum disabled:opacity-40"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

const SEG_COLUMNS = { 2: "grid grid-cols-2", 3: "grid grid-cols-3" };

export function Seg({ label, value, options, onChange, disabled, columns }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("gap-0.5 rounded border border-line bg-field p-0.5", columns ? SEG_COLUMNS[columns] : "flex")}>
      {options.map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} title={text} disabled={disabled} onClick={() => onChange(id)}
          className={cx("flex h-[34px] min-w-0 items-center justify-center whitespace-nowrap rounded-sm px-1 text-2xs leading-none disabled:opacity-35", columns ? "" : "flex-1", value === id ? "bg-accent/20 text-accent" : "text-mute hover:bg-raised hover:text-ink")}>
          <span className="truncate px-0.5">{text}</span>
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
    <div className="grid grid-cols-[80px_1fr] items-start gap-2 py-1.5">
      <div className="pt-2 text-xs text-mute">{label}</div>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-2xs leading-4 text-faint">{hint}</p>}
      </div>
    </div>
  );
}

export function Note({ severity = "info", children }) {
  const tone = severity === "error" ? "text-err" : severity === "warning" ? "text-warn" : "text-mute";
  return (
    <div className="flex gap-2 rounded border border-line bg-bg p-2" role="status">
      <Icon name={severity === "info" ? "info" : "alert"} size={15} className={cx("mt-0.5 flex-none", tone)} />
      <p className="text-sm leading-[18px] text-ink">{children}</p>
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
