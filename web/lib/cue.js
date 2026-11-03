/** Reads a cue document using the field names the server stores. */

export function pointAt(track, frame) {
  if (!track?.length) return null;
  return track.find((point) => point.frame === frame) || null;
}

export function orbAt(frames, frame) {
  if (!frames?.length) return null;
  return frames.find((point) => point.frame === frame) || null;
}

export function seconds(frame, fps) {
  return frame / fps;
}

export function timecode(frame, fps) {
  // Round to hundredths before splitting, so 59.999 s reads 1:00.00 and not 0:60.00
  const hundredths = Math.round((frame / fps) * 100);
  const minutes = Math.floor(hundredths / 6000);
  const secs = (hundredths - minutes * 6000) / 100;
  return `${minutes}:${secs.toFixed(2).padStart(5, "0")}`;
}

export function clipLine(clip) {
  const [width, height] = clip.plate_size;
  const length = clip.frames / clip.fps;
  return `${width}×${height} · ${clip.fps} fps · ${clip.frames} frames · ${length.toFixed(2)} s`;
}

export const BEHAVIOURS = [
  ["hold_throw", "Hold + throw"],
  ["hold", "Hold"],
  ["charge_up", "Charge up"],
  ["orbit", "Orbit"],
];

export function holdsOnBody(behaviour) {
  return behaviour === "hold" || behaviour === "orbit";
}

export const BEHAVIOUR_NOTE = {
  hold_throw: "Held, then released and thrown along the path you draw.",
  hold: "Stays on the body point until it vanishes. No path.",
  charge_up: "Grows and pulses while held, then throws.",
  orbit: "Circles the body point until it vanishes. No path.",
};

export const PARTS = [["palm", "Palm"], ["fist", "Fist"], ["foot", "Foot"], ["knee", "Knee"], ["shoulder", "Shoulder"], ["head", "Head"]];

export const EASINGS = [["linear", "Linear"], ["ease_in", "In"], ["ease_out", "Out"], ["ease_in_out", "In-out"]];

export const SHAPES = [["sphere", "Sphere"], ["ring", "Ring"], ["crystal", "Crystal"], ["cube", "Cube"]];

export const ENDINGS = [["fade", "Fade"], ["burst", "Burst"], ["shatter", "Shatter"]];

export const ENDING_NOTE = {
  fade: "Fades out over the vanish.",
  burst: "Grows and flashes, then fades. It lasts the vanish.",
  shatter: "Breaks into shards that fly outward. It lasts the vanish.",
};

export const LOOKS = [
  { id: "fireball", name: "Fireball", tint: "#ffb35c", note: "Orange and amber flames, ember sparks", prompt: "A fireball with swirling orange flames and ember sparks, its light falling on the hand and the wall. Embers gather in the palm and ignite, then it is thrown to the left and leaves the frame, camera stays fixed." },
  { id: "blue_plasma", name: "Blue plasma", tint: "#9fd4ff", note: "Cyan and white, smooth arcs", prompt: "A ball of blue plasma with cyan arcs looping over a white core, its light falling on the hand and the wall. The arcs tighten in the palm, then it is thrown to the left and leaves the frame, camera stays fixed." },
  { id: "electric_orb", name: "Electric orb", tint: "#d6c8ff", note: "Violet-white, crackling", prompt: "A violet-white orb with crackling electric forks snapping across its surface, its flicker falling on the hand and the wall. The forks build in the palm, then it is thrown to the left and leaves the frame, camera stays fixed." },
  { id: "ice_sphere", name: "Ice sphere", tint: "#dff4ff", note: "Pale frost, slow drifting mist", prompt: "A sphere of clear ice with frost crystals and a slow drifting mist, its cold light falling on the hand and the wall. Frost spreads over the palm, then it is thrown to the left and leaves the frame, camera stays fixed." },
  { id: "shadow_energy", name: "Shadow energy", tint: "#9a73e6", note: "Dark core, violet rim, smoke", prompt: "A dark ball of shadow energy with a violet rim and curling smoke, its glow barely touching the hand and the wall. Smoke pools in the palm, then it is thrown to the left and leaves the frame, camera stays fixed." },
];

export const REFERENCE_LOOK = { id: "reference", name: "Your reference", tint: "#ffffff", note: "Matches the still you uploaded", prompt: "" };

