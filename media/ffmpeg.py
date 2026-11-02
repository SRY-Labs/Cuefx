"""ffmpeg on PATH, and the error every ffmpeg caller shares.

`VideoError` (`media.video`) and `ConformError` (`clips.conform`) are kinds of `LayoutError`.
"""
from __future__ import annotations

import shutil
from pathlib import Path


class LayoutError(RuntimeError):
    """A problem making or reading video with ffmpeg (no ffmpeg, encoder failure, wrong frame count)."""


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe is None:
        raise LayoutError("ffmpeg is not on PATH; it is needed to read and write video")
    return exe


def find_ffprobe() -> str:
    """ffprobe beside the ffmpeg that is on PATH, or `ffprobe` itself."""
    exe = find_ffmpeg()
    probe = Path(exe).with_name("ffprobe" + Path(exe).suffix)
    return str(probe) if probe.exists() else "ffprobe"


SWS_ACCURATE = ["-sws_flags", "accurate_rnd+full_chroma_int+bitexact"]  # ffmpeg's default RGB->YUV darkens grey 128 to ~124
