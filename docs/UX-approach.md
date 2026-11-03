# CueFX: UX approach for the landing page and first-run flow

For the SRY Labs team. This explains what we changed in the CueFX web app, why, and what is still open. Everything described here is on the `ux/landing-and-flow` branch. Only the web app (`web/`) changed. Nothing in the server changed.

---

## 1. The problem we are solving

CueFX's idea is strong: a prompt can't say *where* an effect goes, but a drawn path can. CueFX tracks a body point with MediaPipe, lets the user draw the path, and renders the effect with LTX-2.5 in ComfyUI.

The live app did not let a first-time visitor (or a judge) reach that idea. We tested it end to end with a karate clip and a clip with no person in it. These are the problems we found, worst first:

1. **The main promise could not be reached.** The "Generate" button on the stand-in screen did nothing. It had no click handler, and the app never called `/api/v1/generations`.
2. **The landing page did not explain the product or give a clear way in.** There was no plain headline, the main button was in a sidebar, and about 70 MB of showcase media loaded first. That took about 12 seconds.
3. **You could not try it without your own footage.** There was no sample clip.
4. **The editor hid its own controls.** The look, shape and size settings sat behind icon tabs. The default effect size was 32 px on a 1080p frame, too small to see. Backend notes such as "Spill on occluders…" were shown to users.
5. **Errors spoke in codes.** A clip with no person showed "No hand found in frame 0 · no_hand · 400" after about a minute.
6. **Portrait clips were boxed into 1920×1080 with black bars.** This is still open (section 7).

---

## 2. Principles we designed to

- **One clear way in.** One main action per screen. On the landing page it is **Try the sample clip**.
- **Show the product, don't describe it.** The hero is the real directed take, with the real path drawn over it.
- **The shortest path to a result.** Sample clip, then automatic tracking, then the editor with sensible defaults, then render. That is three clicks to a preview.
- **The user always knows where they are.** Every flow screen shows the same four steps: Upload, Track, Direct, Render.
- **Supporting elements stay quiet.** Labels, steps and meta text are small and have no fill, so the footage and the main button carry the page.
- **Plain language, numbers over hype.** No exclamation marks. Say the number ("91% of frames tracked") and the next step.

---

## 3. Design system and design language

- **Design system: VestraPath tokens, used as-is.** That covers colours (dark theme: background `#0E0E0D`, surface `#1B1B18`, raised `#2E2E2B`, text `#F7F7F6`, muted `#C3C3BD`, accent green `#43AE7A` with black text on it), type (Outfit for UI and body, Plus Jakarta Sans Bold for display headings only), spacing (a 4 px grid), corner radii (10 px for buttons, 14 px for cards) and button styles.
- **Design language: CueFX's own, not VestraPath's.** CueFX is a creative AI tool, so its landing page looks like a director's monitor rather than a learning dashboard:
  - flat dark surfaces with **no gradients, glows or decorative textures**;
  - colour carries meaning, using the editor's own colours: **blue = tracking**, **yellow = the drawn path**, **green = the action**;
  - film-tool details: frame labels (`f127`), a target marker, phase names (Tracking, Held, Flight, Burst) and a timeline strip like the editor's.
- Fonts are self-hosted in `web/app/fonts/`, so builds never fetch from Google Fonts.

---

## 4. Landing page

We explored five hero directions on a design canvas and **chose A, "Monitor beside the pitch."** The page is now about 1.3 screens long. Before, it was about 5.

### 4.1 Hero (one screen at 1440×900)

**Left column**
- A small pill label: "Directed VFX · ComfyUI + LTX-2.5"
- Headline: **"Make the effect follow the move."** ("move" in path yellow; no gradient)
- Supporting line: "Prompted effects drift off the hand. CueFX tracks the body in your clip, lets you draw where the effect goes, and renders it on your footage."
- Buttons: **Try the sample clip** (primary, green) and **Upload your clip** (secondary)
- **How it works**, a light supporting row with no card fill. It has three small icons joined by a line, with no step numbers:
  - Upload a clip: up to 15 s, one person
  - Check the tracking: MediaPipe follows the body (blue icon)
  - Direct and render: draw the path, pick a look (yellow icon)
  - On a phone the line runs down instead of across.

**Right column: the monitor**
- A **Prompted / Directed** toggle with a one-line caption. This replaces a separate comparison section.
- The directed showcase video, with the effect's path **drawn live in sync with playback**: a faint dotted full path, a solid line for the part already flown, frame labels, and a blue target on the effect. The path is not hand-drawn. We measured the effect's position in every frame of `4_output.mp4` (stored in `web/lib/heroPath.js`).
- Labels on the video: "Directed take · foot, left" and the current phase.
- A **Hide path** button shows the clean shot.
- Under the video, a timeline strip: Tracking, Held, Flight, Burst, with a playhead. On the prompted take it reads "No cue: the model decides the timing".

### 4.2 Below the hero

1. **Start from a preset.** Four compact cards: Fireball throw, Plasma charge-up, Orbiting spark, Ice in hand. Each shows the look, a small motion icon for the behaviour, and a one-line description. Clicking one starts the flow with that behaviour, look and a matching prompt already set.
2. **Recent clips**, only when there are some. This is a shared demo server, and the label says so.

We removed the separate comparison section, the pipeline/"Under the hood" section and the top "Shots" sidebar. The hero toggle and the steps row now carry that content.

### 4.3 Performance

The showcase media went from about 70 MB to about 1.7 MB: re-encoded MP4s (`*_web.mp4`) and JPG stills in place of 8 MB PNGs. The originals are still in `web/public/showcase/`.

