"""LTX video renders, after a reference still."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse

from api.v1.models import VideoIn

router = APIRouter()
log = logging.getLogger("cuefx.server")


def _videos(request: Request):
    return request.app.state.videos


@router.post("/jobs/{job_id}/video")
def create_video(job_id: str, body: VideoIn, request: Request) -> JSONResponse:
    started = time.perf_counter()
    document, status = _videos(request).start(job_id, body.generation_id, body.prompt, body.seed)
    log.info("%s %s -> video %s %s in %.1f s", request.method, request.url.path, document["id"],
             "already done" if status == 200 else "queued", time.perf_counter() - started)
    return JSONResponse(document, status_code=status)


@router.get("/videos/{video_id}")
def get_video(video_id: str, request: Request) -> dict:
    return _videos(request).document(video_id)


@router.get("/videos/{video_id}/file")
def video_file(video_id: str, request: Request, download: bool = False) -> FileResponse:
    path = _videos(request).open_video(video_id)
    inline = not download
    return FileResponse(path, media_type="video/mp4", filename=None if inline else "ltx.mp4",
                        content_disposition_type="inline" if inline else "attachment")