export const PROMPT_PLACEHOLDER = "[the effect, its material and colours], while [what moves inside it]. [What happens over time], camera stays fixed.";

export function lookById(id) {
  if (id === "reference") return REFERENCE_LOOK;
  return LOOKS.find((look) => look.id === id) || { id: id || "energy_orb", name: id && id !== "energy_orb" ? id : "Energy orb", tint: "#9fd4ff", note: "The stand-in orb", prompt: LOOKS[1].prompt };
}

const SPIN_FALLBACK = { sphere: 288, ring: 90, crystal: 60, cube: 60 };
const ENDING_DEFAULT = { burst: 0.6, shatter: 1.0 };

export function withShape(cue, shape) {
  const next = { ...cue };
  if (shape === "sphere") delete next.shape;
  else next.shape = shape;
  delete next.spin_deg_per_s;
  return next;
}

export function withLook(cue, id, prompt) {
  const look = lookById(id);
  const next = { ...cue, look: id };
  if (id !== "reference") next.grade = { ...cue.grade, tint: look.tint };
  if (prompt !== undefined) next.prompt = prompt;
  return next;
}

export function withEnding(cue, ending, defaults) {
  const next = { ...cue };
  if (ending === "fade") delete next.ending;
  else next.ending = ending;
  if (ending === "fade" || !cue.vanish) return next;
  const seconds = defaults?.ending_default_seconds?.[ending] ?? ENDING_DEFAULT[ending] ?? 0.6;
  const frames = Math.max(1, Math.round(seconds * (cue.fps || 24)));
  const end = Math.min(cue.frames ?? cue.vanish.end, cue.vanish.start + frames);
  if (end <= cue.vanish.end) return next;
  return { ...next, vanish: { ...cue.vanish, end } };
}

/** Sphere, the default spin, and fade are stored by leaving the field out. A JSON null is rejected. */
export function cueForWire(cue) {
  const next = { ...cue };
  for (const key of ["shape", "spin_deg_per_s", "ending"]) {
    if (next[key] == null) delete next[key];
  }
  return next;
}

export function spinOf(cue, defaults) {
  if (typeof cue.spin_deg_per_s === "number") return cue.spin_deg_per_s;
  const shape = cue.shape || "sphere";
  return defaults?.spin_deg_per_s?.[shape] ?? SPIN_FALLBACK[shape] ?? 288;
}

const ORBIT_FALLBACK = { radius_sizes: 1.5, speed_deg_per_s: 180, tilt_deg: 60 };

export function partOf(cue) {
  return cue.body_point?.part || "palm";
}

export function sideOf(cue) {
  if (partOf(cue) === "head") return null;
  return cue.body_point?.side || cue.hand;
}

export function partName(cue) {
  const part = partOf(cue);
  if (part === "palm") return "palm";
  const side = sideOf(cue);
  return side ? `${side} ${part}` : part;
}

export function phaseTimes(cue) {
  const appear = cue.appear_frame ?? 0;
  const vanish = cue.vanish || { start: appear + 1, end: appear + 2 };
  const entrance = Math.max(0, Math.round((cue.entrance?.seconds || 0) * cue.fps));
  const hold = holdsOnBody(cue.behaviour);
  return {
    es: Math.max(0, appear - entrance),
    appear,
    release: hold ? vanish.start : cue.release_frame,
    vs: vanish.start,
    ve: vanish.end,
  };
}

export function anchorAt(cue, point) {
  if (!point) return null;
  const [dx, dy] = cue.anchor_offset || [0, 0];
  return { x: point.x + dx, y: point.y + dy };
}

