# CueFX: the editor workspace

For the SRY Labs team. This is the `ux/editor-workspace` branch. It replaces the upload screen, the tracking screen, the editor's side drawers and the separate render screen with one workspace, as designed on the canvas (v7). Only `web/` changed. Every control calls an endpoint the API already has. Nothing in the server changed.

## Why

The old flow had four screens: Upload, Track, Direct, Render. Each one asked for its own setup, moved the user on when it was done, and hid what came before. VFX artists work differently. In After Effects, CapCut or Nuke there is one viewer, one timeline and a properties panel. Every setting stays editable, previews are instant, and a render is a deliberate press that produces a version. The workspace follows that model:

- **One screen.** The viewer is on the left, with the timeline right under it and the takes strip below that. The effect's settings run the full height on the right.
- **Nothing moves the user.** Upload, tracking and renders report in place: the top bar, the tracking lane and the takes strip. When a take finishes, a message offers Watch. The viewer never switches by itself.
- **Every setting lives in one place, and stays editable.** Changing the body point re-tracks in place and keeps the path, look, size and timing.

## The flow

1. **Landing.** The user chooses a Clip (the sample, or their own file) and a Preset (Plasma charge-up, Fireball throw, Orbiting spark, Ice in hand), then presses Try this shot. A file is checked for length and size as soon as it is chosen, or dropped anywhere on the page. A preset only sets the starting look and behaviour.
2. **The editor opens straight away.** An uploaded clip plays from the browser while it uploads and prepares. Then the server's frames take over and tracking runs. The tracking lane fills, and the header shows a timer.
3. **The user shapes the effect.** The settings are in four groups, Anchor, Motion, Look and Prompt. Each group header shows a summary, so they can be read with the groups closed.
4. **Render.** Pressed while the clip is still uploading or tracking, it queues and starts when the cue is checked. A take runs the guide pass, the styled frame, then the video. The user can keep editing meanwhile.
5. **Takes.** The strip under the timeline reads Edit, Take 1, Take 2 and so on. Clicking a take shows it in the viewer, with its seed and frames, "Use these settings", and downloads for the video, the styled frame and the guide pass. A failed stage keeps the stages before it and offers Retry from that stage.

## Controls

| Where | What | API it uses |
| --- | --- | --- |
| Anchor | Body point (palm, fist, foot, knee, shoulder, head) with icons, left or right, pick on the video (B). Shows unsure frames inside the effect, with Show. | `POST /clips/{id}/cue` |
| Motion | Behaviour (icons with tooltips). Appear, Release, Vanish and Gone in frames, plus Entrance in seconds. Path: Add, Reset, Even out. The selected point: frame, X/Y, easing, delete. Orbit radius, speed and tilt. | `cue/normalize`, `cue/validate`, `cue/preview`, `cue/timing` |
| Look | The five looks, size, ending, shape, spin (with Default), glow, tint, offset | same as above |
| Prompt | The styled-frame prompt, Auto (written from look and behaviour) or Custom, up to 800 characters, with checks. The video prompt, Auto or Custom. The seed, with a dice for a new one. | `generations`, `jobs/{id}/video` |
| Viewer | Select (V), Draw path (P), Pick (B), Pan (H). Guides on or off (G). Zoom: Fit, 150%, 200%, 300%. | |
| Timeline | Frame step, play, loop the effect (L), snap, zoom in or out, Fit. Effect edges and point diamonds can be dragged; edges can also be moved with the arrow keys. | |
| Top bar | Undo (Ctrl Z), Redo (Ctrl Shift Z), and Render with a menu: Render take or Guide pass only | `jobs`, `generations`, `jobs/{id}/video` |

Deleting a path point works three ways: the Delete key, the bin icon on the selected point, or Undo.

## Edge cases covered

- **The clip is too long, too big or unreadable.** The landing page says so before anything uploads. A failed upload in the editor offers "Choose another clip".
- **Nobody is found.** The viewer explains what went wrong and offers "Pick on the video" and "Try again". Render stays off until tracking works.
- **Palm needs a click on the video.** This is the old editor's rule, kept so CueFX tracks the right hand.
- **No room for another point.** Adding a point past the 8-second window, or past the last frame of the clip, is refused with a plain message.
- **Hold and Orbit have no path.** The pen is off, the timeline says why, and switching back to a throw starts a fresh path.
- **The prompt is empty or too long.** The full render is blocked with a message, but Guide pass only still runs.
- **The user leaves while a take renders.** The editor asks first ("Leave").
- **Re-tracking.** A late result from an earlier request is ignored, so the last choice wins.

## What still needs the server

- **Splicing the video into the full clip.** The LTX video covers only the effect window. The take view plays it on its own and labels its frames. Splicing it back into the full clip is server work.
- **Saving takes.** Takes live in the page, so a reload loses them. Saving them would need a store on the server.
- **Upload progress.** The server prepares the clip and tracks it in one call each, so the editor shows a timer rather than a percentage.

## Removed

`NewShot`, `FlowSteps`, `StandinPanel`, `EditorPanels` and `LookPicker` are gone. `LookPicker`'s multi-look selection and reference image were never sent to the renderer: the server marks them `setting_not_used`. `LookStill` moved to its own file.
