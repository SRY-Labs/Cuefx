"""Send one still through the Qwen image-edit deployment and write the reference PNG.

The deployment and its key come from the environment, the same names the Comfy SDK reads:

    COMFY_BASE_URL   the deployment, https://….run.comfy.app
    COMFY_API_KEY    the workspace key

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
from comfy_sdk import Comfy
from comfy_sdk.exceptions import ComfyError

from generate.comfy_client import open_client

WORKFLOW_PATH = Path(__file__).resolve().parent / "workflows" / "CueFX_Image_Edit_API.json"

LOAD_IMAGE = "470"
PREVIEW = "501"
SAMPLER = "459:458"
PROMPT_NODE = "459:500"
SWITCH = "459:484"

# A listing answer that is not "unauthorized" still proves the key was accepted.
_LIST_REACHED = {"not_implemented", "public_deployment_no_list"}
CHECK_TIMEOUT_S = 30.0
RUN_HTTP_TIMEOUT_S = 300.0
JOB_TIMEOUT_S = 7200.0
_PNG = b"\x89PNG\r\n\x1a\n"

_EXPECTED = {
    LOAD_IMAGE: "LoadImage",
    PREVIEW: "PreviewImage",
    SAMPLER: "KSampler",
    PROMPT_NODE: "TextGenerate",
    SWITCH: "ComfySwitchNode",
}


class ImageEditError(Exception):
    """The image-edit deployment could not be used.

    `kind` is "connection" when the host or the key failed, and "job" when the
    workflow itself failed. The message is for the log; it does not contain the key.
    """

    def __init__(self, message: str, *, kind: str = "job") -> None:
        super().__init__(message)
        self.kind = kind


def workflow_graph() -> dict:
    """The API graph as shipped, placeholders and all."""
    return json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))


def fill_image_edit(reference: str, prompt: str, seed: int, graph: dict | None = None) -> dict:
    """A copy of the graph with the still name, the prompt, and the seed filled in.

    The switch stays on, so the prompt still goes through the text-generate node.
    `reference` is replaced with an uploaded asset before the graph is submitted.
    """
    filled = copy.deepcopy(workflow_graph() if graph is None else graph)
    for node_id, kind in _EXPECTED.items():
        node = filled.get(node_id, {})
        if node.get("class_type") != kind:
            raise ValueError(f"image-edit node {node_id} is not {kind}")
    filled[LOAD_IMAGE]["inputs"]["image"] = reference
    filled[PROMPT_NODE]["inputs"]["prompt"] = prompt
    filled[PROMPT_NODE]["inputs"]["sampling_mode.seed"] = seed
    filled[SAMPLER]["inputs"]["seed"] = seed
    filled[SWITCH]["inputs"]["on_false"] = prompt
    return filled


def _credentials() -> str:
    """The workspace key, after checking that a deployment URL is set.

    The SDK reads `COMFY_BASE_URL` itself. Checked here so a missing URL cannot
    fall through to Comfy Cloud.
    """
    base = os.environ.get("COMFY_BASE_URL", "").strip()
    key = os.environ.get("COMFY_API_KEY", "").strip()
    if not base.startswith(("http://", "https://")):
        raise ImageEditError("COMFY_BASE_URL must be an http(s) URL", kind="connection")
    if not key:
        raise ImageEditError("COMFY_API_KEY is not set", kind="connection")
    return key


def _connection_failure(exc: ComfyError) -> bool:
    return exc.http_status in (401, 403) or exc.code in {"unauthorized", "forbidden"}


def _client(timeout: float) -> Comfy:
    key = _credentials()
    base = os.environ.get("COMFY_BASE_URL", "").strip()
    return open_client(base, key, timeout)


def check_connection() -> None:
    """One authenticated request that does not submit the graph.

    Raises ImageEditError when the key is missing, the host is unreachable, or
    the deployment rejects the key. A cold GPU is not started.
    """
    with _client(CHECK_TIMEOUT_S) as client:
        try:
            next(iter(client.list_jobs(limit=1)), None)
        except ComfyError as exc:
            if exc.code in _LIST_REACHED:
                return
            raise ImageEditError(str(exc), kind="connection") from exc
        except (httpx.HTTPError, OSError) as exc:
            raise ImageEditError(f"Comfy deployment is unreachable: {exc}", kind="connection") from exc


def _write_preview(job, output_path: Path) -> None:
    found = job.get_outputs(PREVIEW)
    images = [item for item in found if item.type == "image"]
    chosen = images or list(found)
    if len(chosen) != 1:
        raise ImageEditError(f"image edit returned {len(chosen)} outputs from node {PREVIEW}", kind="job")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = chosen[0].to_file(output_path)
    with written.open("rb") as handle:
        header = handle.read(8)
    if header != _PNG:
        raise ImageEditError(f"image edit returned {chosen[0].content_type}, not a PNG", kind="job")


def edit_reference(image: Path, prompt: str, seed: int, output_path: Path) -> None:
    """Upload `image`, run the image-edit graph, and write one PNG to `output_path`."""
    text = prompt.strip()
    if not text:
        raise ImageEditError("prompt is empty", kind="job")
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise ImageEditError("seed must be an integer", kind="job")
    if not image.is_file():
        raise ImageEditError(f"reference image not found: {image}", kind="job")
    with _client(RUN_HTTP_TIMEOUT_S) as client:
        try:
            graph = fill_image_edit(image.name, text, seed)
            workflow = client.workflows.from_json(graph)
            workflow.set_input(LOAD_IMAGE, "image", client.assets.from_file(image))
            job = client.run(workflow, timeout=JOB_TIMEOUT_S)
            _write_preview(job, output_path)
        except ImageEditError:
            raise
        except TimeoutError as exc:
            raise ImageEditError(f"image edit timed out: {exc}", kind="job") from exc
        except ComfyError as exc:
            kind = "connection" if _connection_failure(exc) else "job"
            raise ImageEditError(str(exc), kind=kind) from exc
        except (httpx.HTTPError, OSError) as exc:
            raise ImageEditError(f"Comfy deployment is unreachable: {exc}", kind="connection") from exc


def main(argv: list[str] | None = None) -> int:
    """`check` authenticates. `run` submits the workflow for one still."""
    parser = argparse.ArgumentParser(prog="python -m generate.image_edit")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check", help="authenticate without submitting the workflow")
    run = commands.add_parser("run", help="edit one still on the deployment")
    run.add_argument("--image", type=Path, required=True)
    run.add_argument("--prompt", required=True)
    run.add_argument("--out", type=Path, required=True)
    run.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            check_connection()
            print("comfy image-edit: ok")
        else:
            edit_reference(args.image, args.prompt, args.seed, args.out)
            print(args.out)
    except ImageEditError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
