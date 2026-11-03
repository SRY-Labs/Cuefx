"""Request bodies for /api/v1. Unknown keys are refused."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class SeedIn(BaseModel):
    """The artist's click, in plate pixels."""
    model_config = ConfigDict(extra="forbid")
    frame: int
    x: float
    y: float


class BodyPointIn(BaseModel):
    """What the effect follows. The values are checked by the engine."""
    model_config = ConfigDict(extra="forbid")
    part: str
    side: str | None = None


class AnalyzeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hand: Literal["right", "left"]
    hand_seed: SeedIn | None = None
    body_point: BodyPointIn | None = None


class CueBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cue: dict[str, Any]


class JobIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clip_id: str
    cue: dict[str, Any]


class GenerationIn(BaseModel):
    """A finished stand-in job and the prompt for its reference frame."""
    model_config = ConfigDict(extra="forbid")
    job_id: str
    prompt: str
    seed: int | None = None


class VideoIn(BaseModel):
    """A finished reference still and the prompt for the LTX video."""
    model_config = ConfigDict(extra="forbid")
    generation_id: str
    prompt: str
    seed: int | None = None
