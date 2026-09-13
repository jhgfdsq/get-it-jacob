// Modified September 2026 for Get It Jacob; see NOTICE.
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

const HANDLE = 10;
export default function ReaderSplit({ left, right, percent, onChange }: { left: ReactNode; right: ReactNode; percent: number; onChange: (percent: number, save: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; start: number; latest: number; offset: number } | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const available = Math.max(1, width - HANDLE);
  const min = Math.min(280 / available * 100, 48);
  const max = Math.max(100 - 300 / available * 100, 52);
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  const actual = clamp(percent);
  const finish = (cancel: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null; setDragging(false);
    onChange(cancel ? current.start : current.latest, !cancel);
  };
  return <div className="min-h-0 flex-1 bg-[var(--surface-canvas)] p-2">
    <div ref={root} data-reader-split className={`grid h-full min-h-0 min-w-0 ${dragging ? "select-none" : ""}`} style={{ gridTemplateColumns: `minmax(0, ${actual}fr) ${HANDLE}px minmax(0, ${100 - actual}fr)` }}>
      <div id="reader-pdf-panel" data-reader-pdf className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">{left}</div>
      <div role="separator" tabIndex={0} aria-label="Largeur du PDF et du chat" aria-orientation="vertical" aria-controls="reader-pdf-panel reader-chat-panel" aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(actual)} aria-valuetext={`PDF ${Math.round(actual)} %, chat ${100 - Math.round(actual)} %`} title="Glissez pour redimensionner · Double-cliquez pour rétablir la largeur" className={`group relative z-40 flex cursor-col-resize touch-none items-center justify-center rounded outline-none hover:bg-[var(--accent-50)] focus-visible:ring-2 focus-visible:ring-[var(--accent-500)] ${dragging ? "bg-[var(--accent-50)]" : ""}`}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); drag.current = { id: event.pointerId, start: actual, latest: actual, offset: event.clientX - bounds.left }; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); onChange(actual, false); }}
        onPointerMove={event => { const current = drag.current; const bounds = root.current?.getBoundingClientRect(); if (!current || event.pointerId !== current.id || !bounds) return; const next = clamp((event.clientX - bounds.left - current.offset) / Math.max(1, bounds.width - HANDLE) * 100); current.latest = next; onChange(next, false); }}
        onPointerUp={event => { if (event.pointerId !== drag.current?.id) return; finish(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(false)}
        onDoubleClick={() => onChange(54, true)}
        onKeyDown={event => { if (event.key === "Escape" && drag.current) { event.preventDefault(); finish(true); return; } const next = event.key === "ArrowLeft" ? actual - (event.shiftKey ? 5 : 2) : event.key === "ArrowRight" ? actual + (event.shiftKey ? 5 : 2) : event.key === "Home" ? min : event.key === "End" ? max : null; if (next != null) { event.preventDefault(); onChange(clamp(next), true); } }}>
        <span aria-hidden="true" className={`h-10 w-[3px] rounded-full transition-colors ${dragging ? "bg-[var(--accent-500)]" : "bg-[var(--border-subtle)] group-hover:bg-[var(--accent-500)]"}`} />
      </div>
      <div id="reader-chat-panel" data-reader-chat className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">{right}</div>
    </div>
  </div>;
}
