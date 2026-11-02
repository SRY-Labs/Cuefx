"""Stand-in jobs: create, poll, the summary, and the video files."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse

from api.v1.models import JobIn
from cue.wire import cue_in

router = APIRouter()


def _jobs(request: Request):
    return request.app.state.jobs


@router.post("/jobs")
def create_job(body: JobIn, request: Request) -> JSONResponse:
    job, status = _jobs(request).start(cue_in(body.cue), body.clip_id)
    return JSONResponse(job, status_code=status)


@router.get("/jobs")
def list_jobs(request: Request) -> list[dict]:
    return _jobs(request).list_jobs()


@router.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request) -> dict:
    return _jobs(request).document(job_id)


@router.get("/jobs/{job_id}/result")
def job_result(job_id: str, request: Request) -> dict:
    return _jobs(request).result_body(job_id)


@router.post("/jobs/{job_id}/artifacts/element")
def request_element(job_id: str, request: Request) -> dict:
    return _jobs(request).request_element(job_id)


@router.get("/jobs/{job_id}/artifacts/{name}")
def artifact(job_id: str, name: str, request: Request, download: bool = False) -> FileResponse:
    path, filename = _jobs(request).open_artifact(job_id, name)
    inline = name == "hardcomp" and not download
    return FileResponse(path, media_type="video/mp4", filename=None if inline else filename,
                        content_disposition_type="inline" if inline else "attachment")
