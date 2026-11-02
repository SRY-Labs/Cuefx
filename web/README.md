# CueFX editor

The editor for the CueFX v2 API. It is a Next.js app: one page, three screens, and the JSON the server returns. Nothing in the browser renames or reshapes those fields.

Start the API first. See the [server README](../README.md) for conform, the cue, the stand-in, and the environment variables. This file is the editor.

## Run it

From `cuefx_v2_backend`:

```
python app.py
```

Then, from this directory:

```
npm install
npm run dev
```

Open http://localhost:3000. The page title is CueFX. The header shows the server version and the contract version once `GET /api/v1/health` answers. If that call fails, the header says the server is not reachable and the shot list stays empty.

`npm run build` then `npm run start` serves the production build on port 3000 as well.

The browser never calls port 8000 itself. Every request goes to `/api/v1` on the Next origin, and `next.config.mjs` forwards `/api/v1/:path*` to `CUEFX_API_ORIGIN`, which defaults to `http://127.0.0.1:8000`. The rewrite waits up to five minutes, which covers a first tracking pass and a stand-in render. If the API is on another port, set the origin before `npm run dev` and use that same port for the API:

```
set CUEFX_API_ORIGIN=http://127.0.0.1:8001
npm run dev
```

## What is kept

Clips live on the server. A cue lives in the page. Opening a clip from the shot list returns to the pick screen, because the server does not store the cue you edited. Leaving the editor, or a refresh, drops that cue. The theme is the exception: light or dark is saved in `localStorage` under `cuefx-theme`.

## Screens

The app does not use routes. `app/page.js` switches `home`, `new`, and `editor`.

### Shots

`HomeScreen` lists `GET /api/v1/clips`. Each row is the filename, plate size, frame rate, frame count, and duration. **New shot** opens an empty upload. Choosing a clip opens the pick screen for that clip.

### New shot

`NewShot` uploads a file, or reuses one already on the server, then builds the first cue.

1. Drop a clip or choose a file. The field is `file`. Accepted types are mp4, mov, mkv, and webm. A bar shows the upload. Conform runs on the server after the file arrives, so the request can sit there after the bar reaches 100%.
2. Scrub the conformed plate. Arrow keys step one frame. Shift and an arrow step ten. The picture starts at frame 60, or the last frame if the clip is shorter.
3. Choose what the effect follows: palm, fist, foot, knee, shoulder, or head, and a side when the part has one. Head has no side.
4. **Track the {part}** asks MediaPipe to find that point from the part and the side. No click is required. Clicking the picture is optional: it sends `hand_seed` with the frame and the plate point, which picks a particular person.
5. The first pass reads the whole clip. The same clip, part, and side after that comes back from the analysis cache. The result shows how many frames were tracked, any uncertain runs, and the server warnings.
6. **Open editor** takes that cue into the editor. **Replace clip** goes back to the upload step.

### Editor

`Editor` is the plate, the transport, the inspector, and the timeline. The cue in memory is the server cue. Each committed change runs normalize, then validate, then preview, and the page replaces its cue with the normalized one. A newer change cancels the request still in flight. While that round trip runs, the header says **Updating…** and **Render stand-in** waits. A warning with severity `error` blocks the preview and the render button. Other warnings sit at the bottom of the inspector.

The plate shows a JPEG of the current frame while paused, and the conformed video while playing. Over it:

- A short dotted trail of the body point, the last 18 frames, and a crosshair labelled with the part. An uncertain frame is drawn dashed.
- The flight path in yellow, with a diamond on each point. The release diamond selects that point. Later diamonds move.
- The effect, drawn as a sphere, ring, crystal, or cube in the look colour, at the size and place the preview returned.

**Select** is the default tool. **Draw path** is available for Hold + throw and Charge up. In that tool a click on the picture adds a point at the end of the flight. Hold and Orbit have no path, so the tool is disabled. **Wrong person or hand? Click it in the video** asks for one click, then tracks that spot and keeps the timing, path, grade, and behaviour. The track, the size, and the offset are replaced.

Playback: Space plays and pauses, unless the focus is in a field or on a button. Left and right step one frame. Shift and an arrow step ten. Delete or Backspace removes the selected path point. The release point cannot be deleted.

## Inspector

The inspector is the right column, 380 pixels wide. Sections collapse.

**Whole effect**

- **Behaviour.** Hold + throw, Hold, Charge up, or Orbit. Switching to Hold or Orbit clears the release and the route. Switching from one of those to a throw builds a release and a one-point route. Orbit also shows radius, speed, and tilt.
- **Attached to.** The same parts and side as the pick screen. Pose points track without a click. Palm uses a stored seed for that side when there is one, and otherwise asks for a click.
- **Shape.** Sphere, ring, crystal, or cube. Sphere is stored by leaving the field out.
- **Spin.** Degrees per second. The number starts at that shape's own rate, from `GET /api/v1/defaults`. **Default** clears an override.
- **Look.** A still, the name, and **Change**. The picker is below.
- **Ending.** Fade, Burst, or Shatter. Fade is stored by leaving the field out. Burst and Shatter lengthen the vanish to the default for that ending when the current vanish is shorter.
- **Size** and **Offset.** Size is the outer diameter in pixels and is applied along the path. Offset is x and y from the body point.

