# CueFX: the editor workspace

For the SRY Labs team. This is the `ux/editor-workspace` branch. It replaces the upload screen, the tracking screen, the editor's side drawers and the separate render screen with one workspace, as designed on the canvas (v7). Only `web/` changed. Every control calls an endpoint the API already has. Nothing in the server changed.

## Why

The old flow had four screens: Upload, Track, Direct, Render. Each one asked for its own setup, moved the user on when it was done, and hid what came before. VFX artists work differently. In After Effects, CapCut or Nuke there is one viewer, one timeline and a properties panel. Every setting stays editable, previews are instant, and a render is a deliberate press that produces a version. The workspace follows that model:

- **One screen.** The viewer is on the left, with the timeline right under it. The effect's settings run the full height on the right, in two tabs: Effect and Prompt. Takes open in their own player.
- **Nothing moves the user.** Upload, tracking and renders report in place: the tracking lane, the Takes button and one snackbar. When a take finishes, a message offers Watch. The viewer and the settings tabs never switch by themselves.
- **One place for messages.** The snackbar at the top centre, under the bar, carries every message: work in progress (upload, tracking, re-tracking) with its progress, modes (picking a point, with Esc), problems with their fixes (a clip that is too long, tracking that found nobody), and short results with an action (Undo, Watch). Only one shows at a time and nothing is written over the video.
- **Every setting lives in one place, and stays editable.** Changing the body point re-tracks in place and keeps the path, look, size and timing.

## The flow

1. **Landing.** The user chooses a Clip (the sample, or their own file) and a Preset (Plasma charge-up, Fireball throw, Orbiting spark, Ice in hand), then presses Try this shot. A file is checked for length and size as soon as it is chosen, or dropped anywhere on the page. A preset only sets the starting look and behaviour.
2. **The editor opens straight away.** An uploaded clip plays from the browser while it uploads and prepares. Then the server's frames take over and tracking runs. The tracking lane fills, and the header shows a timer.
3. **The user shapes the effect.** The Effect tab has Anchor, Motion and Look; the Prompt tab has the styled frame, the video and the seed. Every section opens and closes with an arrow, and a closed one shows its value.
4. **Render.** Pressing Render opens the take's view, where its stages fill in. Pressed while the clip is still uploading or tracking, it queues, starts when the cue is checked, and offers Watch. A take runs the guide pass, the styled frame, then the video. The user can keep editing meanwhile.
5. **Takes.** The Takes button opens a full-screen player: the takes listed on the left, the result large, a transport with frame steps, loop, speed and side-by-side compare. It has "Use these settings" and downloads for the video, the styled frame and the guide pass. A failed stage keeps the stages before it and offers Retry from that stage.

## The look

The workspace uses the Enhanced UI: dark grey surfaces, grey selection and green actions. The full token list is in `web/app/globals.css`.

- **Surfaces are dark greys.** The app background is `#0E0E0E`, bars and panels are `#141414`, and fields and secondary buttons are `#222222`. Lines are `#222222` and `#2E2E2E`.
- **A selected item is a lighter grey (`#383838`), never the accent.** This covers segmented controls, tiles, tabs, tools and the takes list.
- **Green is only for actions and progress.** It is used for Render, Download, Try this shot, the playhead, upload and render progress, and the focus ring. It is VestraPath's `#43AE7A`, with black text.
- **One grid in the settings panel.** Every row has a 72 px label column, a control column that fills the rest, and 30 px controls. A label next to a control that takes several rows sits at the top.
- **The timeline lanes are all 32 px tall.** Tracked, Effect and Path each draw their bar or marks in the same 20 px band in the middle of the lane.
- **Type is Inter,** self-hosted, at 12 to 13 px in the editor.

## Controls

| Where | What | API it uses |
| --- | --- | --- |
| Anchor | Body point (palm, fist, foot, knee, shoulder, head) with icons, left or right, pick on the video (B). | `POST /clips/{id}/cue` |
| Motion | Behaviour (icons with tooltips). Appear, Release, Vanish and Gone in frames, plus Entrance in seconds. Path: Add, Reset, Even out. The selected point: frame, X/Y, easing, delete. Orbit radius, speed and tilt. | `cue/normalize`, `cue/validate`, `cue/preview`, `cue/timing` |
| Look | The five looks, size, ending, shape, spin (with Default), glow, tint, offset | same as above |
| Prompt tab | The styled-frame prompt, Auto (written from look and behaviour) or Custom, up to 800 characters, with checks. The video prompt, Auto or Custom. The seed, with a dice for a new one. A dot on the tab shows an error (red) or wording that still describes another look (amber). | `generations`, `jobs/{id}/video` |
| Viewer | A toolbar over the video, bottom centre: Select (V), Draw path (P), Pick (B), Loop (L). Guides on or off (G) in the bar above the video. | |
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
