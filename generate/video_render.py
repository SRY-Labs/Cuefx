"""Send one guide video and a reference still through the LTX reverse deployment.

The deployment and its key come from the environment:

    COMFY_VIDEO_BASE_URL   the video deployment, https://….run.comfy.app
    COMFY_VIDEO_API_KEY    the key for that deployment

The guide, the reference still, and the prefix video are uploaded. The prefix
video is unpacked in the graph by GetVideoComponents.

Nothing in this module has a default URL, and the key is never logged.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys
from pathlib import Path

import httpx
from comfy_sdk.exceptions import ComfyError

from generate.comfy_client import open_client

WORKFLOW_PATH = Path(__file__).resolve().parent / "workflows" / "LTX_FINAL.json"

LOAD_VIDEO = "5001"
LOAD_IMAGE = "9009"
PROMPT = "5508"
NEGATIVE = "5509"
SEED_STAGE1 = "5516_4832"
SEED_STAGE2 = "9034_9031"
PREFIX_VIDEO = "80004"
PREFIX_FRAMES = "80005"
FIX_STAGE1 = "80002"
FIX_STAGE2 = "80003"
SAVE = "4852"

DEFAULT_FIRST_EMPTY_CELL = 5

# A listing answer that is not "unauthorized" still proves the key was accepted.
_LIST_REACHED = {"not_implemented", "public_deployment_no_list"}
CHECK_TIMEOUT_S = 30.0
RUN_HTTP_TIMEOUT_S = 300.0
JOB_TIMEOUT_S = 7200.0
_FTYP = b"ftyp"

_EXPECTED = {
    LOAD_VIDEO: "LoadVideo",
    LOAD_IMAGE: "LoadImage",
    PROMPT: "PrimitiveStringMultiline",
    NEGATIVE: "PrimitiveStringMultiline",
    SEED_STAGE1: "RandomNoise",
    SEED_STAGE2: "RandomNoise",
    PREFIX_VIDEO: "LoadVideo",
    PREFIX_FRAMES: "GetVideoComponents",
    FIX_STAGE1: "CueFXFixTemporalContext",
    FIX_STAGE2: "CueFXFixTemporalContext",
    SAVE: "SaveVideo",
}


class VideoRenderError(Exception):
    """The video deployment could not be used.

    `kind` is "connection" when the host or the key failed, and "job" when the
    workflow itself failed. The message is for the log; it does not contain the key.
    """

    def __init__(self, message: str, *, kind: str = "job") -> None:
        super().__init__(message)
        self.kind = kind


def workflow_graph() -> dict:
    """The API graph as shipped, placeholders and all."""
    return json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))


def fill_video_render(
    guide: str,
    reference: str,
    prefix: str,
    prompt: str,
    seed: int,
    *,
    negative: str = "",
    first_empty_cell: int = DEFAULT_FIRST_EMPTY_CELL,
    graph: dict | None = None,
) -> dict:
    """A copy of the graph with the guide, the still, the prefix video, the prompt, and the seed filled in.

    Both noise nodes receive `seed`. Both temporal-fix nodes receive `first_empty_cell`.
    `guide`, `reference`, and `prefix` are replaced with uploaded assets before the graph is submitted.
    The key switch is left empty, so conditioning stays on the local CLIP path.
    """
    filled = copy.deepcopy(workflow_graph() if graph is None else graph)
    for node_id, kind in _EXPECTED.items():
        node = filled.get(node_id, {})
        if node.get("class_type") != kind:
            raise ValueError(f"video-render node {node_id} is not {kind}")
    filled[LOAD_VIDEO]["inputs"]["file"] = guide
    filled[LOAD_IMAGE]["inputs"]["image"] = reference
    filled[PREFIX_VIDEO]["inputs"]["file"] = prefix
    filled[PROMPT]["inputs"]["value"] = prompt
    filled[NEGATIVE]["inputs"]["value"] = negative
    filled[SEED_STAGE1]["inputs"]["noise_seed"] = seed
    filled[SEED_STAGE2]["inputs"]["noise_seed"] = seed
    filled[FIX_STAGE1]["inputs"]["first_empty_cell"] = first_empty_cell
    filled[FIX_STAGE2]["inputs"]["first_empty_cell"] = first_empty_cell
    return filled


def _credentials() -> tuple[str, str]:
    """`(video deployment URL, video deployment key)`.

    The SDK reads `COMFY_BASE_URL` itself. The helper sets that for this URL
    only while the client is constructed. Image edit keeps `COMFY_API_KEY`.
    """
    base = os.environ.get("COMFY_VIDEO_BASE_URL", "").strip()
    key = os.environ.get("COMFY_VIDEO_API_KEY", "").strip()
    if not base.startswith(("http://", "https://")):
        raise VideoRenderError("COMFY_VIDEO_BASE_URL must be an http(s) URL", kind="connection")
    if not key:
        raise VideoRenderError("COMFY_VIDEO_API_KEY is not set", kind="connection")
    return base, key


def _connection_failure(exc: ComfyError) -> bool:
    return exc.http_status in (401, 403) or exc.code in {"unauthorized", "forbidden"}


def _client(timeout: float):
    base, key = _credentials()
    return open_client(base, key, timeout)


def check_connection() -> None:
    """One authenticated request that does not submit the graph.

    Raises VideoRenderError when the key is missing, the host is unreachable, or
    the deployment rejects the key. A cold GPU is not started.
    """
    with _client(CHECK_TIMEOUT_S) as client:
        try:
            next(iter(client.list_jobs(limit=1)), None)
        except ComfyError as exc:
            if exc.code in _LIST_REACHED:
                return
            raise VideoRenderError(str(exc), kind="connection") from exc
        except (httpx.HTTPError, OSError) as exc:
            raise VideoRenderError(f"Comfy deployment is unreachable: {exc}", kind="connection") from exc


def _count(value: int, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise VideoRenderError(f"{label} must be an integer of at least 1", kind="job")
    return value


def _write_video(job, output_path: Path) -> None:
    found = job.get_outputs(SAVE)
    videos = [item for item in found if item.type == "video"]
    chosen = videos or list(found)
    if len(chosen) != 1:
        raise VideoRenderError(f"video render returned {len(chosen)} outputs from node {SAVE}", kind="job")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = chosen[0].to_file(output_path)
    with written.open("rb") as handle:
        header = handle.read(12)
    if len(header) < 8 or header[4:8] != _FTYP:
        raise VideoRenderError(f"video render returned {chosen[0].content_type}, not an MP4", kind="job")


def render_video(
    video: Path,
    image: Path,
    prefix: Path,
    prompt: str,
    seed: int,
    output_path: Path,
    *,
    negative: str = "",
    first_empty_cell: int = DEFAULT_FIRST_EMPTY_CELL,
) -> None:
    """Upload `video`, `image`, and `prefix`, run the LTX graph, and write one MP4 to `output_path`."""
    text = prompt.strip()
    if not text:
        raise VideoRenderError("prompt is empty", kind="job")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise VideoRenderError("seed must be an integer", kind="job")
    if not video.is_file():
        raise VideoRenderError(f"guide video not found: {video}", kind="job")
    if not image.is_file():
        raise VideoRenderError(f"reference image not found: {image}", kind="job")
    if not prefix.is_file():
        raise VideoRenderError(f"prefix video not found: {prefix}", kind="job")
    empty_cell = _count(first_empty_cell, "first empty cell")
    with _client(RUN_HTTP_TIMEOUT_S) as client:
        try:
            graph = fill_video_render(
                video.name, image.name, prefix.name, text, seed,
                negative=negative.strip(), first_empty_cell=empty_cell,
            )
            workflow = client.workflows.from_json(graph)
            workflow.set_input(LOAD_VIDEO, "file", client.assets.from_file(video))
            workflow.set_input(LOAD_IMAGE, "image", client.assets.from_file(image))
            workflow.set_input(PREFIX_VIDEO, "file", client.assets.from_file(prefix))
            job = client.run(workflow, timeout=JOB_TIMEOUT_S)
            _write_video(job, output_path)
        except VideoRenderError:
            raise
        except TimeoutError as exc:
            raise VideoRenderError(f"video render timed out: {exc}", kind="job") from exc
        except ComfyError as exc:
            kind = "connection" if _connection_failure(exc) else "job"
            raise VideoRenderError(str(exc), kind=kind) from exc
        except (httpx.HTTPError, OSError) as exc:
            raise VideoRenderError(f"Comfy deployment is unreachable: {exc}", kind="connection") from exc


def main(argv: list[str] | None = None) -> int:
    """`check` authenticates. `run` submits the workflow for one guide video."""
    parser = argparse.ArgumentParser(prog="python -m generate.video_render")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check", help="authenticate without submitting the workflow")
    run = commands.add_parser("run", help="render one guide video on the deployment")
    run.add_argument("--video", type=Path, required=True)
    run.add_argument("--image", type=Path, required=True)
    run.add_argument("--prefix", type=Path, required=True)
    run.add_argument("--prompt", required=True)
    run.add_argument("--out", type=Path, required=True)
    run.add_argument("--seed", type=int, default=42)
    run.add_argument("--negative", default="")
    run.add_argument("--first-empty-cell", type=int, default=DEFAULT_FIRST_EMPTY_CELL)
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            check_connection()
            print("comfy video-render: ok")
        else:
            render_video(
                args.video, args.image, args.prefix, args.prompt, args.seed, args.out,
                negative=args.negative, first_empty_cell=args.first_empty_cell,
            )
            print(args.out)
    except VideoRenderError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
