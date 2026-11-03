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