export function drawnRoute(cue, anchor) {
  return (cue.route || []).map((point, index) => ({
    ...point,
    x: index === 0 ? anchor?.x ?? point.x : point.x,
    y: index === 0 ? anchor?.y ?? point.y : point.y,
  }));
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

function shiftRoute(route, release) {
  let prev = release;
  return (route || []).map((point, index) => {
    if (index === 0) return { ...point, f: release };
    const next = Math.max(point.f, prev + 1);
    prev = next;
    return { ...point, f: next };
  });
}

// The typed frame is kept. Later marks move later, and earlier marks move earlier, so a 3-digit
// frame is not snapped back to the previous neighbour. The clip length is the only hard stop.
function placeTiming(appear, release, start, end, frames, hold, key) {
  if (hold) {
    if (key === "appear") {
      appear = clamp(appear, 0, frames - 2);
      start = Math.max(start, appear + 1);
      end = Math.max(end, start + 1);
      if (end > frames) {
        end = frames;
        start = end - 1;
        appear = start - 1;
      }
    } else if (key === "vanishStart") {
      start = clamp(start, 1, frames - 1);
      end = Math.max(end, start + 1);
      if (end > frames) {
        end = frames;
        start = end - 1;
      }
      appear = Math.min(Math.max(0, appear), start - 1);
    } else if (key === "vanishEnd") {
      end = clamp(end, 2, frames);
      start = Math.min(start, end - 1);
      appear = Math.min(Math.max(0, appear), start - 1);
      start = Math.max(start, appear + 1);
      end = Math.max(end, start + 1);
    }
    return { appear, release: null, start, end };
  }
  if (key === "appear") {
    appear = clamp(appear, 0, frames - 3);
    release = Math.max(release, appear + 1);
    start = Math.max(start, release + 1);
    end = Math.max(end, start + 1);
    if (end > frames) {
      end = frames;
      start = end - 1;
      release = start - 1;
      appear = release - 1;
    }
  } else if (key === "release") {
    release = clamp(release, 1, frames - 2);
    appear = Math.min(Math.max(0, appear), release - 1);
    start = Math.max(start, release + 1);
    end = Math.max(end, start + 1);
    if (end > frames) {
      end = frames;
      start = end - 1;
      release = Math.min(release, start - 1);
      appear = Math.min(appear, release - 1);
    }
  } else if (key === "vanishStart") {
    start = clamp(start, 2, frames - 1);
    end = Math.max(end, start + 1);
    if (end > frames) {
      end = frames;
      start = end - 1;
    }
    release = Math.min(release, start - 1);
    appear = Math.min(Math.max(0, appear), release - 1);
    release = Math.max(release, appear + 1);
  } else if (key === "vanishEnd") {
    end = clamp(end, 3, frames);
    start = Math.min(start, end - 1);
    release = Math.min(release, start - 1);
    appear = Math.min(Math.max(0, appear), release - 1);
    release = Math.max(release, appear + 1);
    start = Math.max(start, release + 1);
    end = Math.max(end, start + 1);
    if (end > frames) {
      end = frames;
      start = end - 1;
      release = start - 1;
      appear = release - 1;
    }
  }
  return { appear, release, start, end };
}

export function setTiming(cue, key, frame) {
  if (key === "entranceStart") {
    const es = clamp(frame, 0, cue.appear_frame);
    return { ...cue, entrance: { seconds: Math.round(((cue.appear_frame - es) / cue.fps) * 100) / 100 } };
  }
  if (!["appear", "release", "vanishStart", "vanishEnd"].includes(key)) return cue;
  const hold = holdsOnBody(cue.behaviour);
  if (key === "release" && hold) return cue;
  const value = Math.round(frame);
  const frames = Number.isFinite(cue.frames) ? cue.frames : value;
  let appear = cue.appear_frame ?? 0;
  let release = cue.release_frame ?? appear + 1;
  let start = cue.vanish?.start ?? (hold ? appear + 1 : release + 1);
  let end = cue.vanish?.end ?? start + 1;
  if (key === "appear") appear = value;
  else if (key === "release") release = value;
  else if (key === "vanishStart") start = value;
  else end = value;
  const placed = placeTiming(appear, release, start, end, frames, hold, key);
  const next = {
    ...cue,
    appear_frame: placed.appear,
    vanish: { ...cue.vanish, start: placed.start, end: placed.end },
  };
  if (hold) return next;
  next.release_frame = placed.release;
  if (placed.release !== cue.release_frame && cue.route) {
    const route = shiftRoute(cue.route, placed.release);
    const last = route.length ? route[route.length - 1].f : placed.start;
    if (last >= next.vanish.end) {
      const vanishEnd = Math.min(frames, Math.max(next.vanish.end, last + 1));
      next.vanish = { ...next.vanish, end: Math.max(vanishEnd, next.vanish.start + 1) };
    }
    next.route = route;
  }
  return next;
}

export function toThrow(cue, behaviour) {
  const appear = cue.appear_frame ?? 0;
  let vanish = { ...(cue.vanish || { start: appear + 24, end: appear + 30 }) };
  let rel = vanish.start - 1;
  if (rel <= appear) {
    rel = appear + 12;
    vanish = { start: Math.max(vanish.start, rel + 18), end: Math.max(vanish.end, rel + 24) };
  } else if (vanish.start - appear > 24) {
    rel = vanish.start - Math.min(24, vanish.start - appear - 12);
  }
  rel = Math.max(appear + 1, rel);
  return {
    ...cue,
    behaviour,
    release_frame: rel,
    vanish,
    route: [{ f: rel, x: null, y: null, diameter_px: cue.diameter_px, easing_in: "linear" }],
  };
}

export function addPathPoint(cue, x, y) {
  if (holdsOnBody(cue.behaviour)) {
    return { cue, refused: "This behaviour stays on the body point. Switch to Hold + throw to draw a path." };
  }
  const route = cue.route || [];
  if (!route.length) return { cue, refused: "The path has no release point yet." };
  const last = route[route.length - 1].f;
  const frames = cue.frames || last + 2;
  const windowStart = cue.effect_range?.start ?? Math.max(0, (cue.appear_frame || 0) - 24);
  const limit = Math.min(frames - 1, windowStart + 192);
  if (last >= limit) {
    return { cue, refused: "No time left before the 8-second limit. Move the release earlier, then add a point." };
  }
  const vanish = { ...(cue.vanish || { start: last + 1, end: last + 8 }) };
  const f = Math.min(limit, Math.max(last + 1, vanish.start));
  if (f <= last) {
    return { cue, refused: "No time left before the vanish. Move the vanish later, then add a point." };
  }
  let nextVanish = vanish;
  if (f > vanish.start) {
    const shift = f - vanish.start;
    const end = Math.min(frames, Math.max(f + 1, vanish.end + shift));
    nextVanish = { start: f, end };
  }
  const point = { f, x: Math.round(x), y: Math.round(y), diameter_px: cue.diameter_px, easing_in: "linear" };
  return { cue: { ...cue, vanish: nextVanish, route: [...route, point] }, index: route.length, refused: null };
}

export function movePathPoint(cue, index, x, y) {
  if (index < 1 || !cue.route?.[index]) return cue;
  return { ...cue, route: cue.route.map((point, i) => (i === index ? { ...point, x: Math.round(x), y: Math.round(y) } : point)) };
}

export function deletePathPoint(cue, index) {
  if (index < 1 || !cue.route?.[index]) return cue;
  return { ...cue, route: cue.route.filter((_, i) => i !== index) };
}

export function setPointEasing(cue, index, easing) {
  if (!cue.route?.[index]) return cue;
  return { ...cue, route: cue.route.map((point, i) => (i === index ? { ...point, easing_in: easing } : point)) };
}

export function setPointFrame(cue, index, frame) {
  const route = cue.route || [];
  if (index < 1 || !route[index]) return cue;
  const prev = route[index - 1].f;
  const next = route[index + 1] ? route[index + 1].f : cue.vanish.end;
  const f = clamp(frame, prev + 1, next - 1);
  return { ...cue, route: route.map((point, i) => (i === index ? { ...point, f } : point)) };
}

export function withDiameter(cue, diameter) {
  return {
    ...cue,
    diameter_px: diameter,
    route: (cue.route || []).map((point) => ({ ...point, diameter_px: diameter })),
  };
}

export function orbitValue(cue, key, defaults) {
  const value = cue.orbit?.[key];
  if (typeof value === "number") return value;
  const base = defaults?.orbit || ORBIT_FALLBACK;
  if (key === "tilt_deg") {
    const part = partOf(cue);
    const tilt = defaults?.orbit_tilt_deg_by_part?.[part];
    if (typeof tilt === "number") return tilt;
  }
  return base[key];
}

export function trackRuns(track) {
  if (!track?.length) return [];
  const out = [];
  let start = 0;
  for (let i = 1; i <= track.length; i += 1) {
    if (i === track.length || !!track[i].uncertain !== !!track[start].uncertain) {
      out.push({ start: track[start].frame, end: track[i - 1].frame + 1, uncertain: !!track[start].uncertain });
      start = i;
    }
  }
  return out;
}
