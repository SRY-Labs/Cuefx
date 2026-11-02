"""Health and the editor defaults."""
from __future__ import annotations

import json
from functools import cache

from fastapi import APIRouter

from cue import api
from errors import ApiError
from media.ffmpeg import LayoutError, find_ffmpeg, find_ffprobe

router = APIRouter()

VERSION = "2.0.0"


@cache
def contract_version() -> str:
    return json.loads((api.SCHEMA_DIR / "error_codes.json").read_text(encoding="utf-8"))["contract_version"]


@router.get("/health")
def health() -> dict:
    try:
        find_ffmpeg()
        find_ffprobe()
    except LayoutError as exc:
        raise ApiError("internal", str(exc), 500) from exc
    return {"status": "ok", "version": VERSION, "contract_version": contract_version()}


@router.get("/defaults")
def defaults() -> dict:
    return api.defaults()
