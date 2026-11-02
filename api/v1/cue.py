"""The edit loop. The client keeps the cue and sends it back."""
from __future__ import annotations

from fastapi import APIRouter

from api.v1.models import CueBody
from cue import api
from cue.wire import api_track, cue_in, cue_out

router = APIRouter()


@router.post("/cue/normalize")
def normalize(body: CueBody) -> dict:
    cue, warnings = api.normalize_with_warnings(cue_in(body.cue))
    return {"cue": cue_out(cue), "warnings": warnings}


@router.post("/cue/validate")
def validate(body: CueBody) -> dict:
    cue = cue_in(body.cue)
    return {"warnings": api.validate(cue), "effect_range": api.computed_effect_range(cue)}


@router.post("/cue/preview")
def preview(body: CueBody) -> dict:
    cue = cue_in(body.cue)
    return {"frames": api.preview_path(cue, api_track(cue), with_held=True)}


@router.post("/cue/timing")
def timing(body: CueBody) -> dict:
    cue = cue_in(body.cue)
    return {"cue": cue_out(api.propose_timing(cue, api_track(cue)))}
