"""Queue one reference-frame generation at a time, apart from the stand-in render queue."""
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

from cue import api as cue_api
from errors import ApiError, internal, invalid, not_found
from generate.image_edit import ImageEditError, _credentials, edit_reference
from generate.reference import build_reference, reference_inputs
from render.jobs import _write_json
from render.queue import RenderQueue

log = logging.getLogger("cuefx.server")

STAGE = "Building reference frame"
_ID = re.compile(r"^[0-9a-f]{16}$")


def _lost() -> ApiError:
    return ApiError("server_lost", cue_api.message("server_lost"), 500)


def _failed() -> ApiError:
    return ApiError("render_failed", cue_api.message("render_failed", stage_name=STAGE), 500)


class GenerationStore:
    """Generations under `data/generations/<id>`. The edited still is also written beside the composite."""

    def __init__(self, settings, standins, queue: RenderQueue, edit=edit_reference) -> None:
        self.settings = settings
        self.standins = standins
        self.queue = queue
        self.edit = edit  # (image, prompt, seed, output path) -> None; tests stand in for the deployment
        self._lock = threading.RLock()

    def start(self, job_id: str, prompt: str, seed: int | None) -> tuple[dict, int]:
        """Queue a reference edit of a finished composite. (document, 200 if that edit is already done, else 202)."""
        if not prompt.strip():
            raise invalid("prompt is empty")
        merge_dir = self._composite(job_id)
        try:
            text, used, frame = reference_inputs(merge_dir, prompt, seed)
        except ValueError as exc:
            raise invalid(str(exc)) from exc
        try:
            _credentials()
        except ImageEditError as exc:
            log.error("generation cannot start: %s", exc)
            raise _lost() from exc
        gen_id = hashlib.sha256(
            json.dumps([job_id, text, used], separators=(",", ":"), ensure_ascii=False).encode()
        ).hexdigest()[:16]
        with self._lock:
            live = self.queue.get(gen_id)
            if live is not None and not live.future.done():
                return self._document(gen_id), 202
            saved = self._read(gen_id)
            if saved and saved.get("status") == "done" and self._png(gen_id).is_file():
                self._publish(merge_dir, self._png(gen_id), saved)
                return self._document(gen_id), 200
            self._write(self._record(gen_id, job_id, text, used, frame, "queued", None))
            self.queue.submit(gen_id, lambda: self._run(gen_id, merge_dir, text, used))
            return self._document(gen_id), 202

    def document(self, gen_id: str) -> dict:
        with self._lock:
            return self._document(gen_id)

    def open_reference(self, gen_id: str) -> Path:
        """The edited PNG. 409 until the generation is done."""
        doc = self.document(gen_id)
        if doc["status"] != "done" or not doc["reference"]:
            raise invalid(f"generation {gen_id} is {doc['status']}", 409)
        return self._png(gen_id)

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

    def _run(self, gen_id: str, merge_dir: Path, prompt: str, seed: int) -> None:
        started = time.perf_counter()
        partial = self._folder(gen_id) / "reference.part.png"
        try:
            self._mark(gen_id, "running")
            record = build_reference(merge_dir, prompt, seed, partial, self.edit)
            partial.replace(self._png(gen_id))
            saved = self._record(gen_id, self._read(gen_id)["job_id"], record["prompt"], record["seed"],
                                 record["source_frame"], "done", None)
            self._publish(merge_dir, self._png(gen_id), saved)
            self._write(saved)
            log.info("generation %s reference frame %s in %.1f s", gen_id, record["source_frame"],
                     time.perf_counter() - started)
        except Exception as exc:
            partial.unlink(missing_ok=True)
            err = self._as_api(gen_id, exc)
            self._fail(gen_id, err)
            if err is exc:
                raise
            raise err from exc

    def _as_api(self, gen_id: str, exc: Exception) -> ApiError:
        if isinstance(exc, ApiError):
            return exc
        if isinstance(exc, ImageEditError):
            log.error("generation %s failed: %s", gen_id, exc, exc_info=exc)
            return _lost() if exc.kind == "connection" else _failed()
        if isinstance(exc, ValueError):
            log.error("generation %s failed: %s", gen_id, exc)
            return invalid(str(exc))
        log.error("generation %s failed", gen_id, exc_info=exc)
        return internal()

    def _document(self, gen_id: str) -> dict:
        saved = self._read(gen_id)
        task = self.queue.get(gen_id)
        if saved is None and task is None:
            raise not_found(f"unknown generation {gen_id!r}")
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
        reference = None
        if status == "done" and self._png(gen_id).is_file():
            reference = f"/api/v1/generations/{gen_id}/reference"
        return {"id": gen_id, "job_id": saved.get("job_id"), "status": status,
                "source_frame": saved.get("source_frame"), "seed": saved.get("seed"),
                "error": error, "reference": reference}

    def _publish(self, merge_dir: Path, png: Path, saved: dict) -> None:
        """Copy the edited still beside the composite and record the source frame next to it."""
        dest = merge_dir / "reference.png"
        part = dest.with_name("reference.part.png")
        shutil.copyfile(png, part)
        os.replace(part, dest)
        _write_json(merge_dir / "reference.json", {
            "generation_id": saved["id"], "source_frame": saved["source_frame"],
            "prompt": saved["prompt"], "seed": saved["seed"],
        })

    def _record(self, gen_id: str, job_id: str, prompt: str, seed: int, frame: int, status: str,
                error: dict | None) -> dict:
        return {"id": gen_id, "job_id": job_id, "prompt": prompt, "seed": seed, "source_frame": frame,
                "status": status, "error": error}

    def _mark(self, gen_id: str, status: str) -> None:
        saved = self._read(gen_id) or {"id": gen_id}
        saved["status"] = status
        self._write(saved)

    def _fail(self, gen_id: str, err: ApiError) -> None:
        saved = self._read(gen_id) or {"id": gen_id}
        saved["status"] = "failed"
        saved["error"] = err.to_dict()
        self._write(saved)

    def _folder(self, gen_id: str) -> Path:
        if _ID.fullmatch(gen_id) is None:
            raise not_found(f"unknown generation {gen_id!r}")
        return self.settings.generations_dir / gen_id

    def _png(self, gen_id: str) -> Path:
        return self._folder(gen_id) / "reference.png"

    def _read(self, gen_id: str) -> dict | None:
        """The generation record. Windows can refuse the file for a moment after it is replaced."""
        path = self._folder(gen_id) / "generation.json"
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
        _write_json(self._folder(record["id"]) / "generation.json", record)
