"""Stand-in render: Make (layout + stand-in effect) and Merge of one cue on its clip, with no LTX, cached on disk.

    <data>/standin/<make_key>/                    Make: layout.mp4, effect.mp4, matte.mp4 and their debug files;
                                                  make.json is written last (the folder is complete)
    <data>/standin/<make_key>/merge/<merge_id>/   Merge: final.mp4 (the hard comp), compare.mp4, sheets, cue.json;
                                                  standin.json is written last. element.mp4 appears on the first
                                                  request for it (Merge again with the layer export, then the video)

Make is cached by the normal Make key (cue.make_key), so a cue that only changes Merge fields (vanish, behind,
grade) reuses it. Merge is cached by `merge_id`, a hash of the whole cue, the clip and the cuefx code version.
The steps are the scripts' own functions (render.pipeline, render.merge.run_merge): no maths here.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
from dataclasses import replace
from pathlib import Path

import cv2

from cue import api
from cue.model import Cue, cue_from_dict, cue_to_dict
from media.ffmpeg import LayoutError
from render.look import LookError, standin_look
from cue.make_key import make_key
from analysis.masks import load_landmarks
from render.merge import run_merge
from render.pipeline import make_layout, make_standin_effect, write_element_video
from cue.route import orb_path
from analysis.hands import TrackError
from cue.window import effect_window

from clips.store import ClipStore, code_version, safe_name
from config import Settings
from errors import ApiError, ArtifactError, invalid, not_found
from render.queue import RenderQueue

log = logging.getLogger("cuefx.server")

ID_RE = re.compile(r"^([0-9a-f]{12})-([0-9a-f]{12})$")
# published name -> (folder: make | merge, file in it, download name suffix; None = shown inline)
FILES = {
    "hardcomp_preview.mp4": ("merge", "final.mp4", None),
    "hardcomp.mp4": ("merge", "final.mp4", "hardcomp.mp4"),
    "element.mp4": ("merge", "element.mp4", "element.mp4"),
    "layout.mp4": ("make", "layout.mp4", "layout.mp4"),
}
# result `files` key -> published name
RESULT_FILES = {"hardcomp_preview": "hardcomp_preview.mp4", "hardcomp_download": "hardcomp.mp4",
                "element_download": "element.mp4", "layout_download": "layout.mp4"}
MAKE_STAGE, MERGE_STAGE = "Building reference frame", "Blending into your footage"  # CONTRACT.md section 9


def _failed(stage: str) -> ApiError:
    return ApiError("render_failed", api.message("render_failed", stage_name=stage), 500)


_write_guard = threading.Lock()


def _write_json(path: Path, doc: dict) -> None:
    """Replace `path` with `doc`.

    Two starts of one job must not share a temp file. Windows also refuses to replace a file another
    writer just replaced, so the replace is serialized and retried.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(doc, indent=1, ensure_ascii=False)
    fd, name = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".part", dir=path.parent)
    part = Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
        delay = 0.01
        for attempt in range(8):
            try:
                with _write_guard:
                    os.replace(part, path)
                return
            except PermissionError:
                if attempt == 7:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 0.1)
    except Exception:
        part.unlink(missing_ok=True)
        raise


def checked_cue(clips: ClipStore, cue: dict, track: list[dict] | None, clip_id: str | None) -> tuple[dict, Cue, str, Path]:
    """(cue dict with `track` in it, Cue, clip id, plate) of a cue to render on its clip (`clip_id`, else the stored
    clip named `cue.clip`). 400 input_invalid if the cue has errors or does not fit the clip."""
    if track is not None:
        api.check_schema("cue", cue)
        api.check_schema("track", track)
        cue = cue_to_dict(replace(cue_from_dict(cue), track=api.points_from_track(track)))
    errors = [w for w in api.validate(cue) if w["severity"] == "error"]
    if errors:
        raise invalid("the cue has errors; run validate. " + "; ".join(w.get("detail", w["message"])
                                                                       for w in errors[:3]))
    if not clip_id:
        raise invalid("clip_id is required")
    plate, info = clips.plate(clip_id), clips.info(clip_id)
    c = cue_from_dict(cue)
    if info["plate_size"] != list(c.plate_size) or info["frames"] != c.frames:
        raise invalid(f"the cue is for a {c.plate_size[0]}x{c.plate_size[1]} plate of {c.frames} frames; clip "
                      f"{clip_id} is {info['plate_size'][0]}x{info['plate_size'][1]}, {info['frames']} frames")
    return cue, c, clip_id, plate


