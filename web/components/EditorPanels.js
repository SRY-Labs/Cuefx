"use client";

import { useEffect, useRef } from "react";
import { Icon, Note, cx } from "./ui";

export const LEFT_SECTORS = [
  { id: "tracking", label: "Tracking", icon: "target" },
  { id: "appearance", label: "Appearance", icon: "palette" },
];

export const RIGHT_SECTORS = [
  { id: "effect", label: "Effect controls", icon: "sliders" },
  { id: "timing", label: "Timing", icon: "clock" },
  { id: "path", label: "Path", icon: "route" },
];

const SIDE_OF = Object.fromEntries([
  ...LEFT_SECTORS.map((sector) => [sector.id, "left"]),
  ...RIGHT_SECTORS.map((sector) => [sector.id, "right"]),
]);

const PATH_SECTOR = [
  [/^(grade|look|shape|reference_image)/, "appearance"],
  [/^(route|path)/, "path"],
  [/^(appear_frame|release_frame|vanish|entrance|effect_range)/, "timing"],
  [/^(hand|body_point|track|corrections)/, "tracking"],
];

/** The sector a server note belongs to, from its cause; anything unclaimed sits with the effect controls. */
export function sectorOf(warning) {
  const { kind, path = "" } = warning.cause || {};
  if (kind === "track") return "tracking";
  if (kind === "timing") return "timing";
  if (kind === "tool-draw") return "path";
  if (kind === "field" || kind === "setting") {
    const hit = PATH_SECTOR.find(([pattern]) => pattern.test(path));
    if (hit) return hit[1];
  }
  return "effect";
}

const RANK = { error: 3, warning: 2, info: 1 };

/** The strongest severity per sector, for the dot on each rail icon. */
export function badgesOf(messages) {
  const out = {};
  for (const { sector, severity } of messages) {
    if (!out[sector] || RANK[severity] > RANK[out[sector]]) out[sector] = severity;
  }
  return out;
}

/** Opens a message's sector the first time an error or warning shows up there. */
export function useAutoOpen(messages, open) {
  const seen = useRef(new Set());
  useEffect(() => {
    for (const { key, sector, severity } of messages) {
      if (severity === "info" || seen.current.has(key)) continue;
      seen.current.add(key);
      open(SIDE_OF[sector], sector);
    }
  }, [messages, open]);
}

const DOT = { error: "bg-err", warning: "bg-warn", info: "bg-mute" };

export function SideRail({ side, sectors, active, onToggle, badges }) {
  const focusable = active || sectors[0].id;

  function onKeyDown(event) {
    const buttons = [...event.currentTarget.querySelectorAll("button")];
    const at = buttons.indexOf(document.activeElement);
    if (event.key === "Escape" && active) {
      event.stopPropagation();
      onToggle(null);
      document.getElementById(`rail-${active}`)?.focus();
      return;
    }
    if (at < 0 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    event.stopPropagation();
    buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length].focus();
  }

  return (
    <div role="toolbar" aria-label={side === "left" ? "Left panels" : "Right panels"} aria-orientation="horizontal" onKeyDown={onKeyDown}
      className="flex h-10 flex-none items-center gap-1 border-b border-line px-2">
      {sectors.map((sector, index) => {
        const on = active === sector.id;
        const badge = !on && badges[sector.id];
        const edge = side === "right" && index === sectors.length - 1;
        return (
          <button
            key={sector.id}
            id={`rail-${sector.id}`}
            type="button"
            tabIndex={sector.id === focusable ? 0 : -1}
            aria-label={sector.label}
            aria-expanded={on}
            aria-controls={`sector-${sector.id}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onToggle(on ? null : sector.id)}
            className={cx(
              "group relative flex h-8 w-8 flex-none items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              on ? "bg-accent/10 text-accent" : "text-mute hover:bg-raised hover:text-ink",
            )}
          >
            <Icon name={sector.icon} size={18} />
            {on && <span aria-hidden="true" className="absolute inset-x-1.5 -bottom-1 h-0.5 rounded-full bg-accent" />}
            {badge && <span aria-hidden="true" className={cx("absolute right-1 top-1 h-1.5 w-1.5 rounded-full", DOT[badge])} />}
            <span
              role="tooltip"
              className={cx(
                "pointer-events-none absolute top-full z-30 mt-2 whitespace-nowrap rounded border border-line bg-raised px-2 py-1 text-2xs text-ink opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100 group-hover:delay-300 group-focus-visible:opacity-100 group-focus-visible:delay-300 motion-reduce:transition-none",
                edge ? "right-0" : "left-1/2 -translate-x-1/2",
              )}
            >
              {sector.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The icon row on top and the open sector below it; closed, the column is only as wide as the row. */
export function SideColumn({ side, sectors, active, onToggle, badges, content }) {
  return (
    <div
      className={cx(
        "z-[11] flex flex-none flex-col bg-panel min-[901px]:relative max-[900px]:self-start",
        !active && "self-start",
        side === "left" ? "border-r border-line" : "border-l border-line",
      )}
    >
      <SideRail side={side} sectors={sectors} active={active} onToggle={onToggle} badges={badges} />
      <SidePanel side={side} sectors={sectors} active={active} onClose={() => onToggle(null)} content={content} />
    </div>
  );
}

/** Every sector stays mounted so values, open sections and scroll survive switching; only the active one shows. */
export function SidePanel({ side, sectors, active, onClose, content }) {
  function onKeyDown(event) {
    if (event.key !== "Escape" || !active) return;
    event.stopPropagation();
    const icon = document.getElementById(`rail-${active}`);
    onClose();
    icon?.focus();
  }

  return (
    <div
      onKeyDown={onKeyDown}
      className={cx(
        "min-h-0 w-[276px] flex-1 flex-col bg-panel max-[900px]:absolute max-[900px]:bottom-0 max-[900px]:top-10 max-[900px]:z-[11] max-[900px]:max-w-[calc(100vw-16px)] max-[900px]:border max-[900px]:border-line max-[900px]:shadow-lg",
        side === "left" ? "max-[900px]:left-0" : "max-[900px]:right-0",
        active ? "flex" : "hidden",
      )}
    >
      {sectors.map((sector) => (
        <section key={sector.id} id={`sector-${sector.id}`} role="region" aria-labelledby={`sector-${sector.id}-title`} hidden={active !== sector.id} className="flex min-h-0 flex-1 flex-col">
          <h2 id={`sector-${sector.id}-title`} className="flex h-8 flex-none items-center gap-1.5 border-b border-line px-3 text-2xs font-semibold uppercase tracking-wider text-mute">
            <Icon name={sector.icon} size={14} />
            {sector.label}
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-4 pt-1">{content[sector.id] || <p className="py-3 text-xs text-faint">Nothing to adjust for this selection.</p>}</div>
        </section>
      ))}
    </div>
  );
}

/** A quiet divider and label between groups inside a sector. */
export function Group({ label, children }) {
  return (
    <div className="mt-2 border-t border-line pt-2 first:mt-0 first:border-t-0 first:pt-0">
      {label && <div className="pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>}
      {children}
    </div>
  );
}

/** Server notes routed to one sector, in the style the inspector list used. */
export function SectorNotes({ id, warnings, children }) {
  const notes = warnings.filter((warning) => sectorOf(warning) === id);
  if (!notes.length && !children) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
      {children}
      {notes.map((warning) => (
        <li key={warning.id}><Note severity={warning.severity}>{warning.message}</Note></li>
      ))}
    </ul>
  );
}

export function useEscapeDrawer(open, closeAll) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      if (document.querySelector("[role=dialog]")) return;
      closeAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAll]);
}
