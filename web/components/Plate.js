"use client";

import { useEffect, useRef, useState } from "react";
import { frameUrl, videoUrl } from "../lib/api";
import MediaLoading, { useMediaLoading } from "./MediaLoading";

export function platePoint(svg, event) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const plate = point.matrixTransform(matrix.inverse());
  return { x: plate.x, y: plate.y };
}

export default function Plate({ clip, frame, setFrame, playing, onEnded, onClick, children, svgRef: svgRefProp, cursor, onScale }) {
  const videoRef = useRef(null);
  const ownRef = useRef(null);
  const svgRef = svgRefProp || ownRef;
  const [width, height] = clip.plate_size;
  const last = clip.frames - 1;
  // The paused still stays under the video while playing; the video stays up after a pause until that still is in
  const stillFrame = useRef(frame);
  if (!playing) stillFrame.current = frame;
  const [videoUp, setVideoUp] = useState(false);
  const stillSrc = frameUrl(clip.clip_id, stillFrame.current);
  const videoSrc = videoUrl(clip.clip_id);
  const still = useMediaLoading(stillSrc);
  const video = useMediaLoading(videoSrc);
  const showVideo = playing || videoUp;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onScale) return undefined;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      const view = svg.viewBox.baseVal;
      if (!box.width || !view.width) return;
      onScale(Math.min(box.width / view.width, box.height / view.height));
    };
    const watch = new ResizeObserver(measure);
    watch.observe(svg);
    measure();
    return () => watch.disconnect();
  }, [onScale, width, height]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return undefined;
    if (!playing) {
      element.pause();
      if (still.ready) setVideoUp(false);
      return undefined;
    }
    setVideoUp(true);
    let stopped = false;
    let handle = 0;
    const byFrame = typeof element.requestVideoFrameCallback === "function";
    // A small tolerance so a frame's exact start time does not floor to the frame before it
    const toFrame = (seconds) => Math.min(last, Math.max(0, Math.floor(seconds * clip.fps + 1e-3)));
    const tick = (_, meta) => {
      if (stopped) return;
      setFrame(toFrame(meta?.mediaTime ?? element.currentTime));
      handle = byFrame ? element.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    element.currentTime = Math.min(frame, last) / clip.fps;
    handle = byFrame ? element.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    (async () => {
      try {
        await element.play();
      } catch {
        if (!stopped) onEnded?.();
      }
    })();
    return () => {
      stopped = true;
      if (byFrame) element.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
    };
  }, [playing]);

  function stillShown() {
    if (!playing) setVideoUp(false);
  }

  function click(event) {
    if (!onClick || playing || event.target.closest("[data-handle]")) return;
    const point = platePoint(svgRef.current, event);
    if (point) onClick(point);
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-well">
      <img
        key={`still-${still.attempt}`}
        alt=""
        src={stillSrc}
        className="absolute inset-0 h-full w-full object-contain"
        {...still.handlers}
        onLoad={() => { still.handlers.onLoad(); stillShown(); }}
        onError={() => { still.handlers.onError(); stillShown(); }}
      />
      {showVideo && (
        <video
          key={`video-${video.attempt}`}
          ref={videoRef}
          src={videoSrc}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
          {...video.handlers}
          onEnded={() => { setFrame(last); onEnded?.(); }}
        />
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className={`absolute inset-0 h-full w-full ${cursor === "crosshair" && !playing ? "cursor-crosshair" : ""}`}
        onClick={click}
      >
        {children}
      </svg>
      {showVideo
        ? <MediaLoading status={{ ...video, hasFrame: video.hasFrame || still.hasFrame }} />
        : <MediaLoading status={still} />}
    </div>
  );
}
