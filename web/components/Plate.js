"use client";

import { useEffect, useRef } from "react";
import { frameUrl, videoUrl } from "../lib/api";

export function platePoint(svg, event) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const plate = point.matrixTransform(matrix.inverse());
  return { x: plate.x, y: plate.y };
}

export default function Plate({ clip, frame, setFrame, playing, onClick, children, svgRef: svgRefProp, cursor, onScale }) {
  const videoRef = useRef(null);
  const ownRef = useRef(null);
  const svgRef = svgRefProp || ownRef;
  const [width, height] = clip.plate_size;

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
    const video = videoRef.current;
    if (!video || !playing) return undefined;
    video.currentTime = frame / clip.fps;
    const pending = video.play();
    if (pending) pending.catch(() => {});
    return undefined;
  }, [playing]);

  function click(event) {
    if (!onClick || playing || event.target.closest("[data-handle]")) return;
    const point = platePoint(svgRef.current, event);
    if (point) onClick(point);
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-md bg-well">
      {playing ? (
        <video
          ref={videoRef}
          src={videoUrl(clip.clip_id)}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
          onTimeUpdate={(event) => {
            const next = Math.min(clip.frames - 1, Math.max(0, Math.floor(event.currentTarget.currentTime * clip.fps)));
            setFrame(next);
          }}
        />
      ) : (
        <img alt="" src={frameUrl(clip.clip_id, frame)} className="absolute inset-0 h-full w-full object-contain" />
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
    </div>
  );
}