**Timing**

An effect-length bar compares the window with the server cap, 193 frames. Entrance is in seconds. Appear, release, vanish start, and vanish end are frame numbers. Release is hidden for Hold and Orbit.

**Path**

For a throw: how many points, **Draw path**, **Add point**, and **Reset path**. Reset restores the route from when the shot became a throw. The selected point shows its frame, its x and y when it is not the release, its easing (linear, in, out, in-out), and **Delete point**.

**Appearance**

Tint and glow. The look picker sets the tint when you choose a catalog look. The colour field still edits the tint on its own.

## Look picker

**Change** opens **Choose a look**. Five looks are drawn as stills: Fireball, Blue plasma, Electric orb, Ice sphere, and Shadow energy. A sixth cell uploads a PNG, JPG, or WebP still. A still of the effect on black is the one to use. A bright border or an image under 256 pixels is reported, and the file must be 20 MB or smaller.

Click a card to select it. Up to three can be selected. The first is **Main**, numbered 1, and it is the look the plate and the stand-in use. **Make main** moves another selection into that place. The prompt on the right belongs to the main look. **Surprise Me** fills a prompt from one of the five. **Use the {name} example** restores that look's own prompt. A prompt over 800 characters blocks both buttons. A short prompt, or one that never says the camera stays fixed, is a warning and does not block.

**Use {name}** writes the main look, its prompt, and its colour into the cue and closes the picker. **Generate** does that and then opens the stand-in render. Extra selected looks stay selected for the next time you open the picker. They are not separate renders. Escape or **Cancel** closes without writing.

A reference still is kept in the page. When it is the main look, the cue's `look` is `reference` and `reference_image` is the file name. The plate shows that still. The stand-in colour stays the tint already on the cue.

## Timeline

Under the picture. Zoom runs from 1 to 16, and the view scrolls to keep the effect window on screen when it fits.

- **Ruler.** Frame numbers, the playhead, and a mark for the effect range. Drag the ruler to scrub.
- **Hand track.** Confident frames in one colour, uncertain frames in another.
- **Effect.** Entrance, Held, Flight, and Vanish. Drag an edge to move appear, release, or either end of the vanish. The new value is sent when the pointer goes up.
- **Path.** A diamond for each route point. The release diamond selects it. Later diamonds scrub that point's frame.

Hold and Orbit show that there is no path, instead of the diamond lane.

## Stand-in

**Render stand-in** posts the clip id and the cue, then polls the job about every 1.5 seconds. Closing the panel aborts that poll. A cue that was rendered before returns immediately and is marked as from the cache. A new cue takes a few minutes. One render runs at a time on the server.

When it finishes, the panel plays the hard composite and offers:

- **Hard comp**, the person, the room, and the effect.
- **Layout**, the grey motion guide.
- **Element video**, which asks the server to build the effect on black for the whole clip, then **Download element**.

Warnings from the render are listed under the picture.

## How the code is split

```
app/page.js            home, new shot, or editor
app/layout.js          Inter, dark theme by default
app/globals.css        colour tokens, type, the range control
next.config.mjs        forwards /api/v1 to the API
lib/api.js             fetch and upload. Each function returns the server JSON
lib/cue.js             timings, the path, body points, looks, shape, and ending
components/HomeScreen.js
components/NewShot.js
components/Editor.js   plate, inspector, and the cue round trip
components/Plate.js    JPEG or video, and clicks in plate pixels
components/Timeline.js
components/LookPicker.js
components/StandinPanel.js
components/ui.js       buttons, sections, segmented controls, sliders
```

`lib/api.js` posts `{ cue }` to normalize, validate, and preview, and `{ clip_id, cue }` to start a job. Frame and video URLs are plain `/api/v1/...` paths. The plate uses those URLs in an `img` or a `video`. It does not use `next/image`.

`lib/cue.js` is the part of the cue the page is willing to edit before the server answers: moving a point, changing a frame, switching behaviour, and choosing a shape, look, or ending. Sphere, the default spin, and fade are omitted from the JSON. The schema rejects a null for those fields. After the server answers, the page keeps the cue it got back.

Colours, type, and spacing are CSS variables in `globals.css`, switched with `data-theme` on the document. Tailwind 4 reads those variables. There is no separate design-system page.

## Keyboard

| Key | Where | |
|---|---|---|
| Left, Right | Pick screen and editor | Step one frame |
| Shift + Left, Shift + Right | Pick screen and editor | Step ten frames |
| Space | Editor, when a field or button is not focused | Play or pause |
| Delete, Backspace | Editor, a path point after the release | Delete that point |
| Escape | Look picker | Close it |
