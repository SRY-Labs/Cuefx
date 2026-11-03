<p align="center">
  <img src="web/public/cuefx-logo.png" alt="CueFX" width="244">
</p>

# CueFX v2

CueFX places a drawn effect on a person in a clip and composites it back onto the footage. This folder is the v2 server and the editor that talks to it.

The server is a FastAPI app. It conforms an uploaded clip, tracks a body point with MediaPipe, keeps the shot settings in a cue document, and renders a stand-in: the effect drawn in code, then merged onto the plate. The editor is a Next.js app in `web/`. It calls `/api/v1` and uses the JSON as the server sends it.

App version `2.0.0`. Cue contract `3.0`. Interactive docs are at `/api/docs`.

## What you can do

Upload a clip, pick the body point the effect follows, and shape the shot in the editor.

- **Body point.** Palm, fist, foot, knee, shoulder, or head, on the left or right side. Head has no side. MediaPipe finds the point from the part and the side. A click on the picture is optional and points at a particular person.
- **Behaviour.** Hold, hold and throw, charge-up, or orbit. Hold and orbit stay on the body. The throw behaviours leave on a path you draw.
- **Shape and ending.** Sphere, ring, crystal, or cube. The effect fades, bursts, or shatters. A look sets the colour and the prompt.
- **Stand-in.** One render writes the hard composite (person, room, and effect), a grey layout of the motion, and, on request, the element (the effect on black, at plate size, for the whole clip).

The effect window is at most 193 frames, about 8 seconds at 24 fps. A longer window still renders: the start is kept and the tail is dropped, and the response says so.

## Run it locally

From this directory, with Python 3.11 or newer. `ffmpeg` and `ffprobe` must be on `PATH`. Health fails if either binary is missing. PyAV decodes JPEG frames. It does not supply ffmpeg.

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
python app.py
```

On macOS or Linux, activate with `source .venv/bin/activate`.

The API listens on `http://127.0.0.1:8000`. Check `GET /api/v1/health`.

Then start the editor, from `web/`:

```
npm install
npm run dev
```

Open http://localhost:3000. The browser calls `/api/v1` on that origin, and Next forwards those requests to `http://127.0.0.1:8000`.

If port 8000 is already in use, start the API on another port and point the editor at the same place:

```
set CUEFX_PORT=8001
python app.py
```

```
set CUEFX_API_ORIGIN=http://127.0.0.1:8001
npm run dev
```

Run the API with one worker. The render queue lives in the process. The same command is `uvicorn app:create_app --factory --host 127.0.0.1 --port 8000 --workers 1`.

## A shot, end to end

1. **Upload.** `POST /api/v1/clips` with a multipart field named `file` (`.mp4`, `.mov`, `.mkv`, or `.webm`, up to 500 MB). The clip is fit inside 1920×1080, set to 24 fps, rotated from its tag first, and read as Rec.709. Clips longer than 1440 frames (60 seconds) are rejected. The clip id is the first 12 hex characters of the file's SHA-256. The same file uploaded again returns the existing clip.
2. **Watch it.** `GET /api/v1/clips/{id}` is the plate size, frame count, and fps. `GET /api/v1/clips/{id}/video` is the conformed proxy. `GET /api/v1/clips/{id}/frames/{frame}` is one JPEG, with no `.jpg` on the URL.
3. **Track.** `POST /api/v1/clips/{id}/cue` with `{ "hand": "right" }` for a palm, or `{ "hand": "right", "body_point": { "part": "head", "side": null } }` for a pose point. Add `hand_seed: { "frame", "x", "y" }` only when a click should pick the person. The response is a cue, warnings, and a short summary. `POST /api/v1/clips/{id}/analysis` returns the track without building a cue.
4. **Edit.** The editor keeps the cue and, on each change, calls `POST /api/v1/cue/normalize`, then `validate`, then `preview`. Normalize fills defaults and may lengthen the vanish for a burst or shatter. Validate returns warnings. Preview returns the effect position per frame. `POST /api/v1/cue/timing` answers timing questions. `GET /api/v1/defaults` is the spin, ending length, and orbit numbers the editor starts from.
5. **Render.** `POST /api/v1/jobs` with `{ "clip_id", "cue" }` returns `202` and a job id, or `200` when that cue was already rendered. Poll `GET /api/v1/jobs/{id}` until `status` is `done`. `GET /api/v1/jobs/{id}/result` is the summary. `GET /api/v1/jobs/{id}/artifacts/hardcomp` plays the composite. Add `?download=true` to download it. `layout` is the grey motion guide. `POST /api/v1/jobs/{id}/artifacts/element` builds the effect-on-black video, then `GET` the `element` artifact. An artifact that is not ready is `409` with `artifact_status`.

