"""Reference-frame generation, separate from the stand-in composite."""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse

from api.v1.models import GenerationIn

router = APIRouter()
log = logging.getLogger("cuefx.server")


def _generations(request: Request):
    return request.app.state.generations


@router.post("/generations")
def create_generation(body: GenerationIn, request: Request) -> JSONResponse:
    started = time.perf_counter()
    document, status = _generations(request).start(body.job_id, body.prompt, body.seed)
    log.info("%s %s -> generation %s %s in %.1f s", request.method, request.url.path, document["id"],
             "already done" if status == 200 else "queued", time.perf_counter() - started)
    return JSONResponse(document, status_code=status)


@router.get("/generations/{generation_id}")
def get_generation(generation_id: str, request: Request) -> dict:
    return _generations(request).document(generation_id)


@router.get("/generations/{generation_id}/reference")
def reference_image(generation_id: str, request: Request) -> FileResponse:
    path = _generations(request).open_reference(generation_id)
    return FileResponse(path, media_type="image/png", filename="reference.png",
                        content_disposition_type="inline")
