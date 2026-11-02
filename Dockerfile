FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

# ffmpeg is the CLI the server shells out to. PyAV does not put that binary on PATH.
# libgl1 and libglib2.0-0 are needed by the OpenCV and MediaPipe wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# MediaPipe models at build time so a cold start does not hit the network
RUN mkdir -p /app/models \
    && curl -fsSL -o /app/models/hand_landmarker.task \
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task" \
    && curl -fsSL -o /app/models/pose_landmarker_heavy.task \
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"

RUN useradd --uid 1000 --create-home appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data
USER appuser

ENV CUEFX_DATA_DIR=/data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/api/v1/health" || exit 1

# One worker: the render queue and job state live in this process
CMD ["sh", "-c", "uvicorn app:create_app --factory --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips '*'"]
