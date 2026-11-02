"""The element video: the effect alone on black, at plate size, one frame per plate frame.

Built from the core and glow layers Merge exports. Frames without layers are black.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

import cv2
import numpy as np

from media.colour import encode8, srgb_to_linear


def element_from_layers(core16: np.ndarray, glow16: np.ndarray) -> np.ndarray:
    """One element frame (8-bit BGR, sRGB) from Merge's 16-bit BGRA core and glow layers.

    The sum of their colours in linear light. The colours are the light itself, so alpha is not used.
    """
    lin = srgb_to_linear(core16[..., :3] / 65535.0) + srgb_to_linear(glow16[..., :3] / 65535.0)
    return encode8(lin)


def layer_pair(layers_dir: Path, frame: int) -> tuple[np.ndarray, np.ndarray] | None:
    """(core, glow) 16-bit BGRA layers of plate frame `frame`, or None when Merge exported none."""
    core = layers_dir / "core" / f"core_{frame:04d}.png"
    glow = layers_dir / "glow" / f"glow_{frame:04d}.png"
    if not core.exists() or not glow.exists():
        return None
    return cv2.imread(str(core), cv2.IMREAD_UNCHANGED), cv2.imread(str(glow), cv2.IMREAD_UNCHANGED)


def element_frames(layers_dir: Path, frames: int, plate_size: tuple[int, int]) -> Iterator[tuple[int, np.ndarray]]:
    """(frame, element frame) for every plate frame; black where there are no layers."""
    width, height = plate_size
    black = np.zeros((height, width, 3), np.uint8)
    for frame in range(frames):
        pair = layer_pair(layers_dir, frame)
        yield frame, (black if pair is None else element_from_layers(*pair))
