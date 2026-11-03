"""The first effect frame of a finished composite, edited into the reference still."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Callable

import cv2

from cue.model import Cue, cue_from_dict, entrance_start
from generate.image_edit import edit_reference
from media.video import VideoError, read_frames


def effect_frame(cue: Cue) -> int:
    """The first frame the effect is on the plate.

    That is the entrance start, which is `appear_frame` when the entrance is off.
    """
    if cue.appear_frame is None:
        raise ValueError("the cue has no appear_frame")
    return entrance_start(cue)


def extract_frame(video: Path, index: int, dest: Path) -> None:
    """Write frame `index` of `video` as a PNG. Frames are counted from 0."""
    if index < 0:
        raise ValueError(f"frame {index} is outside the composite")
    frames = read_frames(video)
    try:
        for number, frame in enumerate(frames):
            if number != index:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not cv2.imwrite(str(dest), frame):
                raise OSError(f"could not write {dest}")
            return
    finally:
        frames.close()
    raise ValueError(f"frame {index} is outside the composite")


def _seed_of(cue: Cue, seed: int | None) -> int:
    if seed is not None:
        return seed
    if cue.seed is None:
        return 42
    if isinstance(cue.seed, bool) or not isinstance(cue.seed, int):
        raise ValueError("the cue seed is not an integer")
    return cue.seed


def _cue(merge_dir: Path) -> Cue:
    path = merge_dir / "cue.json"
    if not path.is_file():
        raise ValueError("the composite has no cue")
    try:
        return cue_from_dict(json.loads(path.read_text(encoding="utf-8")))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"the composite cue cannot be read: {exc}") from exc


def reference_inputs(merge_dir: Path, prompt: str, seed: int | None) -> tuple[str, int, int]:
    """`(prompt, seed, source frame)` for this composite.

    Raises ValueError when the prompt is empty or the cue cannot supply a frame.
    """
    text = prompt.strip()
    if not text:
        raise ValueError("prompt is empty")
    cue = _cue(merge_dir)
    return text, _seed_of(cue, seed), effect_frame(cue)


def build_reference(merge_dir: Path, prompt: str, seed: int | None, output: Path,
                    edit: Callable[[Path, str, int, Path], None] = edit_reference) -> dict:
    """Edit the composite's first effect frame into `output`.

    Returns the source frame, the prompt, and the seed that were used. The source
    still is removed; `output` is the edited PNG.
    """
    text, used, frame = reference_inputs(merge_dir, prompt, seed)
    plate = merge_dir / "final.mp4"
    if not plate.is_file():
        raise ValueError("the composite has no video")
    descriptor, name = tempfile.mkstemp(prefix="source.", suffix=".png", dir=merge_dir)
    os.close(descriptor)
    source = Path(name)
    try:
        try:
            extract_frame(plate, frame, source)
        except VideoError as exc:
            raise ValueError(f"the composite cannot be read: {exc}") from exc
        edit(source, text, used, output)
    finally:
        source.unlink(missing_ok=True)
    return {"source_frame": frame, "prompt": text, "seed": used}
