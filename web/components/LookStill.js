"use client";

import { useId } from "react";
import { lookById } from "../lib/cue";

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
