// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, RefreshCw, AlertCircle, Upload, BookOpen } from "lucide-react";
import ReaderSplit from "@/components/ReaderSplit";
import useReaderLayout from "@/components/useReaderLayout";
import PdfViewer from "@/components/PdfViewer";
import RightPane, { type RightPaneMode } from "@/components/RightPane";
import type { CaptureRequest, SelectionRequest } from "@/components/RightPane/ChatView";
import type { VisualRequest } from "@/components/RightPane/ManualVisual";
import AccountButton from "@/components/AccountButton";
import SettingsButton from "@/components/SettingsButton";

type DocMeta = { docId: string; filename: string; pdfUrl: string; numPages: number; pages: Array<{ pageIndex: number; width: number; height: number; text: string }> };
type Preparation = { status: "missing" | "preparing" | "ready" | "error"; completedPages: number; totalPages: number; phase?: "pages" | "context"; error?: string };

export default function ViewerClient({ docId }: { docId: string }) {
  const layout = useReaderLayout();
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<RightPaneMode>("chat");
  const [selection, setSelection] = useState<SelectionRequest | null>(null);
  const [visual, setVisual] = useState<VisualRequest | null>(null);
  const [captureRequests, setCaptureRequests] = useState<CaptureRequest[]>([]);
  const consumeCaptures = useCallback((ids: string[]) => setCaptureRequests(items => items.filter(item => !ids.includes(item.id))), []);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/doc/${docId}`).then(async (r) => { if (!r.ok) throw new Error("Document introuvable."); const j = await r.json(); if (!cancelled) setMeta(j); }).catch((e) => { if (!cancelled) setError(e.message); });
    // Updating local library recency does not trigger an AI task.
    void fetch(`/api/doc/${docId}/touch`, { method: "POST" });
    return () => { cancelled = true; };
  }, [docId]);
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const r = await fetch(`/api/preparation/${docId}`, { cache: "no-store" });
        if (!r.ok) throw new Error("État de préparation indisponible.");
        const j = await r.json() as Preparation;
        if (cancelled) return;
        setPreparation(j);
        if (j.status === "preparing") timer = setTimeout(read, 1500);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
    };
    void read(); return () => { cancelled = true; clearTimeout(timer); };
  }, [docId, starting]);
  const prepare = async () => {
    setStarting(true); setError(null);
    try { const r = await fetch(`/api/preparation/${docId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resume" }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "La préparation n’a pas démarré."); setPreparation(j); }
    catch (e) { setError((e as Error).message); } finally { setStarting(false); }
  };
  if (!meta) return <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-[var(--ink-500)]">{error ? <><AlertCircle className="h-4 w-4" />{error}<Link href="/library">Bibliothèque</Link></> : <><RefreshCw className="h-4 w-4 animate-spin" />Chargement du document…</>}</div>;
  return <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-canvas)]">
    <div className="tab-bar tab-bar--fused shrink-0">
      <Link href="/" className="tab-item"><Upload className="h-3.5 w-3.5 text-[var(--ink-400)]" /><span>Importer</span></Link>
      <Link href="/library" className="tab-item"><BookOpen className="h-3.5 w-3.5 text-[var(--ink-400)]" /><span>Bibliothèque</span></Link>
      <div className="tab-item" data-active="true"><FileText className="h-3.5 w-3.5 text-[var(--accent-600)]" /><span className="max-w-[200px] truncate" title={meta.filename}>{meta.filename}</span></div>
      <div className="ml-auto flex items-center gap-2 pr-1"><span className="text-[11px] text-[var(--ink-500)]">{preparation?.status === "ready" ? `${meta.numPages} pages préparées` : "Préparation du document"}</span><SettingsButton /><AccountButton /></div>
    </div>
    {preparation?.status !== "ready" && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--ink-700)]"><p>{preparation?.status === "preparing" ? (preparation.phase === "context" ? "Texte et images indexés. Chargement unique du contexte du chat…" : `Indexation locale : ${preparation.completedPages} / ${preparation.totalPages} pages. Le chat sera disponible à la fin.`) : preparation?.error ?? "Ce document doit être préparé une fois avant de discuter de son contenu et de ses figures."}</p>{preparation && preparation.status !== "preparing" && <button type="button" onClick={prepare} disabled={starting} className="rounded-md bg-[var(--button-primary-bg)] px-3 py-2 text-white">{starting ? "Démarrage…" : "Préparer le document"}</button>}</div>}
    {error && <p role="alert" className="px-4 py-2 text-xs text-red-700">{error}</p>}
    {layout.error && <p role="alert" className="px-4 text-xs text-red-700">{layout.error}</p>}
    <ReaderSplit percent={layout.readerPdfPercent} onChange={(value, save) => layout.update({ readerPdfPercent: value }, save)} left={
        <PdfViewer key={docId} pdfUrl={meta.pdfUrl} numPages={meta.numPages} pageDims={meta.pages} tags={[]} activeTagId={null} onTagClick={() => {}} onPageChange={setPageIndex} onCapture={capture => { setCaptureRequests(items => [...items, { ...capture, id: crypto.randomUUID() }]); setMode("chat"); }} onSelectionAction={(action, passage) => {
          if (action === "discuss" || action === "explain") { setSelection({ id: Date.now(), action, ...passage }); setMode("chat"); }
          else { setVisual({ id: Date.now(), kind: action, ...passage }); setMode("visualizer"); }
        }} />
      } right={
        <RightPane docId={docId} mode={mode} onModeChange={setMode} pageIndex={pageIndex} selectionRequest={selection} visualRequest={visual} ready={preparation?.status === "ready"} captureRequests={captureRequests} onCapturesConsumed={consumeCaptures} chatListVisible={layout.readerChatListVisible} onChatListToggle={() => layout.update({ readerChatListVisible: !layout.readerChatListVisible })} />
      } />
  </div>;
}
