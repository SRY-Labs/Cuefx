"""The cue document on the wire uses one track shape.

Inside the engine a track point is still {f, x, y, source, palm_w, conf, lost}. Callers convert at the boundary.
"""
from __future__ import annotations

import copy

from errors import invalid


def track_in(points: list[dict]) -> list[dict]:
    """API track entries to the engine's cue-file entries."""
    out = []
    for point in points:
        if "frame" not in point or "confidence" not in point:
            raise invalid("a track entry needs frame, x, y, confidence, uncertain, source and palm_w")
        out.append({
            "f": point["frame"],
            "x": point["x"],
            "y": point["y"],
            "source": point.get("source", "tracked"),
            "palm_w": point.get("palm_w", 0.0),
            "conf": point["confidence"],
            "lost": bool(point.get("uncertain", False)),
        })
    return out


def track_out(points: list[dict]) -> list[dict]:
    """Engine track entries to the API shape."""
    return [{
        "frame": point["f"],
        "x": point["x"],
        "y": point["y"],
        "confidence": point["conf"],
        "uncertain": bool(point.get("lost", False)),
        "source": point["source"],
        "palm_w": point["palm_w"],
    } for point in points]


def cue_in(cue: dict) -> dict:
    """A client cue, with its track in the engine's form."""
    out = copy.deepcopy(cue)
    if "track" in out and out["track"] is not None:
        out["track"] = track_in(out["track"])
    return out


def cue_out(cue: dict) -> dict:
    """An engine cue, with its track in the API form."""
    out = copy.deepcopy(cue)
    if out.get("track"):
        out["track"] = track_out(out["track"])
    return out


def api_track(cue: dict) -> list[dict]:
    """The API track of an engine cue dict (the form preview and timing take beside the cue)."""
    return track_out(cue.get("track") or [])
