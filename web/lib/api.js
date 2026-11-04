/** Talks to /api/v1 and returns each JSON body as the server sent it. */

const delay = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  if (!signal) return;
  const stop = () => { clearTimeout(timer); reject(cancelled()); };
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
});

export const cancelled = () => ({ code: "cancelled", message: "The request was cancelled.", aborted: true });

async function parse(res) {
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) return null;
  try { return await res.json(); } catch { return null; }
}

export async function request(method, path, { json, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      ...(json !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) } : {}),
    });
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw cancelled();
    throw { code: "server_lost", message: "CueFX cannot reach the server." };
  }
  const body = await parse(res);
  if (!res.ok) {
    throw body && typeof body.code === "string"
      ? { ...body, status: res.status }
      : { code: "internal", message: `The server answered ${res.status} without a message.`, status: res.status };
  }
  return body;
}

export const health = () => request("GET", "/api/v1/health");
export const defaults = () => request("GET", "/api/v1/defaults");
export const listClips = () => request("GET", "/api/v1/clips");

export const frameUrl = (clipId, frame) => `/api/v1/clips/${clipId}/frames/${frame}`;
export const videoUrl = (clipId) => `/api/v1/clips/${clipId}/video`;

// Same bounds as the server: config.Settings.max_upload_mb and clips.store.UPLOAD_MAX_SECONDS.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_SECONDS = 15;

function uploadFailure(status, text) {
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (body && typeof body.code === "string" && body.message) return { ...body, status };
  if (status === 413) return { code: "input_invalid", message: "This file is larger than 500 MB.", status };
  if (!status || status === 408 || status === 502 || status === 503 || status === 504) {
    return {
      code: "server_lost",
      message: "The connection closed while CueFX was still preparing the clip. Trim it to 15 seconds or less and try again.",
      status,
    };
  }
  return { code: "internal", message: status ? `CueFX answered ${status} without a reason.` : "The upload stopped before CueFX answered.", status };
}

function mediaDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let timer = 0;
    const finish = (seconds) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(seconds);
    };
    timer = setTimeout(() => finish(null), 4000);
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** A reason to refuse `file` before POST, or null when the browser cannot tell. */
export async function clipUploadIssue(file) {
  if (!file || file.size === 0) return { code: "input_invalid", message: "This file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.ceil(file.size / (1024 * 1024));
    return { code: "input_invalid", message: `This file is ${mb} MB. CueFX takes up to ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`, status: 413 };
  }
  const seconds = await mediaDuration(file);
  if (seconds != null && seconds > MAX_UPLOAD_SECONDS) {
    return {
      code: "clip_too_long",
      message: `This clip is ${Math.ceil(seconds)} seconds. CueFX takes up to ${MAX_UPLOAD_SECONDS} seconds. Trim it to the part you want.`,
    };
  }
  return null;
}

export function uploadClip(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/clips");
    const report = (progress) => { if (onProgress) onProgress(progress); };
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !event.total) {
        report({ phase: "upload" });
        return;
      }
      if (event.loaded >= event.total) report({ phase: "prepare" });
      else report({ phase: "upload", pct: Math.round((event.loaded / event.total) * 100) });
    };
    xhr.upload.onload = () => report({ phase: "prepare" });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject({ code: "internal", message: "CueFX answered, but the clip details were unreadable.", status: xhr.status }); }
        return;
      }
      reject(uploadFailure(xhr.status, xhr.responseText));
    };
    xhr.onerror = () => reject(uploadFailure(0, ""));
    xhr.onabort = () => reject(cancelled());
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

export const createCue = (clipId, body) => request("POST", `/api/v1/clips/${clipId}/cue`, { json: body });
export const normalize = (cue, signal) => request("POST", "/api/v1/cue/normalize", { json: { cue }, signal });
export const validate = (cue, signal) => request("POST", "/api/v1/cue/validate", { json: { cue }, signal });
export const preview = (cue, signal) => request("POST", "/api/v1/cue/preview", { json: { cue }, signal });

export const startJob = (clipId, cue, signal) => request("POST", "/api/v1/jobs", { json: { clip_id: clipId, cue }, signal });
export const getJob = (jobId, signal) => request("GET", `/api/v1/jobs/${jobId}`, { signal });
export const jobResult = (jobId) => request("GET", `/api/v1/jobs/${jobId}/result`);
export const requestElement = (jobId) => request("POST", `/api/v1/jobs/${jobId}/artifacts/element`);

export function artifactUrl(job, name, download = false) {
  const url = job?.artifacts?.[name]?.url;
  if (!url || download === false) return url || null;
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

export async function pollJob(jobId, { signal, onJob } = {}) {
  for (;;) {
    const job = await getJob(jobId, signal);
    if (onJob) onJob(job);
    if (job.status === "done" || job.status === "failed") return job;
    await delay(1500, signal);
  }
}

export async function pollElement(jobId, { signal, onJob } = {}) {
  let job = await requestElement(jobId);
  if (onJob) onJob(job);
  while (job.artifacts?.element?.status !== "ready" && job.artifacts?.element?.status !== "failed") {
    await delay(1500, signal);
    job = await getJob(jobId, signal);
    if (onJob) onJob(job);
  }
  return job;
}

// A styled reference frame from ComfyUI, made from a finished stand-in job.
export const startGeneration = (jobId, prompt, signal) => request("POST", "/api/v1/generations", { json: { job_id: jobId, prompt }, signal });
export const getGeneration = (id, signal) => request("GET", `/api/v1/generations/${id}`, { signal });

export async function pollGeneration(id, { signal, onUpdate, onGeneration } = {}) {
  for (;;) {
    const doc = await getGeneration(id, signal);
    if (onUpdate) onUpdate(doc);
    if (onGeneration) onGeneration(doc);
    if (doc.status === "done" || doc.status === "failed") return doc;
    await delay(1500, signal);
  }
}

export const startVideo = (jobId, body, signal) => request("POST", `/api/v1/jobs/${jobId}/video`, { json: body, signal });
export const getVideo = (videoId, signal) => request("GET", `/api/v1/videos/${videoId}`, { signal });

export async function pollVideo(videoId, { signal, onVideo } = {}) {
  for (;;) {
    const video = await getVideo(videoId, signal);
    if (onVideo) onVideo(video);
    if (video.status === "done" || video.status === "failed") return video;
    await delay(1500, signal);
  }
}

// Re-times the path points between release and the last point to a constant speed (cue.route.propose_route_timing).
export const proposeTiming = (cue, signal) => request("POST", "/api/v1/cue/timing", { json: { cue }, signal });
