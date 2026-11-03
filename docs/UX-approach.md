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

- **One clear way in.** One main action per screen. On the landing page it is **Try this shot** in the direct bar.
- **Show the product, don't describe it.** The hero is the real directed take, with the real path drawn over it.
- **The shortest path to a result.** The shot is already set up in the hero. One click on Try this shot gives the sample, automatic tracking and the editor with those choices applied. Then Render preview. That is three clicks to a preview.
- **The user always knows where they are.** Every flow screen shows the same four steps: Upload, Track, Direct, Render.
- **Supporting elements stay quiet.** Labels, steps and meta text are small and have no fill, so the footage and the main button carry the page.
- **Plain language, numbers over hype.** No exclamation marks. Say the number ("91% of frames tracked") and the next step.

---

## 3. Design system and design language

- **Design system: VestraPath tokens, used as-is.** That covers colours (dark theme: background `#0E0E0D`, surface `#1B1B18`, raised `#2E2E2B`, text `#F7F7F6`, muted `#C3C3BD`, accent green `#43AE7A` with black text on it), type (Outfit for UI and body, Plus Jakarta Sans Bold for display headings only), spacing (a 4 px grid), corner radii (10 px for buttons, 14 px for cards) and button styles.
- **Design language: CueFX's own, not VestraPath's.** CueFX is a creative AI tool, so its landing page borrows from AI tools (a setup bar instead of a prompt box) and from film tools (the monitor):
  - flat dark surfaces with **no gradients, glows or decorative textures**;
  - colour carries meaning, using the editor's own colours: **blue = tracking**, **yellow = the drawn path**, **green = the action**;
  - film-tool details: frame labels (`f127`), a target marker, phase names (Tracking, Held, Flight, Burst) and a timeline strip like the editor's.
- Fonts are self-hosted in `web/app/fonts/`, so builds never fetch from Google Fonts.

---

## 4. Landing page

We explored five hero directions on a design canvas. We first built A ("Monitor beside the pitch"), then **chose E, "Direct, don't prompt"**. E makes the difference from prompt-only tools obvious in one line, and it works like an AI tool people already know: a bar you set up, then one button. The page is about 2 screens long, where it used to be about 5. The example video is allowed to run past the first screen on purpose, as a reason to scroll.

### 4.1 Hero

Everything in the hero is centred, in one column.

- A small pill label: "Directed VFX · ComfyUI + LTX-2.5"
- Headline, on two lines: **"Direct the effect. / Don't just prompt it."** It uses Plus Jakarta Sans Bold, with no gradient.
- Supporting line: "CueFX tracks the body in your clip, lets you draw where the effect goes, and renders it on your footage. The shot below is set up and ready."
- **The direct bar** (the core of E). It shows the shot already set up, as four chips in the order the flow runs, followed by one green button:

| Chip | Label colour | Default | Options |
|---|---|---|---|
| Clip | grey | Sample · rooftop kick | Sample, or Your clip (choose a file when you start) |
| Track | blue (tracking) | Fist · left | Fist left/right, Palm right, Foot left/right, Head |
| Path | yellow (path) | Hold + throw | Hold + throw, Charge up, Orbit, Hold, each with a one-line description |
| Look | grey, with the look's image | Blue plasma | The five looks, with images |

  - Every chip is a real control. It opens a short list, and Escape or a click outside closes it. We avoided chips that look clickable but do nothing, which was the problem with the old Generate button.
  - The button reads **"Try this shot"** when the sample is selected and **"Choose a clip"** when "Your clip" is selected. We deliberately didn't use "Render": the visitor gets a preview in about a minute, not the LTX video.
  - Clicking it starts the flow with all four choices applied. The upload or tracking screen shows the choice as a tag (for example "Blue plasma · Hold + throw"). The editor opens with that behaviour, look and a prompt written for that combination. The prompt says both the look and the behaviour, so it no longer always says "thrown to the left".
  - On a phone the chips stack as a list and the button goes full width.
- Under the bar: "Up to 15 seconds · one person in frame · about a minute to a first preview".

The "How it works" row from A isn't needed: the bar shows the steps, in order.

### 4.2 The example result (just below the fold)

