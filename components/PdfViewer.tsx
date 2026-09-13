// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  ChartNoAxesCombined,
  Maximize2,
} from "lucide-react";
import PdfCaptureOverlay from "./PdfCaptureOverlay";
import type { CaptureRect } from "./pdf-capture-geometry";
import { MAX_CAPTURE_DIMENSION, MAX_CAPTURE_PIXELS } from "@/lib/capture-types";
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

export type PdfCapture = { dataUrl: string; pageIndex: number; width: number; height: number };

type Props = {
  onCapture?: (capture: PdfCapture) => void;
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
  onCapture,
}: Props) {
  const [selection, setSelection] = useState<{ text: string; pageIndex: number } | null>(null);
  const [visualMenuOpen, setVisualMenuOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const [captureDraft, setCaptureDraft] = useState<{ pageIndex: number; rect: CaptureRect } | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const captureGeneration = useRef(0);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [containerW, setContainerW] = useState(0);
  const resizeAnchor = useRef<{ pageIndex: string; fraction: number } | null>(null);
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
    let previousWidth = 0;
    const measure = () => {
      const nextWidth = el.clientWidth - 64;
      if (previousWidth && Math.abs(nextWidth - previousWidth) > 0.5) {
        const center = el.getBoundingClientRect().top + el.clientHeight / 2;
        const pages = [...el.querySelectorAll<HTMLElement>("[data-page]")];
        const closest = pages.sort((a, b) => {
          const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
          return Math.max(ar.top - center, center - ar.bottom, 0) - Math.max(br.top - center, center - br.bottom, 0);
        })[0];
        if (closest) { const bounds = closest.getBoundingClientRect(); resizeAnchor.current = { pageIndex: closest.dataset.page!, fraction: Math.max(0, Math.min(1, (center - bounds.top) / bounds.height)) }; }
      }
      previousWidth = nextWidth;
      setContainerW(nextWidth);
    };
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
  useLayoutEffect(() => {
    const anchor = resizeAnchor.current, root = scrollRef.current;
    if (!anchor || !root) return;
    resizeAnchor.current = null;
    const page = root.querySelector<HTMLElement>(`[data-page="${anchor.pageIndex}"]`);
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    root.scrollTop += bounds.top + bounds.height * anchor.fraction - (root.getBoundingClientRect().top + root.clientHeight / 2);
  }, [scale]);

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

  const captureSelection = useCallback(() => {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) { setSelection(null); setVisualMenuOpen(false); return; }
    const range = selected.getRangeAt(0);
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element : range.startContainer.parentElement;
    const page = element?.closest<HTMLElement>("[data-page]");
    const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement;
    const text = selected.toString().trim();
    if (page && scrollRef.current?.contains(page) && endElement && scrollRef.current.contains(endElement) && text) {
      setSelection({ text: text.slice(0, 12000), pageIndex: Number(page.dataset.page) });
    } else { setSelection(null); setVisualMenuOpen(false); }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", captureSelection);
    const closeMenu = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setVisualMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => { document.removeEventListener("selectionchange", captureSelection); document.removeEventListener("pointerdown", closeMenu); };
  }, [captureSelection]);

  const cancelCapture = useCallback(() => {
    captureGeneration.current += 1;
    setCaptureMode(false);
    setCaptureDraft(null);
    setCaptureBusy(false);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { cancelCapture(); setVisualMenuOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancelCapture]);
  useEffect(() => {
    // A zoom/resize changes the displayed page. Discard the old crop rather than
    // accidentally capturing a different area from the new canvas.
    const frame = requestAnimationFrame(cancelCapture);
    return () => { cancelAnimationFrame(frame); captureGeneration.current += 1; };
  }, [scale, pdfUrl, cancelCapture]);

  const selectionAction = (action: "discuss" | "graph" | "diagram") => {
    if (!selection || !onSelectionAction) return;
    onSelectionAction(action, selection);
    setSelection(null);
    setVisualMenuOpen(false);
    window.getSelection()?.removeAllRanges();
  };

  const validateCapture = async () => {
    if (!pdfDoc || !captureDraft || captureBusy || !onCapture) return;
    const generation = captureGeneration.current;
    setCaptureBusy(true);
    setPdfError(null);
    try {
      const page = await pdfDoc.getPage(captureDraft.pageIndex + 1);
      const natural = page.getViewport({ scale: 1 });
      // Render this crop directly from the PDF, independently of the screen DPR
      // and the lazy display canvas. Text and chart labels stay sharp at low zoom.
      const viewport = page.getViewport({ scale: Math.min(4, Math.max(2, 2200 / natural.width)) });
      const rect = captureDraft.rect;
      const x = Math.floor(rect.x * viewport.width), y = Math.floor(rect.y * viewport.height);
      const width = Math.max(1, Math.ceil((rect.x + rect.width) * viewport.width) - x);
      const height = Math.max(1, Math.ceil((rect.y + rect.height) * viewport.height) - y);
      if (width > MAX_CAPTURE_DIMENSION || height > MAX_CAPTURE_DIMENSION || width * height > MAX_CAPTURE_PIXELS) throw new Error("Cette zone est trop grande. Réduisez le cadre ou réalisez plusieurs captures.");
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("La capture ne peut pas être créée.");
      await page.render({ canvas, canvasContext: context, viewport, transform: [1, 0, 0, 1, -x, -y] }).promise;
      if (generation !== captureGeneration.current) return;
      onCapture({ dataUrl: canvas.toDataURL("image/png"), pageIndex: captureDraft.pageIndex, width, height });
      cancelCapture();
    } catch (error) {
      if (generation === captureGeneration.current) { setPdfError(error instanceof Error ? error.message : String(error)); setCaptureBusy(false); }
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

  const actionClass = "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[var(--ink-900)] transition hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:text-[var(--ink-400)] disabled:opacity-45 disabled:hover:bg-transparent";
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={toolbarRef} role="toolbar" aria-label="Outils du document" className="relative z-40 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" disabled={!selection || !onSelectionAction || captureMode} onMouseDown={(event) => event.preventDefault()} onClick={() => selectionAction("discuss")} className={actionClass} title="Ajouter le texte sélectionné au chat"><MessageSquare className="h-3.5 w-3.5" />Discuter</button>
          <div className="relative">
            <button type="button" disabled={!selection || !onSelectionAction || captureMode} onMouseDown={(event) => event.preventDefault()} onClick={() => setVisualMenuOpen((open) => !open)} aria-expanded={visualMenuOpen} aria-haspopup="menu" className={actionClass}><ChartNoAxesCombined className="h-3.5 w-3.5" />Créer un visuel<ChevronDown className="h-3 w-3" /></button>
            {visualMenuOpen && selection && <div role="menu" aria-label="Type de visuel" className="absolute left-0 top-full z-50 mt-1 min-w-40 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-popover)]">
              <button role="menuitem" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectionAction("graph")} className={`${actionClass} w-full`}>Graphique</button>
              <button role="menuitem" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectionAction("diagram")} className={`${actionClass} w-full`}>Diagramme</button>
            </div>}
          </div>
          <button type="button" aria-label="Capturer une zone" aria-pressed={captureMode} disabled={!pdfDoc || !onCapture} title="Capturer une zone du PDF pour le chat" onClick={() => { if (captureMode) cancelCapture(); else { window.getSelection()?.removeAllRanges(); setVisualMenuOpen(false); setCaptureMode(true); setCaptureDraft(null); } }} className={`${actionClass} ${captureMode ? "bg-[var(--surface-sunken)] ring-1 ring-[var(--accent-600)]" : ""}`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" /><rect x="8" y="5.5" width="8" height="13" rx="4" /><path d="M12 5.5v5M8 10.5h8" /></svg>
            Capturer
          </button>
          {selection && !captureMode && <span className="ml-auto text-[10px] text-[var(--ink-500)]">Texte · p. {selection.pageIndex + 1}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-[var(--border-subtle)] pt-1">
          <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 0}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Page précédente"
          title="Page précédente"
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
              aria-label="Numéro de page"
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
            aria-label="Aller à la page"
            title="Saisir un numéro de page"
          >
            {Math.min(currentPage + 1, numPages || 1)} / {numPages || 1}
          </button>
        )}
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages - 1}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Page suivante"
          title="Page suivante"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
          </div>
          <div className="flex items-center gap-0.5">
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
              aria-label="Pourcentage de zoom"
            />
            <span className="text-[12px] font-medium text-[var(--ink-700)]">%</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={startZoomEdit}
            className="pointer-events-auto rounded-md px-2 py-0.5 text-[12px] font-medium tabular-nums text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)]"
            aria-label="Régler le zoom"
            title="Saisir un pourcentage de zoom"
          >
            {zoomPercent}%
          </button>
        )}
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoomLevel >= ZOOM_MAX}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Agrandir"
          title="Agrandir"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoomLevel <= ZOOM_MIN}
          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-700)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-900)] disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Réduire"
          title="Réduire"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
            <button type="button" onClick={() => setZoomLevel(1)} className={actionClass} aria-label="Ajuster à la largeur" title="Ajuster à la largeur"><Maximize2 className="h-3.5 w-3.5" /><span className="text-[11px]">Largeur</span></button>
          </div>
        </div>
        {captureMode && <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-2 text-[11px] text-[var(--ink-600)]" role="status">
          <span className="min-w-0 flex-1">{captureDraft ? `Page ${captureDraft.pageIndex + 1} · Déplacez le cadre ou ses poignées.` : "Tracez une zone sur une page, puis ajustez le cadre."}</span>
          <button type="button" onClick={cancelCapture} className={actionClass}>Annuler</button>
          <button type="button" onClick={() => void validateCapture()} disabled={captureBusy || !captureDraft || captureDraft.rect.width < 0.008 || captureDraft.rect.height < 0.008} className={`${actionClass} border border-[var(--border-subtle)]`}>{captureBusy ? <><Loader2 className="h-3 w-3 animate-spin" />Capture…</> : "Ajouter au chat"}</button>
        </div>}
      </div>
      {pdfError && <div role="alert" className="z-30 shrink-0 bg-red-50 px-4 py-2 text-sm text-red-800">{pdfError}</div>}
      <div ref={scrollRef} onMouseUp={captureSelection} onKeyUp={captureSelection} className="relative min-h-0 flex-1 overflow-auto bg-[var(--surface-raised)]" data-pdf-scroll>
        {detecting && <div className="flex items-center gap-2 px-4 py-2 text-[12px] text-[var(--ink-500)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{providerLabel ?? "Le moteur IA"} prépare le document…</div>}
        <div className="flex min-w-fit flex-col items-center gap-7 px-6 py-8">
          {Array.from({ length: numPages }).map((_, i) => (
            <PdfPage key={i} pdfDoc={pdfDoc} pageNumber={i + 1} pdfWidth={pageDims[i]?.width ?? 595} pdfHeight={pageDims[i]?.height ?? 842} scale={scale} tags={tags.filter((t) => t.page === i)} activeTagId={activeTagId} onTagClick={onTagClick}
              captureMode={captureMode} captureBusy={captureBusy} captureRect={captureDraft?.pageIndex === i ? captureDraft.rect : null} onCaptureRect={(rect) => setCaptureDraft(rect ? { pageIndex: i, rect } : null)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PdfPage({
  captureMode, captureBusy, captureRect, onCaptureRect,
  pdfDoc,
  pageNumber,
  pdfWidth,
  pdfHeight,
  scale,
  tags,
  activeTagId,
  onTagClick,
}: {
  captureMode: boolean;
  captureBusy: boolean;
  captureRect: CaptureRect | null;
  onCaptureRect: (rect: CaptureRect | null) => void;
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
      {captureMode && <PdfCaptureOverlay rect={captureRect} onChange={onCaptureRect} busy={captureBusy} />}
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