def cue_landmarks(clips: ClipStore, clip_id: str, c: Cue) -> tuple[dict | None, list[str]]:
    """The cached hand landmarks of this clip, hand and seed (kept by analyze), only if a behind range reads them."""
    if not c.behind:
        return None, []
    seed = {"frame": c.hand_seed.f, "x": float(c.hand_seed.x), "y": float(c.hand_seed.y)}
    try:
        path = clips.landmarks(clip_id, c.hand, seed)
        return (load_landmarks(path) if path.is_file() else None), []
    except api.CueFXError as e:
        return None, [f"behind: the hand landmarks could not be made ({e.message})"]


class StandinStore:
    """Stand-in renders under settings.standin_dir. Make and Merge run on the render queue (one at a time: they use
    the whole CPU); the request thread only checks the cue, submits and, unless asked not to, waits."""

    def __init__(self, settings: Settings, clips: ClipStore, queue: RenderQueue) -> None:
        self.s, self.clips, self.queue = settings, clips, queue
        self._meta: dict[str, dict] = {}

    def _merge_dir(self, standin_id: str) -> tuple[str, str, Path]:
        """(make key, merge id, Merge folder) of a stand-in id; 404 not_found if it is not one."""
        m = ID_RE.match(standin_id)
        if not m:
            raise not_found(f"unknown stand-in {standin_id!r}")
        key, merge_id = m.groups()
        return key, merge_id, self.s.standin_dir / key / "merge" / merge_id

    # ----------------------------------------------------------------- render

    def render(self, cue: dict, track: list[dict] | None = None, clip_id: str | None = None,
               wait: bool = True) -> tuple[dict, bool]:
        """Make + Merge of `cue` on its clip (`clip_id`, else the stored clip named `cue.clip`).

        wait: (standin_result, True) when the render is finished. Not wait: (standin status, finished) at once.
        400 input_invalid if the cue has errors or does not fit the clip; 500 render_failed if a step fails."""
        cue, c, clip_id, plate = checked_cue(self.clips, cue, track, clip_id)
        look = self._look_for(c)
        key = make_key(c, look)
        merge_id = hashlib.sha256(json.dumps([cue, clip_id, code_version()], sort_keys=True).encode()).hexdigest()[:12]
        sid = f"{key}-{merge_id}"
        self._meta[sid] = {"clip_id": clip_id, "make_key": key, "submitted": time.time()}
        merge_dir = self.s.standin_dir / key / "merge" / merge_id
        merge_dir.mkdir(parents=True, exist_ok=True)
        if not (merge_dir / "standin.json").is_file():
            _write_json(merge_dir / "job.json", {"id": sid, "clip_id": clip_id, "make_key": key, "status": "running"})
        done = merge_dir / "standin.json"
        if done.is_file() and not self.queue.busy(sid):
            log.info("stand-in %s from the cache", sid)
            return (self._result(sid, cached=True) if wait else self.status(sid, cached=True)), True
        t0 = time.perf_counter()  # `total` counts from the request, queue wait included, as before task 27
        task = self.queue.submit(sid, lambda: self._render(plate, clip_id, c, cue, look, key, merge_id, t0))
        if not wait:
            st = self.status(sid)
            return st, st["status"] == "done"
        return self._result(sid, cached=task.wait()), True

    def _render(self, plate: Path, clip_id: str, c: Cue, cue: dict, look: Path, key: str, merge_id: str,
                t0: float) -> bool:
        """The render itself, on the queue's thread; True if it was already on disk (cached)."""
        make_dir = self.s.standin_dir / key
        merge_dir = make_dir / "merge" / merge_id
        done = merge_dir / "standin.json"
        if done.is_file():
            return True
        timings: dict[str, float] = {}
        warnings = self._make(plate, c, look, make_dir, timings)
        warnings += self._merge(plate, clip_id, c, make_dir, merge_dir, timings)
        timings["total"] = time.perf_counter() - t0
        _write_json(merge_dir / "cue.json", cue)  # what element() needs to render the layers later
        _write_json(done, {"clip": c.clip, "clip_id": clip_id, "make_key": key, "merge_id": merge_id,
                           "warnings": warnings, "seconds": round(timings["total"], 2),
                           "timings_s": {k: round(v, 2) for k, v in timings.items()}})
        log.info("stand-in %s-%s rendered in %.1f s; stages %s", key, merge_id, timings["total"],
                 {k: round(v, 2) for k, v in timings.items()})
        return False

    def _result(self, standin_id: str, cached: bool) -> dict:
        """The standin_result of a finished render (read from its folder)."""
        key, _, merge_dir = self._merge_dir(standin_id)
        meta = json.loads((merge_dir / "standin.json").read_text(encoding="utf-8"))
        c = cue_from_dict(json.loads((merge_dir / "cue.json").read_text(encoding="utf-8")))
        w = effect_window(c)
        timings_s = {"landmarks": 0.0, "make": 0.0, "merge": 0.0, "element": 0.0, **meta.get("timings_s", {})}
        return {"standin_id": standin_id, "make_key": key, "clip_id": meta["clip_id"], "frames": c.frames,
                "fps": c.fps, "plate_size": list(c.plate_size), "effect_range": {"start": w.start, "end": w.end},
                "files": {k: f"/api/standin/{standin_id}/{name}" for k, name in RESULT_FILES.items()},
                "cached": cached, "warnings": meta["warnings"], "timings_s": timings_s}

    def status(self, standin_id: str, cached: bool | None = None) -> dict:
        """standin_status: {standin_id, status queued|running|done|failed, error, element, result}. `element` is the
        state of element.mp4 (none until it is first requested). `result.cached`: `cached` if given, else whether
        no render of this server session made the files. 404 not_found for an unknown stand-in."""
        _, _, merge_dir = self._merge_dir(standin_id)
        task, el = self.queue.get(standin_id), self.queue.get(f"{standin_id}/element")
        element = ("done" if (merge_dir / "element.mp4").is_file() else
                   el.status if el is not None else "none")
        out = {"standin_id": standin_id, "status": "done", "error": None, "element": element, "result": None}
        if task is not None and task.status != "done":
            return {**out, "status": task.status, "error": task.error and task.error.to_dict()}
        if not (merge_dir / "standin.json").is_file():
            note = merge_dir / "job.json"
            if note.is_file() and task is None:
                saved = json.loads(note.read_text(encoding="utf-8"))
                self._meta.setdefault(standin_id, {"clip_id": saved["clip_id"], "make_key": saved["make_key"],
                                                   "submitted": note.stat().st_mtime})
                return {**out, "status": "failed",
                        "error": {"code": "render_failed", "message": "the render stopped before it finished"}}
            raise not_found(f"unknown stand-in {standin_id!r}")
        if cached is None:
            cached = task is None or task.future.result()
        return {**out, "result": self._result(standin_id, cached=cached)}

    def _look_for(self, cue: Cue) -> Path:
        """The look image for this cue. The default energy-orb file stays as it is. Any other tint is drawn once
        beside it, so a Fireball and an Ice sphere do not share one picture."""
        tint = (cue.grade.tint if cue.grade and cue.grade.tint else "#9fd4ff").lower()
        if tint == "#9fd4ff":
            return self._look()
        path = self.s.look_path.with_name(f"standin_{tint[1:]}.png")
        if not path.is_file():
            path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(path), standin_look(tint=tint))
        return path

    def _look(self) -> Path:
        """The look image Make uses (part of the make key). If it is missing, the default stand-in look is drawn
        there, as scripts/make_standin_look.py does."""
        p = self.s.look_path
        if not p.is_file():
            p.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(p), standin_look())
            log.warning("no look image at %s: drew the default stand-in look there", p)
        return p

    def _make(self, plate: Path, c, look: Path, make_dir: Path, timings: dict[str, float]) -> list[str]:
        done = make_dir / "make.json"
        if done.is_file():  # a Make already on disk (same make key) costs nothing
            return json.loads(done.read_text(encoding="utf-8"))["warnings"]
        t = time.perf_counter()
        try:
            warnings = make_layout(plate, c, look, make_dir).warnings
            warnings += make_standin_effect(c, look, make_dir).warnings
        except (LayoutError, LookError, TrackError) as e:
            log.error("stand-in Make failed in %s", make_dir, exc_info=e)
            raise _failed(MAKE_STAGE) from e
        _write_json(done, {"warnings": warnings})
        timings["make"] = time.perf_counter() - t
        return warnings

    def _landmarks(self, clip_id: str, c, timings: dict[str, float]) -> tuple[dict | None, list[str]]:
        t = time.perf_counter()
        try:
            return cue_landmarks(self.clips, clip_id, c)
        finally:
            if c.behind:
                timings["landmarks"] = time.perf_counter() - t

    def _merge(self, plate: Path, clip_id: str, c, make_dir: Path, merge_dir: Path,
               timings: dict[str, float]) -> list[str]:
        """Merge for the preview: final.mp4 only, no layer PNGs and no element video (element() makes them on demand)."""
        landmarks, warnings = self._landmarks(clip_id, c, timings)
        t = time.perf_counter()
        try:
            rep = run_merge(plate, c, orb_path(c), make_dir, merge_dir, landmarks, [], export_layers=False)
        except LayoutError as e:  # VideoError is a LayoutError
            log.error("stand-in Merge failed in %s", merge_dir, exc_info=e)
            raise _failed(MERGE_STAGE) from e
        timings["merge"] = time.perf_counter() - t
        return warnings + rep.warnings

    def element(self, key: str, merge_id: str, done: Path) -> Path:
        """element.mp4 of a finished render, made on the first request and kept: Merge again with the layer export
        (into a work folder, so final.mp4 is not touched), then the element video from those layers. The layers are
        deleted afterwards; the video is what is kept."""
        merge_dir = done.parent
        out = merge_dir / "element.mp4"
        if out.is_file():
            return out
        meta = json.loads(done.read_text(encoding="utf-8"))
        clip_id = meta["clip_id"]
        plate = self.clips.plate(clip_id)
        c = cue_from_dict(json.loads((merge_dir / "cue.json").read_text(encoding="utf-8")))
        timings: dict[str, float] = {}
        landmarks, warnings = self._landmarks(clip_id, c, timings)
        work = merge_dir / "element_work"
        t = time.perf_counter()
        try:
            run_merge(plate, c, orb_path(c), self.s.standin_dir / key, work, landmarks, [], export_layers=True)
            t_layers = time.perf_counter() - t
            part = merge_dir / "element.part.mp4"
            run = write_element_video(c, work / "layers", part)
        except LayoutError as e:
            log.error("stand-in element video failed in %s", merge_dir, exc_info=e)
            raise _failed(MERGE_STAGE) from e
        finally:
            shutil.rmtree(work, ignore_errors=True)
        part.replace(out)
        took = time.perf_counter() - t
        meta["warnings"] = meta["warnings"] + warnings + [w for w in run.warnings if w not in meta["warnings"]]
        meta["timings_s"] = {**meta.get("timings_s", {}), "element_layers": round(t_layers, 2),
                             "element": round(took, 2)}
        _write_json(done, meta)
        log.info("stand-in %s-%s element video made in %.1f s (layers %.1f s)", key, merge_id, took, t_layers)
        return out

    # ----------------------------------------------------------------- files

    def file(self, standin_id: str, name: str, wait: bool = True) -> tuple[Path | None, str | None]:
        """(file, download name or None for inline) of a finished render; 404 not_found if there is none.
        element.mp4 is built on the render queue on its first request; with `wait` false that request answers
        (None, None) at once instead of the file (the caller then sends the stand-in status)."""
        if name not in FILES:
            raise not_found(f"unknown stand-in file {standin_id}/{name}")
        key, merge_id, merge_dir = self._merge_dir(standin_id)
        done = merge_dir / "standin.json"
        if not done.is_file():
            raise not_found(f"unknown stand-in {standin_id!r}")
        folder, file, suffix = FILES[name]
        path = (merge_dir if folder == "merge" else self.s.standin_dir / key) / file
        if name == "element.mp4" and not path.is_file():  # made on the first request, then kept
            task = self.queue.submit(f"{standin_id}/element", lambda: self.element(key, merge_id, done))
            if not wait:
                return None, None
            path = task.wait()
        if not path.is_file():
            raise not_found(f"stand-in {standin_id!r} has no {name}")
        if suffix is None:
            return path, None
        clip = json.loads(done.read_text(encoding="utf-8"))["clip"]
        return path, safe_name(f"{Path(clip).stem}_{key}_{suffix}")

    # ----------------------------------------------------------------- v2 job document

    _ARTIFACTS = {
        "hardcomp": ("merge", "final.mp4", "hardcomp.mp4"),
        "layout": ("make", "layout.mp4", "layout.mp4"),
        "element": ("merge", "element.mp4", "element.mp4"),
    }

    def start(self, cue: dict, clip_id: str) -> tuple[dict, int]:
        """Queue a stand-in. (job document, 200 when that cue is already done, else 202)."""
        _doc, finished = self.render(cue, None, clip_id, wait=False)
        job_id = _doc["standin_id"]
        return self.document(job_id), 200 if finished else 202

    def document(self, job_id: str) -> dict:
        """The job the client polls: status, error, and the artifact map."""
        state = self.status(job_id)
        result = state.get("result")
        meta = self._meta.get(job_id, {})
        return {
            "id": job_id,
            "status": state["status"],
            "error": state["error"],
            "clip_id": (result or meta).get("clip_id"),
            "make_key": (result or meta).get("make_key") or job_id.split("-", 1)[0],
            "warnings": [] if result is None else result["warnings"],
            "artifacts": self._artifacts(job_id, state),
        }

    def result_body(self, job_id: str) -> dict:
        """The stand-in summary. 409 until the job is done."""
        state = self.status(job_id)
        if state["status"] != "done" or state["result"] is None:
            raise invalid(f"job {job_id} is {state['status']}", 409)
        result = state["result"]
        return {
            "effect_range": result["effect_range"],
            "timings_s": result["timings_s"],
            "cached": result["cached"],
            "warnings": result["warnings"],
            "artifacts": self._artifacts(job_id, state),
        }

    def list_jobs(self) -> list[dict]:
        """Jobs newest first: finished renders on disk, plus any still only in this process."""
        found: dict[str, float] = {}
        root = self.s.standin_dir
        if root.is_dir():
            for path in root.glob("*/merge/*/standin.json"):
                found[f"{path.parents[2].name}-{path.parent.name}"] = path.stat().st_mtime
            for path in root.glob("*/merge/*/job.json"):
                found.setdefault(f"{path.parents[2].name}-{path.parent.name}", path.stat().st_mtime)
        for job_id, meta in self._meta.items():
            found.setdefault(job_id, meta["submitted"])
        out = []
        for job_id in sorted(found, key=lambda j: found[j], reverse=True):
            try:
                out.append(self.document(job_id))
            except Exception as exc:  # a half-written folder must not hide the rest of the list
                log.warning("skipping job %s: %s", job_id, exc)
        return out

    def request_element(self, job_id: str) -> dict:
        """Enqueue the element video for a finished stand-in and return the job."""
        _key, merge_id, merge_dir = self._merge_dir(job_id)
        done = merge_dir / "standin.json"
        if not done.is_file():
            raise not_found(f"unknown job {job_id!r}")
        if not (merge_dir / "element.mp4").is_file():
            self.queue.submit(f"{job_id}/element", lambda: self.element(_key, merge_id, done))
        return self.document(job_id)

    def open_artifact(self, job_id: str, name: str) -> tuple[Path, str | None]:
        """(path, download filename or None to play inline). 409 when that artifact is not ready."""
        if name not in self._ARTIFACTS:
            raise not_found(f"unknown artifact {name!r}")
        state = self.status(job_id)
        artifacts = self._artifacts(job_id, state)
        if artifacts[name]["status"] != "ready":
            raise ArtifactError(artifacts[name]["status"])
        key, _merge_id, merge_dir = self._merge_dir(job_id)
        folder, filename, suffix = self._ARTIFACTS[name]
        path = (merge_dir if folder == "merge" else self.s.standin_dir / key) / filename
        if not path.is_file():
            raise ArtifactError(artifacts[name]["status"])
        clip = json.loads((merge_dir / "standin.json").read_text(encoding="utf-8"))["clip"]
        return path, safe_name(f"{Path(clip).stem}_{key}_{suffix}")

    def _artifacts(self, job_id: str, state: dict) -> dict:
        element = {"done": "ready"}.get(state["element"], state["element"])
        job_status = state["status"]

        def media(ready: bool) -> dict:
            if ready:
                return {"status": "ready", "url": f"/api/v1/jobs/{job_id}/artifacts/{name}"}
            if job_status in ("queued", "running", "failed"):
                return {"status": job_status}
            return {"status": "none"}

        out = {}
        for name in ("hardcomp", "layout"):
            out[name] = media(job_status == "done")
        element_doc = {"status": element}
        if element == "ready":
            element_doc["url"] = f"/api/v1/jobs/{job_id}/artifacts/element"
        out["element"] = element_doc
        return out
