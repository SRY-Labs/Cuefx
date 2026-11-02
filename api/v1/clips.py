"""Clips, plate frames, analysis, and the starter cue."""
from __future__ import annotations

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response

from api.v1.models import AnalyzeIn
from cue import api
from cue.wire import cue_out
from errors import invalid

router = APIRouter()


def _store(request: Request):
    return request.app.state.store


def _seed(body: AnalyzeIn) -> dict | None:
    seed = body.hand_seed
    if seed is None:
        return None
    return {"frame": seed.frame, "x": float(seed.x), "y": float(seed.y)}


def _body_point(body: AnalyzeIn):
    return api.parse_body_point(None if body.body_point is None else body.body_point.model_dump(), body.hand)


def clip_public(store, info: dict) -> dict:
    return {
        "clip_id": info["clip_id"],
        "filename": info["clip"],
        "fps": info["fps"],
        "frames": info["frames"],
        "plate_size": info["plate_size"],
        "transform": store.transform(info["clip_id"]),
    }


@router.get("/clips")
def list_clips(request: Request) -> list[dict]:
    store = _store(request)
    return [clip_public(store, info) for info in store.list()]


@router.post("/clips")
def upload_clip(file: UploadFile, request: Request) -> JSONResponse:
    store = _store(request)
    settings = request.app.state.settings
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes + (1 << 20):
        raise invalid(f"the file is larger than {settings.max_upload_mb} MB", 413)
    info, created = store.upload(file.filename or "", file.file)
    store.warm_frames(info["clip_id"])
    return JSONResponse(clip_public(store, info), status_code=201 if created else 200)


@router.get("/clips/{clip_id}")
def get_clip(clip_id: str, request: Request) -> dict:
    store = _store(request)
    return clip_public(store, store.info(clip_id))


@router.get("/clips/{clip_id}/video")
def clip_video(clip_id: str, request: Request) -> FileResponse:
    store = _store(request)
    proxy = store.proxy(clip_id)
    store.warm_frames(clip_id)
    return FileResponse(proxy, media_type="video/mp4",
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/clips/{clip_id}/frames/{frame}")
def clip_frame(clip_id: str, frame: int, request: Request) -> Response:
    store = _store(request)
    return Response(store.frame_jpeg(clip_id, frame), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.post("/clips/{clip_id}/analysis")
def analyze(clip_id: str, body: AnalyzeIn, request: Request) -> dict:
    return _store(request).analyze(clip_id, body.hand, _seed(body), _body_point(body))


@router.post("/clips/{clip_id}/cue")
def new_cue(clip_id: str, body: AnalyzeIn, request: Request) -> dict:
    store = _store(request)
    seed, body_point = _seed(body), _body_point(body)
    result, info = store.analyze(clip_id, body.hand, seed, body_point), store.info(clip_id)
    cue_seed = seed or result["body_point_seed"]
    asked = None if body.body_point is None else body.body_point.model_dump()
    cue, warnings = api.new_cue_with_warnings(
        info["clip"], info["fps"], info["frames"], info["plate_size"], body.hand,
        {"f": cue_seed["frame"], "x": cue_seed["x"], "y": cue_seed["y"]}, result["track"],
        store.transform(clip_id), result.get("body_point", asked))
    warnings = [w for w in result["warnings"] if w["code"] == "side_from_click"] + warnings
    return {"cue": cue_out(cue), "warnings": warnings, "summary": result["summary"],
            "hand_size_px": result["hand_size_px"]}
