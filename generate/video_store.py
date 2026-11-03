"""Queue one LTX video at a time, apart from the stand-in render and the reference still."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import threading
import time
from pathlib import Path

import numpy as np

from cue import api as cue_api
from cue.window import effect_window
from errors import ApiError, internal, invalid, not_found
from generate.reference import _cue, _seed_of
from generate.video_render import VideoRenderError, _credentials, render_video
from media.video import VideoError, VideoWriter, read_frames
from render.jobs import _write_json
from render.queue import RenderQueue

log = logging.getLogger("cuefx.server")

STAGE = "Rendering LTX video"
PREFIX_FRAMES = 17
MIN_GUIDE_FRAMES = 41  # first_empty_cell 5 needs more than 5 content cells; 41 is 8×5+1
_ID = re.compile(r"^[0-9a-f]{16}$")


def _lost() -> ApiError:
    return ApiError("server_lost", cue_api.message("server_lost"), 500)


def _failed() -> ApiError:
    return ApiError("render_failed", cue_api.message("render_failed", stage_name=STAGE), 500)


def write_prefix(plate: Path, start: int, count: int, dest: Path, fps: float) -> None:
    """Write `count` frames of `plate`, beginning at `start`, as one H.264 file."""
    if start < 0:
        raise ValueError(f"frame {start} is outside the composite")
    frames: list[np.ndarray] = []
    reader = read_frames(plate)
    try:
        for number, frame in enumerate(reader):
            if number < start:
                continue
            if len(frames) == count:
                break
            frames.append(frame.copy())
    finally:
        reader.close()
    if len(frames) != count:
        raise ValueError(f"the composite does not have {count} frames from {start}")
    height, width = frames[0].shape[:2]
    with VideoWriter(dest, (width, height), fps, 18) as writer:
        for frame in frames:
            writer.write(frame)


class VideoStore:
    """Videos under `data/videos/<id>`. The MP4 is also written beside the composite."""

    def __init__(self, settings, standins, generations, queue: RenderQueue, render=render_video) -> None:
        self.settings = settings
        self.standins = standins
        self.generations = generations
        self.queue = queue
        self.render = render  # (guide, still, prefix, prompt, seed, output path) -> None
        self._lock = threading.RLock()

    def start(self, job_id: str, generation_id: str, prompt: str, seed: int | None) -> tuple[dict, int]:
        """Queue an LTX render of a finished still. (document, 200 if that render is already done, else 202)."""
        text = prompt.strip()
        if not text:
            raise invalid("prompt is empty")
        if seed is not None and (isinstance(seed, bool) or not isinstance(seed, int)):
            raise invalid("seed must be an integer")
        merge_dir = self._composite(job_id)
        still = self._still(generation_id, job_id)
        try:
            cue = _cue(merge_dir)
            window = effect_window(cue)
            used = _seed_of(cue, seed)
        except ValueError as exc:
            raise invalid(str(exc)) from exc
        if window.length < MIN_GUIDE_FRAMES or (window.length - 1) % 8:
            raise invalid(
                f"the effect window is {window.length} frames; the video render needs at least "
                f"{MIN_GUIDE_FRAMES} frames in steps of 8k+1"
            )
        try:
            _credentials()
        except VideoRenderError as exc:
            log.error("video cannot start: %s", exc)
            raise _lost() from exc
        guide, _name = self.standins.file(job_id, "layout.mp4", wait=False)
        plate = merge_dir / "final.mp4"
        video_id = hashlib.sha256(
            json.dumps([job_id, generation_id, text, used], separators=(",", ":"), ensure_ascii=False).encode()
        ).hexdigest()[:16]
        with self._lock:
            live = self.queue.get(video_id)
            if live is not None and not live.future.done():
                return self._document(video_id), 202
            saved = self._read(video_id)
            if saved and saved.get("status") == "done" and self._mp4(video_id).is_file():
                self._publish(merge_dir, self._mp4(video_id))
                return self._document(video_id), 200
            self._write(self._record(video_id, job_id, generation_id, text, used, "queued", None))
            self.queue.submit(
                video_id,
                lambda: self._run(video_id, merge_dir, guide, plate, still, window.start, cue.fps, text, used),
            )
            return self._document(video_id), 202

    def document(self, video_id: str) -> dict:
        with self._lock:
            return self._document(video_id)

    def open_video(self, video_id: str) -> Path:
        """The rendered MP4. 409 until the video is done."""
        doc = self.document(video_id)
        if doc["status"] != "done" or not doc["video"]:
            raise invalid(f"video {video_id} is {doc['status']}", 409)
        return self._mp4(video_id)

    def _still(self, generation_id: str, job_id: str) -> Path:
        try:
            still = self.generations.open_reference(generation_id)
        except ApiError as exc:
            if exc.status == 409:
                raise invalid(f"generation {generation_id} is not ready", 409) from exc
            raise
        if self.generations.document(generation_id).get("job_id") != job_id:
            raise invalid(f"generation {generation_id} is for another job", 409)
        return still

    def _composite(self, job_id: str) -> Path:
        try:
            path, _name = self.standins.file(job_id, "hardcomp.mp4", wait=False)
        except ApiError as exc:
            if exc.status != 404:
                raise
            try:
                state = self.standins.status(job_id)
            except ApiError:
                raise exc
            if state["status"] != "done":
                raise invalid(f"job {job_id} is {state['status']}", 409) from exc
            raise
        return path.parent

    def _run(self, video_id: str, merge_dir: Path, guide: Path, plate: Path, still: Path,
             start: int, fps: float, prompt: str, seed: int) -> None:
        started = time.perf_counter()
        folder = self._folder(video_id)
        prefix = folder / "prefix.mp4"
        partial = folder / "video.part.mp4"
        try:
            self._mark(video_id, "running")
            try:
                write_prefix(plate, start, PREFIX_FRAMES, prefix, fps)
            except VideoError as exc:
                raise ValueError(f"the composite cannot be read: {exc}") from exc
            self.render(guide, still, prefix, prompt, seed, partial)
            partial.replace(self._mp4(video_id))
            saved = self._record(video_id, self._read(video_id)["job_id"], self._read(video_id)["generation_id"],
                                 prompt, seed, "done", None)
            self._publish(merge_dir, self._mp4(video_id))
            self._write(saved)
            log.info("video %s rendered in %.1f s", video_id, time.perf_counter() - started)
        except Exception as exc:
            partial.unlink(missing_ok=True)
            err = self._as_api(video_id, exc)
            self._fail(video_id, err)
            if err is exc:
                raise
            raise err from exc

    def _as_api(self, video_id: str, exc: Exception) -> ApiError:
        if isinstance(exc, ApiError):
            return exc
        if isinstance(exc, VideoRenderError):
            log.error("video %s failed: %s", video_id, exc, exc_info=exc)
            return _lost() if exc.kind == "connection" else _failed()
        if isinstance(exc, ValueError):
            log.error("video %s failed: %s", video_id, exc)
            return invalid(str(exc))
        log.error("video %s failed", video_id, exc_info=exc)
        return internal()

    def _document(self, video_id: str) -> dict:
        saved = self._read(video_id)
        task = self.queue.get(video_id)
        if saved is None and task is None:
            raise not_found(f"unknown video {video_id!r}")
        saved = saved or {}
        if task is not None and not task.future.done():
            status, error = task.status, None
        elif task is not None and task.status == "failed":
            status = "failed"
            error = task.error.to_dict() if task.error else saved.get("error")
        elif task is None and saved.get("status") in ("queued", "running"):
            status, error = "failed", _lost().to_dict()
        else:
            status, error = saved.get("status", "failed"), saved.get("error")
        video = None
        if status == "done" and self._mp4(video_id).is_file():
            video = f"/api/v1/videos/{video_id}/file"
        return {"id": video_id, "job_id": saved.get("job_id"), "generation_id": saved.get("generation_id"),
                "status": status, "error": error, "video": video}

    def _publish(self, merge_dir: Path, mp4: Path) -> None:
        dest = merge_dir / "ltx.mp4"
        part = dest.with_name("ltx.part.mp4")
        shutil.copyfile(mp4, part)
        os.replace(part, dest)

    def _record(self, video_id: str, job_id: str, generation_id: str, prompt: str, seed: int, status: str,
                error: dict | None) -> dict:
        return {"id": video_id, "job_id": job_id, "generation_id": generation_id, "prompt": prompt,
                "seed": seed, "status": status, "error": error}

    def _mark(self, video_id: str, status: str) -> None:
        saved = self._read(video_id) or {"id": video_id}
        saved["status"] = status
        self._write(saved)

    def _fail(self, video_id: str, err: ApiError) -> None:
        saved = self._read(video_id) or {"id": video_id}
        saved["status"] = "failed"
        saved["error"] = err.to_dict()
        self._write(saved)

    def _folder(self, video_id: str) -> Path:
        if _ID.fullmatch(video_id) is None:
            raise not_found(f"unknown video {video_id!r}")
        return self.settings.videos_dir / video_id

    def _mp4(self, video_id: str) -> Path:
        return self._folder(video_id) / "video.mp4"

    def _read(self, video_id: str) -> dict | None:
        path = self._folder(video_id) / "video.json"
        delay = 0.01
        for attempt in range(8):
            if not path.is_file():
                return None
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except PermissionError:
                if attempt == 7:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 0.1)
        return None

    def _write(self, record: dict) -> None:
        _write_json(self._folder(record["id"]) / "video.json", record)
