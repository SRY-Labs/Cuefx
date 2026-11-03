"""Open a Comfy client for one deployment URL.

The SDK reads ``COMFY_BASE_URL`` when the client is constructed and has no
base-url argument. Image edit and video render construct under one lock, so
each client keeps the URL it was given.
"""
from __future__ import annotations

import os
import threading

from comfy_sdk import Comfy

_LOCK = threading.Lock()


def open_client(base_url: str, api_key: str, timeout: float) -> Comfy:
    """A client for `base_url`. The key is passed through and never logged.

    Raises ValueError when the URL is not http(s) or the key is blank, so a
    missing video URL cannot fall through to Comfy Cloud.
    """
    url = base_url.strip()
    key = api_key.strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError("Comfy base URL must be an http(s) URL")
    if not key:
        raise ValueError("Comfy API key is not set")
    with _LOCK:
        previous = os.environ.get("COMFY_BASE_URL")
        os.environ["COMFY_BASE_URL"] = url
        try:
            return Comfy(api_key=key, timeout=timeout, client_info="cuefx")
        finally:
            if previous is None:
                os.environ.pop("COMFY_BASE_URL", None)
            else:
                os.environ["COMFY_BASE_URL"] = previous
