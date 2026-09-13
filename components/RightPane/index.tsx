// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";
import { MessageSquare, ChartNoAxesCombined, PanelLeft } from "lucide-react";
import ChatView, { type CaptureRequest, type SelectionRequest } from "./ChatView";
import ManualVisual, { type VisualRequest } from "./ManualVisual";
export type RightPaneMode = "chat" | "visualizer";
type Props = { chatListVisible?: boolean; onChatListToggle?: () => void; docId: string; mode: RightPaneMode; onModeChange: (mode: RightPaneMode) => void; pageIndex: number; selectionRequest?: SelectionRequest | null; visualRequest?: VisualRequest | null; ready: boolean; captureRequests?: CaptureRequest[]; onCapturesConsumed?: (ids: string[]) => void };
export default function RightPane({ chatListVisible = true, onChatListToggle, docId, mode, onModeChange, pageIndex, selectionRequest, visualRequest, ready, captureRequests, onCapturesConsumed }: Props) {
  return <div className="flex h-full flex-col bg-[var(--surface-raised)]">
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2">
      <button type="button" onClick={() => { onChatListToggle?.(); onModeChange("chat"); }} aria-label={chatListVisible ? "Masquer les discussions" : "Afficher les discussions"} title={chatListVisible ? "Masquer les discussions" : "Afficher les discussions"} aria-expanded={chatListVisible} aria-controls="reader-chat-list" className="shrink-0 rounded-md p-1.5 text-[var(--ink-500)] hover:bg-[var(--surface-sunken)]"><PanelLeft className="h-4 w-4" /></button>
      {([['chat', 'Chat', MessageSquare], ['visualizer', 'Visuels', ChartNoAxesCombined]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => onModeChange(id)} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium ${mode === id ? "border-[var(--accent-100)] bg-[var(--accent-50)] text-[var(--accent-700)]" : "border-[var(--border-subtle)] text-[var(--ink-900)]"}`}><Icon className="h-3 w-3" />{label}</button>)}
    </header>
    {!ready ? <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--ink-500)]">La préparation initiale donne au chat le contexte de toutes les pages. Vous pouvez déjà parcourir le PDF.</div> : <>
      <div className={`min-h-0 flex-1 ${mode !== "chat" ? "hidden" : ""}`}><ChatView chatListVisible={chatListVisible} key={docId} docId={docId} pageIndex={pageIndex} selectionRequest={selectionRequest} captureRequests={captureRequests} onCapturesConsumed={onCapturesConsumed} /></div>
      <div className={`min-h-0 flex-1 ${mode !== "visualizer" ? "hidden" : ""}`}><ManualVisual docId={docId} request={visualRequest} /></div>
    </>}
  </div>;
}
