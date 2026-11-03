"""CueFX v2 FastAPI server. Routes live under /api/v1; the packages do the work."""
from __future__ import annotations

import logging
import sys
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
from api.v1 import clips, cue, generations, jobs, system, videos
from clips.store import ClipStore
from errors import ApiError, from_cuefx, internal, invalid, not_found
from cue import api
from generate.store import GenerationStore
from generate.video_store import VideoStore
from render.jobs import StandinStore
from render.queue import RenderQueue

log = logging.getLogger("cuefx.server")


def configure_logging() -> None:
    """Send `cuefx.server` INFO to stdout.

    The container starts `uvicorn app:create_app --factory`, which never runs `main`. Uvicorn
    configures its own loggers and leaves the root logger without a handler, so INFO from this
    logger would be dropped. A root handler (from `main`) is left to do the writing instead.
    """
    logger = logging.getLogger("cuefx.server")
    logger.setLevel(logging.INFO)
    if logger.handlers or logging.getLogger().handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    logger.addHandler(handler)
    logger.propagate = False


class RequestStarted:
    """Remember when the request began, so a failure line can include how long it ran.

    A pure ASGI wrapper: BaseHTTPMiddleware buffers the body and breaks file responses.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            scope.setdefault("state", {})["started"] = time.perf_counter()
        await self.app(scope, receive, send)


def _seconds(request: Request) -> float:
    started = request.scope.get("state", {}).get("started")
    return time.perf_counter() - started if isinstance(started, float) else 0.0


def _log_handled(request: Request, exc: ApiError) -> None:
    """The contract error the client receives. Uvicorn's access line has the status and nothing else."""
    text = "%s %s -> %s %s in %.1f s: %s"
    args = (request.method, request.url.path, exc.status, exc.code, _seconds(request), exc.message)
    if exc.status >= 500:
        log.error(text, *args)
    else:
        log.warning(text, *args)


def create_app(settings: config.Settings | None = None) -> FastAPI:
    """The app for `settings` (default: from the environment)."""
    configure_logging()
    settings = settings or config.from_env()
    store = ClipStore(settings)
    queue = RenderQueue()
    app = FastAPI(title="CueFX API", version=system.VERSION, docs_url="/api/docs", redoc_url=None,
                  openapi_url="/api/openapi.json")
    app.state.settings = settings
    app.state.store = store
    app.state.queue = queue
    app.state.jobs = StandinStore(settings, store, queue)
    app.state.generations = GenerationStore(settings, app.state.jobs, RenderQueue())
    app.state.videos = VideoStore(settings, app.state.jobs, app.state.generations, RenderQueue())
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"],
                       allow_headers=["*"], expose_headers=["Content-Disposition"])
    app.add_middleware(RequestStarted)

    def reply(exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.to_dict(), status_code=exc.status)

    def fail(request: Request, exc: ApiError) -> JSONResponse:
        _log_handled(request, exc)
        return reply(exc)

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return fail(request, exc)

    @app.exception_handler(api.CueFXError)
    async def _cuefx_error(request: Request, exc: api.CueFXError) -> JSONResponse:
        return fail(request, from_cuefx(exc))

    @app.exception_handler(RequestValidationError)
    async def _bad_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(f"{'.'.join(str(p) for p in err['loc'][1:])}: {err['msg']}" for err in exc.errors()[:5])
        return fail(request, invalid(detail or "the request body is not valid"))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return fail(request, not_found("no such route"))
        return fail(request, invalid(str(exc.detail), exc.status_code))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error on %s %s after %.1f s", request.method, request.url.path, _seconds(request),
                  exc_info=exc)
        return reply(internal())

    api_router_prefix = "/api/v1"
    app.include_router(system.router, prefix=api_router_prefix)
    app.include_router(clips.router, prefix=api_router_prefix)
    app.include_router(cue.router, prefix=api_router_prefix)
    app.include_router(jobs.router, prefix=api_router_prefix)
    app.include_router(generations.router, prefix=api_router_prefix)
    app.include_router(videos.router, prefix=api_router_prefix)
    return app


def main() -> None:
    """Start the API with settings from CUEFX_* environment variables."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = config.from_env()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
