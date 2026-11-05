/**
 * A take is one render of the shot as it was when Render was pressed: the guide pass (stand-in job), the styled
 * frame (ComfyUI image edit), then the LTX video. Each stage only calls endpoints the API already has.
 */
import { artifactUrl, jobResult, pollGeneration, pollJob, pollVideo, startGeneration, startJob, startVideo } from "./api";

export const STAGES = [
  { id: "guide", name: "Guide pass", typical: 45 },
  { id: "frame", name: "Styled frame", typical: 100 },
  { id: "video", name: "Video", typical: 60 },
];

export const LTX_PROMPT = "Photoreal, camera locked off, matching the first frame. The same person and the same room, with the effect keeping the material, color, and light it has in that frame.";

/** The stages a take runs: a guide-only take stops after the guide pass. */
export function stagesOf(take) {
  return take.kind === "guide" ? STAGES.slice(0, 1) : STAGES;
}

export function newTake({ n, kind, clipId, cue, prompt, videoPrompt, look, behaviour }) {
  return {
    id: `take-${Date.now()}-${n}`,
    n,
    kind,
    clipId,
    settings: { cue, prompt, videoPrompt, look, behaviour },
    stage: "guide",
    status: "running",
    job: null,
    result: null,
    generation: null,
    video: null,
    error: null,
    failedStage: null,
    stageStarted: Date.now(),
    started: Date.now(),
    finished: null,
  };
}

/** What a take can show right now, best first: the video, the styled frame, the guide pass. */
export function takeMedia(take) {
  if (take.video?.status === "done" && take.video.video) return { kind: "video", url: take.video.video };
  if (take.generation?.status === "done" && take.generation.reference) return { kind: "image", url: take.generation.reference };
  const guide = artifactUrl(take.job, "hardcomp");
  if (take.job?.status === "done" && guide) return { kind: "video", url: guide, guide: true };
  return null;
}

export function takeDownloads(take) {
  const out = [];
  if (take.video?.status === "done" && take.video.video) out.push({ id: "video", label: "Video (mp4)", href: `${take.video.video}${take.video.video.includes("?") ? "&" : "?"}download=true` });
  if (take.generation?.status === "done" && take.generation.reference) out.push({ id: "frame", label: "Styled frame (png)", href: take.generation.reference, download: `cuefx-take-${take.n}-frame.png` });
  const guide = artifactUrl(take.job, "hardcomp", true);
  if (take.job?.status === "done" && guide) out.push({ id: "guide", label: "Guide pass (mp4)", href: guide });
  return out;
}

/**
 * Runs `take` from its current stage to the end. `update(patch)` merges into the take as it moves; the returned
 * promise settles when the take is done or has failed. A failed stage can be run again by calling this once more.
 */
export async function runTake(take, update, signal) {
  let job = take.job;
  let generation = take.generation;
  const stages = stagesOf(take).map((stage) => stage.id);
  const begin = (stage) => update({ stage, status: "running", error: null, failedStage: null, stageStarted: Date.now() });
  const fail = (stage, error) => update({ status: "failed", failedStage: stage, error: error || { code: "internal", message: "This stage stopped without a reason." }, finished: Date.now() });

  try {
    if (!(job?.status === "done")) {
      begin("guide");
      const first = await startJob(take.clipId, take.settings.cue, signal);
      job = await pollJob(first.id, { signal, onJob: (next) => update({ job: next }) });
      update({ job });
      if (job.status === "failed") return fail("guide", job.error || { code: "render_failed", message: "The guide pass did not render." });
      jobResult(job.id).then((result) => update({ result })).catch(() => {});
    }
    if (!stages.includes("frame")) return update({ stage: "done", status: "done", finished: Date.now() });

    if (!(generation?.status === "done")) {
      begin("frame");
      const first = await startGeneration(job.id, take.settings.prompt, signal);
      generation = await pollGeneration(first.id, { signal, onGeneration: (next) => update({ generation: next }) });
      update({ generation });
      if (generation.status === "failed") return fail("frame", generation.error);
    }

    begin("video");
    const firstVideo = await startVideo(job.id, { generation_id: generation.id, prompt: take.settings.videoPrompt }, signal);
    const video = await pollVideo(firstVideo.id, { signal, onVideo: (next) => update({ video: next }) });
    update({ video });
    if (video.status === "failed") return fail("video", video.error);
    return update({ stage: "done", status: "done", finished: Date.now() });
  } catch (error) {
    if (error?.aborted) return undefined;
    const at = !(job?.status === "done") ? "guide" : !(generation?.status === "done") && stages.includes("frame") ? "frame" : "video";
    return fail(at, error);
  }
}
