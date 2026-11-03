/** Landing presets: a behaviour, a look, and a prompt written for that behaviour. */

export const PRESETS = [
  {
    id: "fireball_throw",
    name: "Fireball throw",
    note: "Gathers in the fist, then flies along the path you draw.",
    behaviour: "hold_throw",
    look: "fireball",
    prompt: "A fireball with swirling orange flames and ember sparks, its light falling on the hand and the wall. Embers gather in the fist and ignite, then it is thrown along the drawn path and leaves the frame, camera stays fixed.",
  },
  {
    id: "plasma_charge",
    name: "Plasma charge-up",
    note: "Builds on the body point, then releases.",
    behaviour: "charge_up",
    look: "blue_plasma",
    prompt: "A ball of blue plasma with cyan arcs looping over a white core, its light falling on the hand and the wall. The arcs tighten and grow brighter on the hand, then it is released along the drawn path, camera stays fixed.",
  },
  {
    id: "electric_orbit",
    name: "Orbiting spark",
    note: "Circles the body point for the whole shot.",
    behaviour: "orbit",
    look: "electric_orb",
    prompt: "A violet-white orb with crackling electric forks snapping across its surface, circling close around the hand, its flicker falling on the hand and the wall, camera stays fixed.",
  },
  {
    id: "ice_hold",
    name: "Ice in hand",
    note: "Stays locked to the body point.",
    behaviour: "hold",
    look: "ice_sphere",
    prompt: "A sphere of clear ice with frost crystals and a slow drifting mist, held in the hand, its cold light falling on the hand and the wall, camera stays fixed.",
  },
];

export const presetById = (id) => PRESETS.find((preset) => preset.id === id) || null;

/** The clip on the landing page, served from web/public. */
export const SAMPLE_CLIP = { url: "/showcase/1_input_web.mp4", name: "cuefx-sample-kick.mp4", part: "fist", side: "left" };

/** Behaviours and body points the hero's direct bar offers, in the editor's own words. */
export const BAR_BEHAVIOURS = [
  { id: "hold_throw", name: "Hold + throw", note: "Gathers, then flies along your path" },
  { id: "charge_up", name: "Charge up", note: "Builds on the body, then releases" },
  { id: "orbit", name: "Orbit", note: "Circles the body point" },
  { id: "hold", name: "Hold", note: "Stays locked to the body point" },
];

export const BAR_PARTS = [
  { part: "fist", side: "left", name: "Fist · left" },
  { part: "fist", side: "right", name: "Fist · right" },
  { part: "palm", side: "right", name: "Palm · right" },
  { part: "foot", side: "left", name: "Foot · left" },
  { part: "foot", side: "right", name: "Foot · right" },
  { part: "head", side: "right", name: "Head" },
];

const LOOK_LINE = {
  fireball: "A fireball with swirling orange flames and ember sparks, its light falling on the body and the wall.",
  blue_plasma: "A ball of blue plasma with cyan arcs looping over a white core, its light falling on the body and the wall.",
  electric_orb: "A violet-white orb with crackling electric forks snapping across its surface, its flicker falling on the body and the wall.",
  ice_sphere: "A sphere of clear ice with frost crystals and a slow drifting mist, its cold light falling on the body and the wall.",
  shadow_energy: "A dark ball of shadow energy with a violet rim and curling smoke, its glow barely touching the body and the wall.",
};

const BEHAVIOUR_LINE = {
  hold_throw: "It gathers on the body, then is thrown along the drawn path and leaves the frame, camera stays fixed.",
  charge_up: "It grows brighter on the body, then is released along the drawn path, camera stays fixed.",
  orbit: "It circles close around the body point for the whole shot, camera stays fixed.",
  hold: "It stays held on the body point for the whole shot, camera stays fixed.",
};

/** A preset built from the bar's choices: the behaviour, the look, and a prompt that says both. */
export function presetFrom({ behaviour, look, lookName }) {
  const name = BAR_BEHAVIOURS.find((item) => item.id === behaviour)?.name || "Hold + throw";
  return { id: `bar_${behaviour}_${look}`, name: `${lookName} · ${name}`, behaviour, look, prompt: `${LOOK_LINE[look] || LOOK_LINE.blue_plasma} ${BEHAVIOUR_LINE[behaviour] || BEHAVIOUR_LINE.hold_throw}` };
}
