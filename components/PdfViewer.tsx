// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { VizType } from "@/lib/schemas";
import { VIZ_TYPE_META, vizTypeStyle } from "@/components/Visualizer/viz-meta";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

if (typeof window !== "undefined") {
  GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const TAG_LABEL_VISIBLE_CHARS = 8;

export type Tag = {
  id: string;
  page: number; // 0-based
  endX: number;
  endY: number;
  fontHeight: number;
  type: VizType;
  label: string;
  /** Spec arrived — clicking opens the visualization. */
  ready: boolean;
  /** Currently fetching the spec — show spinner, disable click. */
  generating: boolean;
  /** Generation/render failed — show a red ring, clicking re-selects it. */
  error?: string;
};

type Props = {
  pdfUrl: string;
  numPages: number;
  pageDims: Array<{ width: number; height: number }>;
  tags: Tag[];
  activeTagId: string | null;
  onTagClick: (tagId: string) => void;
  detecting?: boolean;
  providerLabel?: string;
  onPageChange?: (pageIndex: number) => void;
  onSelectionAction?: (action: "discuss" | "explain" | "graph" | "diagram", selection: { text: string; pageIndex: number }) => void;
};

function truncateTagLabel(label: string): string {
  if (label.length <= TAG_LABEL_VISIBLE_CHARS) return label;
  return `${label.slice(0, TAG_LABEL_VISIBLE_CHARS).trimEnd()}...`;
}

export default function PdfViewer({
  pdfUrl,
  numPages,
  pageDims,
  tags,
  activeTagId,
  onTagClick,
  detecting,
  providerLabel,
  onPageChange,
  onSelectionAction,
}: Props) {
  const [selection, setSelection] = useState<{ text: string; pageIndex: number } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [containerW, setContainerW] = useState(0);
  // 1.0 = fit-to-width baseline. Bounded to keep WebGL/canvas sane.
  const [zoomLevel, setZoomLevel] = useState(1);
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.1;
  const zoomIn = useCallback(
    () => setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))),
    [],
  );
  const zoomOut = useCallback(
    () => setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const task = getDocument({ url: pdfUrl });
    task.promise.then((pdf) => {
      if (cancelled) {
        pdf.destroy();
        return;
      }
      setPdfDoc(pdf);
    }).catch((e) => { if (!cancelled) setPdfError(String(e.message ?? e)); });
    return () => {
      cancelled = true;
      task.promise.then((p) => p?.destroy?.()).catch(() => {});
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const measure = () => setContainerW(el.clientWidth - 64); // minus px padding
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Choose a uniform scale based on the widest page so all pages line up.
  const baseScale = useMemo(() => {
    if (!containerW || !pageDims.length) return 1;
    const widest = Math.max(...pageDims.map((p) => p.width));
    const target = Math.min(940, containerW);
    return target / widest;
  }, [containerW, pageDims]);
  const scale = baseScale * zoomLevel;

  // When the active tag changes, scroll to the page that contains it.
  useEffect(() => {
    if (!activeTagId || !scrollRef.current) return;
    const tag = tags.find((t) => t.id === activeTagId);
    if (!tag) return;
    const el = scrollRef.current.querySelector(`[data-page="${tag.page}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTagId, tags]);

  // DOM viewport coordinates avoid offset-parent and inter-page-gap errors.
  const [currentPage, setCurrentPage] = useState(0);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !numPages) return;
    let frame = 0;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
      let best = 0;
      let bestDistance = Infinity;
      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        const distance = Math.max(rect.top - center, center - rect.bottom, 0);
        if (distance < bestDistance) {
          best = Number(page.dataset.page);
          bestDistance = distance;
        }
      }
      setCurrentPage(best);
      onPageChange?.(best);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    schedule();
    root.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    return () => { root.removeEventListener("scroll", schedule); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [numPages, scale, pdfDoc, onPageChange]);

  const captureSelection = () => {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) { setSelection(null); return; }
    const range = selected.getRangeAt(0);
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element : range.startContainer.parentElement;
    const page = element?.closest<HTMLElement>("[data-page]");
    const text = selected.toString().trim();
    if (page && scrollRef.current?.contains(page) && text) {
      setSelection({ text: text.slice(0, 12000), pageIndex: Number(page.dataset.page) });
    }
  };

  const [pageEditing, setPageEditing] = useState(false);
  const [pageDraft, setPageDraft] = useState("");
  const pageInputRef = useRef<HTMLInputElement | null>(null);

  const startPageEdit = useCallback(() => {
    setPageDraft(String(currentPage + 1));
    setPageEditing(true);
  }, [currentPage]);

  const goToPage = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(numPages - 1, idx));
      const root = scrollRef.current;
      if (!root) return;
      const el = root.querySelector(`[data-page="${clamped}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [numPages],
  );

  const zoomPercent = Math.round(zoomLevel * 100);
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomDraft, setZoomDraft] = useState("");
  const zoomInputRef = useRef<HTMLInputElement | null>(null);

  const startZoomEdit = useCallback(() => {
    setZoomDraft(String(Math.round(zoomLevel * 100)));
    setZoomEditing(true);
  }, [zoomLevel]);

  const commitZoomEdit = useCallback(() => {
    const parsed = parseFloat(zoomDraft.replace(",", "."));
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, parsed / 100));
      setZoomLevel(+clamped.toFixed(2));
    }
    setZoomEditing(false);
  }, [zoomDraft]);

  const commitPageEdit = useCallback(() => {
    const parsed = parseInt(pageDraft, 10);
    if (Number.isFinite(parsed)) goToPage(parsed - 1);
    setPageEditing(false);
  }, [pageDraft, goToPage]);

  useEffect(() => {
    if (zoomEditing) {
      zoomInputRef.current?.focus();
      zoomInputRef.current?.select();
    }
  }, [zoomEditing]);

  useEffect(() => {
    if (pageEditing) {
      pageInputRef.current?.focus();
      pageInputRef.current?.select();
    }
  }, [pageEditing]);

  return (
    <div className="relative h-full">
      <div ref={scrollRef} onMouseUp={captureSelection} onKeyUp={captureSelection} onContextMenu={(event) => { if (window.getSelection()?.toString().trim()) { event.preventDefault(); captureSelection(); } }} className="relative flex h-full flex-col overflow-y-auto bg-[var(--surface-raised)]">
          {detecting && (
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]/90 px-4 py-2 text-[12px] text-[var(--ink-500)] backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-600)]" />
            {providerLabel ?? "The AI engine"} is reading your document and tagging concepts…
          </div>
        )}
        <div className="flex flex-col items-center gap-7 px-6 py-8">
          {Array.from({ length: numPages }).map((_, i) => (
            <PdfPage
              key={i}
              pdfDoc={pdfDoc}
              pageNumber={i + 1}
              pdfWidth={pageDims[i]?.width ?? 595}
              pdfHeight={pageDims[i]?.height ?? 842}
              scale={scale}
              tags={tags.filter((t) => t.page === i)}
              activeTagId={activeTagId}
              onTagClick={onTagClick}
            />
          ))}
        </div>
      </div>

      {pdfError && <div role="alert" className="absolute inset-x-4 top-4 z-30 rounded-lg bg-red-50 p-3 text-sm text-red-800">Impossible de lire le PDF : {pdfError}</div>}
      {selection && onSelectionAction && (
        <div role="toolbar" aria-label="Actions sur la sélection" className="absolute left-3 right-3 top-3 z-40 flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-popover)]">
          <span className="mr-1 text-[11px] text-[var(--ink-500)]">Page {selection.pageIndex + 1}</span>
          {([['discuss', 'Discuter'], ['explain', 'Expliquer'], ['graph', 'Graphique'], ['diagram', 'Diagramme']] as const).map(([action, label]) => (
            <button key={action} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelectionAction(action, selection); setSelection(null); window.getSelection()?.removeAllRanges(); }} className="rounded-md px-2 py-1 text-[12px] text-[var(--ink-900)] hover:bg-[var(--surface-sunken)]">{label}</button>
          ))}
          <button type="button" aria-label="Fermer la sélection" onClick={() => setSelection(null)} className="ml-auto px-2 text-[var(--ink-500)]">×</button>
        </div>
      )}
      {/* Page navigation — discreet cluster centered at the bottom */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/95 p-1 shadow-[var(--shadow-nav)] backdrop-blur">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 0}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageEditing ? (
          <div className="pointer-events-auto flex items-center px-1">
            <input
              ref={pageInputRef}
              type="text"
              inputMode="numeric"
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={commitPageEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPageEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setPageEditing(false);
                }
              }}
              className="w-8 rounded-sm bg-transparent text-right text-[12px] font-medium tabular-nums text-[var(--ink-900)] outline-none focus:bg-[var(--surface-sunken)]"
              aria-label="Go to page"
            />
            <span className="text-[12px] font-medium text-[var(--ink-700)]">
              &nbsp;/ {numPages || 1}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startPageEdit}
            className="pointer-events-auto rounded-md px-2 py-0.5 text-[12px] font-medium tabular-nums text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)]"
            aria-label="Jump to page"
            title="Click to jump to a specific page"
          >
            {Math.min(currentPage + 1, numPages || 1)} / {numPages || 1}
          </button>
        )}
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages - 1}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Zoom cluster — bottom-right of the document panel */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]/95 p-1 shadow-[var(--shadow-nav)] backdrop-blur">
        {zoomEditing ? (
          <div className="pointer-events-auto flex items-center px-1">
            <input
              ref={zoomInputRef}
              type="text"
              inputMode="numeric"
              value={zoomDraft}
              onChange={(e) => setZoomDraft(e.target.value.replace(/[^0-9.,]/g, ""))}
              onBlur={commitZoomEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitZoomEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setZoomEditing(false);
                }
              }}
              className="w-10 rounded-sm bg-transparent text-right text-[12px] font-medium tabular-nums text-[var(--ink-900)] outline-none focus:bg-[var(--surface-sunken)]"
              aria-label="Zoom percentage"
            />
            <span className="text-[12px] font-medium text-[var(--ink-700)]">%</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startZoomEdit}
            className="pointer-events-auto rounded-md px-2 py-0.5 text-[12px] font-medium tabular-nums text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)]"
            aria-label="Set custom zoom"
            title="Click to type a custom zoom"
          >
            {zoomPercent}%
          </button>
        )}
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoomLevel >= ZOOM_MAX}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoomLevel <= ZOOM_MIN}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PdfPage({
  pdfDoc,
  pageNumber,
  pdfWidth,
  pdfHeight,
  scale,
  tags,
  activeTagId,
  onTagClick,
}: {
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  pdfWidth: number;
  pdfHeight: number;
  scale: number;
  tags: Tag[];
  activeTagId: string | null;
  onTagClick: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!pageRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { rootMargin: "1000px" });
    observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDoc || !scale || !canvasRef.current || !nearViewport) return;
    let cancelled = false;
    let textLayer: TextLayer | null = null;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) {
        page.cleanup();
        return;
      }
      const viewport = page.getViewport({ scale: scale * dpr });
      const textViewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await renderTask.promise;
        if (!cancelled && textRef.current) {
          textRef.current.replaceChildren();
          textRef.current.style.setProperty("--total-scale-factor", String(scale));
          textLayer = new TextLayer({ textContentSource: await page.getTextContent(), container: textRef.current, viewport: textViewport });
          if (!cancelled) await textLayer.render();
        }
      } catch {
        /* cancelled */
      }
      page.cleanup();
    })().catch(() => {});
    return () => {
      cancelled = true;
      textLayer?.cancel();
      try {
        renderTask?.cancel();
      } catch {}
    };
  }, [pdfDoc, pageNumber, scale, nearViewport]);

  return (
    <div
      ref={pageRef}
      data-page={pageNumber - 1}
      className="relative shrink-0 bg-[var(--surface-sunken)]"
      style={{
        width: pdfWidth * scale,
        height: pdfHeight * scale,
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={textRef} className="pdf-selectable-text" />
      <style>{`
        .pdf-selectable-text { position: absolute; inset: 0; overflow: clip; line-height: 1; text-align: initial; text-size-adjust: none; transform-origin: 0 0; --min-font-size: 1; --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size)); --min-font-size-inv: calc(1 / var(--min-font-size)); }
        .pdf-selectable-text :is(span, br) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0 0; }
        .pdf-selectable-text > :not(.markedContent), .pdf-selectable-text .markedContent span:not(.markedContent) { --font-height: 0; font-size: calc(var(--text-scale-factor) * var(--font-height)); --scale-x: 1; --rotate: 0deg; transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv)); }
        .pdf-selectable-text .markedContent { display: contents; }
        .pdf-selectable-text ::selection { background: rgba(166, 117, 72, .3); }
      `}</style>
      {/* Tag overlay layer */}
      <div className="pointer-events-none absolute inset-0">
        {tags.map((t) => (
          <TagPill
            key={t.id}
            tag={t}
            scale={scale}
            pdfHeight={pdfHeight}
            isActive={activeTagId === t.id}
            onClick={() => onTagClick(t.id)}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute -bottom-5 right-2 text-[10px] tabular-nums text-[var(--ink-400)]">
        page {pageNumber}
      </div>
    </div>
  );
}

function TagPill({
  tag,
  scale,
  pdfHeight,
  isActive,
  onClick,
}: {
  tag: Tag;
  scale: number;
  pdfHeight: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const { Icon, label: typeLabel } = VIZ_TYPE_META[tag.type];

  const top = (pdfHeight - tag.endY - tag.fontHeight * 0.85) * scale - 1;
  const left = tag.endX * scale + 4;

  const isIdle = !tag.ready && !tag.generating;
  const clickable = tag.ready || isIdle;
  const labelWithType = `${typeLabel}: ${tag.label}`;
  const tooltip = tag.ready
    ? labelWithType
    : tag.generating
      ? `${labelWithType} (preparing visualization...)`
      : tag.error
        ? `${labelWithType} (failed — click to retry)`
        : `${labelWithType} (click to generate)`;
  const tooltipId = `pdf-tag-tooltip-${tag.id}`;
  const stateAttr = tag.ready
    ? "ready"
    : tag.generating
      ? "generating"
      : tag.error
        ? "error"
        : "idle";
  const displayLabel = truncateTagLabel(tag.label);

  return (
    <motion.button
      initial={{ opacity: 0, y: -4, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25 }}
      type="button"
      aria-label={tooltip}
      aria-describedby={tooltipId}
      aria-disabled={!clickable}
      onClick={(event) => {
        if (!clickable) {
          event.preventDefault();
          return;
        }
        onClick();
      }}
      data-active={isActive ? "true" : "false"}
      data-state={stateAttr}
      style={{ left, top, ...vizTypeStyle(tag.type) }}
      className="tag-pill viz-tooltip-anchor pointer-events-auto absolute -translate-y-0.5"
    >
      {tag.generating ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : (
        <Icon className="h-3 w-3" aria-hidden />
      )}
      <span className="tag-pill-label" aria-hidden>
        {displayLabel}
      </span>
      <span id={tooltipId} className="viz-tooltip" role="tooltip">
        {tooltip}
      </span>
    </motion.button>
  );
}
