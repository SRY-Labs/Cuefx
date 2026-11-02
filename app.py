"""CueFX v2 FastAPI server. Routes live under /api/v1; the packages do the work."""
from __future__ import annotations

import logging

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
from api.v1 import clips, cue, jobs, system
from clips.store import ClipStore
from errors import ApiError, from_cuefx, internal, invalid, not_found
from cue import api
from render.jobs import StandinStore
from render.queue import RenderQueue

log = logging.getLogger("cuefx.server")


def create_app(settings: config.Settings | None = None) -> FastAPI:
    """The app for `settings` (default: from the environment)."""
    settings = settings or config.from_env()
    store = ClipStore(settings)
    queue = RenderQueue()
    app = FastAPI(title="CueFX API", version=system.VERSION, docs_url="/api/docs", redoc_url=None,
                  openapi_url="/api/openapi.json")
    app.state.settings = settings
    app.state.store = store
    app.state.queue = queue
    app.state.jobs = StandinStore(settings, store, queue)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"],
                       allow_headers=["*"], expose_headers=["Content-Disposition"])

    def reply(exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.to_dict(), status_code=exc.status)

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return reply(exc)

    @app.exception_handler(api.CueFXError)
    async def _cuefx_error(_: Request, exc: api.CueFXError) -> JSONResponse:
        return reply(from_cuefx(exc))

    @app.exception_handler(RequestValidationError)
    async def _bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(f"{'.'.join(str(p) for p in err['loc'][1:])}: {err['msg']}" for err in exc.errors()[:5])
        return reply(invalid(detail or "the request body is not valid"))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return reply(not_found("no such route"))
        return reply(invalid(str(exc.detail), exc.status_code))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return reply(internal())

    api_router_prefix = "/api/v1"
    app.include_router(system.router, prefix=api_router_prefix)
    app.include_router(clips.router, prefix=api_router_prefix)
    app.include_router(cue.router, prefix=api_router_prefix)
    app.include_router(jobs.router, prefix=api_router_prefix)
    return app


def main() -> None:
    """Start the API with settings from CUEFX_* environment variables."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = config.from_env()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