- A **Prompted / Directed** toggle, with the caption "Example result · same kick, same model. …"
- The showcase video at **full 16:9 width with no cropping**. It continues below the first screen.
- On the directed take, the effect's path is **drawn live in sync with playback**: a faint dotted full path, a solid line for the part already flown, frame labels, and a blue target on the effect. The path is not hand-drawn. We measured the effect's position in every frame of `4_output.mp4` (stored in `web/lib/heroPath.js`).
- Labels on the video: "Directed take · tracked foot, drawn path" (or "Prompted take · no path"), plus the current phase. A **Hide path** button shows the clean shot.
- Under it, a timeline strip: Tracking, Held, Flight, Burst, with a playhead. On the prompted take it reads "No cue: the model decides where and when".

### 4.3 Below that

1. **Presets.** Four compact cards: Fireball throw, Plasma charge-up, Orbiting spark, Ice in hand. Clicking one **fills the bar** with that path and look and scrolls back up, so there is only one place where a shot is set up.
2. **Recent clips**, only when there are some. This is a shared demo server, and the label says so.

We removed the separate comparison section, the pipeline/"Under the hood" section and the top "Shots" sidebar.

### 4.4 Performance

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
- **The sample clip tracks automatically**, using the body point chosen in the bar. The default, the left fist, tracked 192 of 192 frames on the live server.
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
| 1 | **The example video is a foot-tracked take, but the bar defaults to the fist** on the sample | It is labelled "Example result", so it is honest, but a foot-tracked sample would match exactly | Design + backend |
| 2 | **Portrait clips are boxed into 1920×1080** | Vertical in, vertical out is expected for a "Most Viral" entry | Backend (`clips/conform.py`) |
| 3 | **The LTX video pass is not in the API** | Today "Style this shot" returns a still frame. The full video needs an endpoint for `video_render.py`. | Backend |
| 4 | **The shot list is shared across all visitors** | Anyone can see anyone's uploads, and there is no delete. Fine for a demo, not for a public launch. | Backend |
| 5 | **The UI and the README disagree on the clip limit** (15 s vs 60 s) | Pick one and update both | Team |
| 6 | **Look prompts always say "thrown to the left"** | The new presets have prompts that match their behaviour. The editor's look prompts still don't. | Design |
| 7 | **Not yet tested against the live backend:** the editor and preview changes | The landing and upload screens were checked in a real build. The rest builds cleanly but still needs one full run on a real clip. | Team, after deploy |

---

## 8. What changed in the code

- `web/components/HomeScreen.js`: new landing page (hero with the direct bar, the example monitor, presets, recent clips)
- `web/components/FlowSteps.js`: the four-step progress used on every flow screen (new)
- `web/components/NewShot.js`: sample clip, auto-tracking, new copy and errors, layout that stacks on mobile
- `web/components/Editor.js`: presets applied, readable default size, Effect panel open, Render preview button, backend notes hidden
- `web/components/StandinPanel.js`: the preview screen, with "Style this shot" wired to `/generations`
- `web/components/ui.js`: buttons with VestraPath radius and hover, plain-language alerts
- `web/lib/presets.js`: presets, sample clip settings, the bar's options, and `presetFrom()`, which writes a prompt for any behaviour and look (new)
- `web/lib/heroPath.js`: the effect's measured path in the showcase video (new)
- `web/lib/api.js`: `startGeneration`, `getGeneration`, `pollGeneration`
- `web/app/layout.js`, `web/app/globals.css`, `web/app/fonts/`: Outfit and Plus Jakarta Sans self-hosted, type roles
- `web/public/showcase/`: compressed `*_web.mp4` and `hood-*.jpg` files

## 9. How to check it

1. `cd web && npm install && npm run build && npm run start`, with the API running (see `README.md`).
2. Open the landing page. Open each chip in the bar and change it. Scroll to the example and check that the path follows the effect, then toggle to Prompted.
3. Click a preset card. The bar should update and scroll back into view.
4. Click **Try this shot**. It should upload the sample, track the chosen body point automatically, and show the tracked percentage and your choices as a tag.
5. Click **Continue to directing**. The editor should open with your path and look applied. Then **Render preview**, then **Style this shot**. This last step needs the ComfyUI keys on the server.
6. Set Clip to Your clip and upload a clip with no person in it. You should get the plain error and the guidance.
7. Check the landing page at phone width (375 px): the chips should stack and the button should be full width.
