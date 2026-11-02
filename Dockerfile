# syntax=docker/dockerfile:1
FROM python:3.12-slim-trixie

LABEL org.opencontainers.image.title="cuefx-api" \
      org.opencontainers.image.description="CueFX v2 FastAPI server"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

# ffmpeg is the CLI the server shells out to. PyAV does not put that binary on PATH.
# libgl1 and libglib2.0-0 are needed by the OpenCV and MediaPipe wheels;
# libegl1 and libgles2 by the MediaPipe Tasks C library (libEGL.so.1, libGLESv2.so.2).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 libegl1 libgles2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Includes the committed MediaPipe models in models/, so a cold start does not hit the network
COPY . .

RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /data \
    && chown appuser:appuser /data
USER 1000:1000

ENV CUEFX_DATA_DIR=/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT}/api/v1/health', timeout=4)" || exit 1

# One worker: the render queue and job state live in this process
CMD ["sh", "-c", "exec uvicorn app:create_app --factory --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips '*'"]
