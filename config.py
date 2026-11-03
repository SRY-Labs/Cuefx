"""Server settings, read from CUEFX_* environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ALLOWED_EXTENSIONS = (".mov", ".mp4", ".mkv", ".webm")


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
    max_upload_mb: int = 500
    look_image: Path | None = None  # None: <data>/look/standin_orb.png

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def standin_dir(self) -> Path:
        return self.data_dir / "standin"

    @property
    def generations_dir(self) -> Path:
        return self.data_dir / "generations"

    @property
    def look_path(self) -> Path:
        return self.look_image or self.data_dir / "look" / "standin_orb.png"


def _path(value: str | None) -> Path | None:
    return Path(value).resolve() if value else None


def from_env(env: dict[str, str] | None = None) -> Settings:
    """Settings from CUEFX_* variables (`env` defaults to os.environ). Unset or empty means the default."""
    env = os.environ if env is None else env

    def get(key: str, default: str) -> str:
        return env.get(key) or default

    return Settings(
        data_dir=Path(get("CUEFX_DATA_DIR", "data")).resolve(),
        host=get("CUEFX_HOST", "127.0.0.1"),
        port=int(get("CUEFX_PORT", "8000")),
        cors_origins=tuple(o.strip() for o in get("CUEFX_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()),
        max_upload_mb=int(get("CUEFX_MAX_UPLOAD_MB", "500")),
        look_image=_path(env.get("CUEFX_LOOK_IMAGE")),
    )
