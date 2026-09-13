// Modified September 2026 for Get It Jacob; see NOTICE.
"use client";

import { useRef } from "react";
import { clampUnit, drawCaptureRect, moveCaptureRect, resizeCaptureRect, type CaptureHandle, type CapturePoint, type CaptureRect } from "./pdf-capture-geometry";

type Gesture = { pointerId: number; start: CapturePoint; rect: CaptureRect | null; mode: "draw" | "move" | CaptureHandle };
const handles: CaptureHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const positions: Record<CaptureHandle, [number, number]> = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };

export default function PdfCaptureOverlay({ rect, onChange, busy }: { rect: CaptureRect | null; onChange: (rect: CaptureRect | null) => void; busy: boolean }) {
  const gesture = useRef<Gesture | null>(null);
  return <div
    data-capture-overlay
    aria-label="Zone de capture du document"
    className="absolute inset-0 z-20 overflow-hidden touch-none select-none"
    style={{ cursor: busy ? "wait" : "crosshair" }}
    onPointerDown={(event) => {
      if (busy || event.button !== 0) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const start = { x: clampUnit((event.clientX - bounds.left) / bounds.width), y: clampUnit((event.clientY - bounds.top) / bounds.height) };
      const target = event.target as HTMLElement;
      const mode = target.dataset.captureHandle as CaptureHandle | undefined ?? (target.dataset.captureMove ? "move" : "draw");
      gesture.current = { pointerId: event.pointerId, start, rect, mode };
      event.currentTarget.setPointerCapture(event.pointerId);
      if (mode === "draw") onChange(drawCaptureRect(start, start));
    }}
    onPointerMove={(event) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = { x: clampUnit((event.clientX - bounds.left) / bounds.width), y: clampUnit((event.clientY - bounds.top) / bounds.height) };
      if (current.mode === "draw") onChange(drawCaptureRect(current.start, point));
      else if (current.rect && current.mode === "move") onChange(moveCaptureRect(current.rect, point.x - current.start.x, point.y - current.start.y));
      else if (current.rect) onChange(resizeCaptureRect(current.rect, current.mode as CaptureHandle, point));
    }}
    onPointerUp={(event) => {
      if (gesture.current?.pointerId !== event.pointerId) return;
      gesture.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { gesture.current = null; onChange(null); }}
  >
    {rect && <div data-capture-move="true" data-capture-rectangle className="absolute border-2 border-[var(--accent-600)] bg-[var(--accent-600)]/5" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, cursor: busy ? "wait" : "move", boxShadow: "0 0 0 9999px rgba(20, 20, 20, 0.14)", touchAction: "none" }}>
      {handles.map((handle) => <span key={handle} data-capture-handle={handle} title="Redimensionner la capture" className="absolute h-3 w-3 rounded-sm border border-[var(--accent-600)] bg-white" style={{ left: `${positions[handle][0]}%`, top: `${positions[handle][1]}%`, transform: "translate(-50%, -50%)", cursor: `${handle}-resize` }} />)}
    </div>}
  </div>;
}
