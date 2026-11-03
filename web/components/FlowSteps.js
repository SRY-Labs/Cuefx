"use client";

import { cx } from "./ui";

export const FLOW = [
  { id: "upload", label: "Upload" },
  { id: "track", label: "Track" },
  { id: "direct", label: "Direct" },
  { id: "render", label: "Render" },
];

/**
 * The four-step progress shown on every flow screen. Steps before the current one read as done;
 * a step with a handler in `onSelect` is clickable, the rest are plain labels.
 */
export default function FlowSteps({ current, onSelect = {}, disabled = {} }) {
  const at = FLOW.findIndex((step) => step.id === current);
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {FLOW.map((step, index) => {
        const state = index < at ? "done" : index === at ? "current" : "next";
        const handler = onSelect[step.id];
        const body = (
          <>
            <span className={cx(
              "grid h-5 w-5 flex-none place-items-center rounded-full text-2xs font-semibold tnum",
              state === "current" && "bg-accent text-on-accent",
              state === "done" && "bg-accent/15 text-accent",
              state === "next" && "border border-line2 text-faint",
            )}>{index + 1}</span>
            <span className={cx("hidden text-sm font-medium sm:inline", state === "next" ? "text-faint" : "text-ink")}>{step.label}</span>
          </>
        );
        return (
          <li key={step.id} className="flex items-center gap-1" aria-current={state === "current" ? "step" : undefined}>
            {index > 0 && <span className={cx("mx-1 h-px w-4 sm:w-6", index <= at ? "bg-accent/60" : "bg-line2")} aria-hidden="true" />}
            {handler ? (
              <button type="button" onClick={handler} disabled={disabled[step.id]}
                className="flex items-center gap-2 rounded-[10px] px-2 py-1 hover:bg-raised disabled:pointer-events-none disabled:opacity-45">
                {body}
              </button>
            ) : (
              <span className="flex items-center gap-2 px-2 py-1">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