---

## 5. First-run flow

Every flow screen shows the four steps (Upload, Track, Direct, Render) in its header, with a **Home** button.

### 5.1 Upload
- A large drop area: "Drop a clip, or choose a file · One person in frame works best · mp4, mov, mkv or webm · up to 15 seconds".
- Under it: "No footage to hand? **Use the sample clip**".
- While the clip is prepared: "CueFX is preparing a 24 fps copy to track. This usually takes 10 to 20 seconds. Tracking starts next."

### 5.2 Track
- The body point now defaults to **fist** instead of palm. Pose points track without a click and held up better in our tests.
- **The sample clip tracks automatically.** It uses the left fist, which tracked 192 of 192 frames on the live server.
- Copy: "CueFX finds the fist on its own. If there is more than one person, click the one you mean in the picture."
- The result reads as a number and a next step: "**91% of frames tracked**. 165 of 182 frames. Scrub the clip to check the dot stays on the fist." Then **Continue to directing**, or **Track a different point**.
- When tracking fails, the title is "CueFX could not find a fist in this clip". The help text is "Check that one person is in frame and the fist is visible for most of the clip. Try another body point, or click the person in the picture." Error codes no longer show on screen. They stay in the element's tooltip and in screen-reader text, for support.

### 5.3 Direct (editor)
- It opens with the **Effect** panel already open.
- The effect starts at a visible size: about 12% of the frame's short side, roughly 130 px on 1080p.
- A preset, if one was picked, is applied: its behaviour, look and prompt.
- There is one main action in the header: **Render preview**.
- Backend notes that don't affect the user (`setting_not_used`) are hidden.

### 5.4 Render (preview)
- Title: "Preview on your footage". While it renders: "Rendering your preview · 12 s", with "A new shot usually takes 20 to 60 seconds."
- When it's done: the composite plays, there's a **Download** button, and the note "This is the guide pass: the effect drawn in code where you directed it."
- Right panel: **"Style it with ComfyUI."** The prompt is pre-filled from the chosen look. **Style this shot** now calls `POST /api/v1/generations`, polls the result, and shows the styled frame with a download link.
  - This endpoint returns a **styled still frame**, not the LTX video. The LTX video pass (`generate/video_render.py`) is not exposed through the API yet, and the copy says so honestly.
  - It needs the ComfyUI keys set on the server. If they are missing, the user sees a plain error.

---

## 6. Copy rules used throughout

- Sentence case everywhere. No exclamation marks.
- Say the number ("91% of frames tracked", "about a minute to a first preview").
- Every message ends with what to do next.
- No backend terms on screen: no error codes, "plate", "cue contract" or "stand-in". We say **preview** instead of "stand-in".

---

## 7. Open items, for the team to decide

| # | Item | Why it matters | Owner |
|---|---|---|---|
| 1 | **The hero shows a foot-tracked take, but the sample clip tracks the fist** on a different take | A sharp viewer may notice the difference. Either change the hero label or make a foot-tracked sample. | Design + backend |
| 2 | **Portrait clips are boxed into 1920×1080** | Vertical in, vertical out is expected for a "Most Viral" entry | Backend (`clips/conform.py`) |
| 3 | **The LTX video pass is not in the API** | Today "Style this shot" returns a still frame. The full video needs an endpoint for `video_render.py`. | Backend |
| 4 | **The shot list is shared across all visitors** | Anyone can see anyone's uploads, and there is no delete. Fine for a demo, not for a public launch. | Backend |
| 5 | **The UI and the README disagree on the clip limit** (15 s vs 60 s) | Pick one and update both | Team |
| 6 | **Look prompts always say "thrown to the left"** | The new presets have prompts that match their behaviour. The editor's look prompts still don't. | Design |
| 7 | **Not yet tested against the live backend:** the editor and preview changes | The landing and upload screens were checked in a real build. The rest builds cleanly but still needs one full run on a real clip. | Team, after deploy |

---

## 8. What changed in the code

- `web/components/HomeScreen.js`: new landing page (hero, monitor, steps row, presets, recent clips)
- `web/components/FlowSteps.js`: the four-step progress used on every flow screen (new)
- `web/components/NewShot.js`: sample clip, auto-tracking, new copy and errors, layout that stacks on mobile
- `web/components/Editor.js`: presets applied, readable default size, Effect panel open, Render preview button, backend notes hidden
- `web/components/StandinPanel.js`: the preview screen, with "Style this shot" wired to `/generations`
- `web/components/ui.js`: buttons with VestraPath radius and hover, plain-language alerts
- `web/lib/presets.js`: preset definitions and sample clip settings (new)
- `web/lib/heroPath.js`: the effect's measured path in the showcase video (new)
- `web/lib/api.js`: `startGeneration`, `getGeneration`, `pollGeneration`
- `web/app/layout.js`, `web/app/globals.css`, `web/app/fonts/`: Outfit and Plus Jakarta Sans self-hosted, type roles
- `web/public/showcase/`: compressed `*_web.mp4` and `hood-*.jpg` files

## 9. How to check it

1. `cd web && npm install && npm run build && npm run start`, with the API running (see `README.md`).
2. Open the landing page. Check that it fits one screen at 1440×900 and that the path follows the effect. Toggle to Prompted.
3. Click **Try the sample clip**. It should upload, track the left fist automatically and show the tracked percentage.
4. Click **Continue to directing**, then **Render preview**, then **Style this shot**. This last step needs the ComfyUI keys on the server.
5. Repeat with a clip that has no person in it. You should get the plain error and the guidance.
6. Check the landing page at phone width (375 px).