Errors are `{ "code", "message" }`. A URL returns either JSON or a file, never both.

The track list on the wire is `{ frame, x, y, confidence, uncertain, source, palm_w }`. Inside the cue document, the hand seed, the route, and corrections still use `f`.

## The cue

A cue is the shot. It names the clip, the body point, the track, when the effect appears and vanishes, its size, its path, and its grade. New cues are version `2.3`. Setting a body point writes `2.4`, a shape or a spin writes `2.5`, and a burst, a shatter, charge-up, or orbit writes `2.6`. Older files through `2.2` still load.

Missing shape means sphere. Missing ending means fade. Missing spin means that shape's own rate. Route points are `{ f, x, y, diameter_px, easing_in }`. The first point is the release and may omit `x` and `y`, because it starts on the body. Later points need both, and frames increase.

## Where files go

`CUEFX_DATA_DIR` defaults to `data/` beside `app.py`.

```
data/uploads/          original uploads
data/cache/<clip_id>/  conformed plate, proxy, analysis
data/standin/<key>/    layout, effect, and matte for one make
data/standin/<key>/merge/<merge_id>/   hardcomp, and element.mp4 once it is asked for
data/look/standin_orb.png              the look image, drawn if it is missing
```

A make is cached by the cue and the look image. A merge is cached by the whole cue, the clip, and the code version. Editing Python changes that version, so the next render is not a cache hit.

## Layout

```
app.py                 create_app() and the uvicorn entry
api/v1/                HTTP routes, one file per resource
clips/                 upload, conform, plate frames
analysis/              hand track, pose, masks
cue/                   the cue document and its maths
render/                the queue, the stand-in job, layout, effect, merge, element
media/                 ffmpeg and ffprobe as subprocesses; PyAV for JPEG frames
contract/schemas/      cue, track, warning, and error-code schemas
web/                   the Next.js editor
tests/                 API tests
```

## Configuration

| Variable | Default | |
|---|---|---|
| `CUEFX_DATA_DIR` | `data` | uploads, cache, renders, look image |
| `CUEFX_HOST` | `127.0.0.1` | bind address |
| `CUEFX_PORT` | `8000` | bind port |
| `CUEFX_CORS_ORIGINS` | `http://localhost:5173` | comma-separated browser origins |
| `CUEFX_MAX_UPLOAD_MB` | `500` | upload limit |
| `CUEFX_LOOK_IMAGE` | `<data>/look/standin_orb.png` | the look the stand-in places |
| `CUEFX_API_ORIGIN` | `http://127.0.0.1:8000` | where the editor's Next server forwards `/api/v1` |

For the editor on port 3000, set `CUEFX_CORS_ORIGINS` to `http://localhost:3000` if a browser calls the API host directly. The usual path is the Next rewrite, which does not need that.

## Container

`Dockerfile` is the Azure Container Apps image. It installs ffmpeg with apt, downloads the MediaPipe hand and pose models at build time, and runs uvicorn on `$PORT` with one worker. Set `CUEFX_DATA_DIR` to `/data` and mount that path. Use one replica: a second process has its own render queue and will not see the first process's jobs.

## Tests

From this directory, with the dev requirements installed:

```
pytest -q
```
