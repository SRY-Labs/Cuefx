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

export function uploadClip(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/clips");
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress({ pct: Math.round((event.loaded / event.total) * 100), loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { body = null; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(body && body.code ? { ...body, status: xhr.status } : { code: "internal", message: `The server answered ${xhr.status}.`, status: xhr.status });
    };
    xhr.onerror = () => reject({ code: "server_lost", message: "CueFX cannot reach the server." });
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
