// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";
/* eslint-disable @next/next/no-img-element -- Local PDF crops need direct previews, without an image-optimization request. */

/**
 * Chat with the document.
 *
 * Sidebar: list of chats (most-recent first), "+ new" button. Main: open
 * thread with a tight ChatGPT-style input and tap-and-go shipping. We never
 * cap the visible history because chats are scoped per-doc and the codex
 * model receives a server-side excerpt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Send, MessageSquare, RefreshCw, X, ImagePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatThread } from "@/lib/work-context-types";
import { MAX_CAPTURES_PER_MESSAGE, type CaptureAttachment, type CaptureSource } from "@/lib/capture-types";


export type SelectionRequest = { id: number; action: "discuss" | "explain"; text: string; pageIndex: number };
export type CaptureRequest = CaptureSource & { id: string };
type Snapshot = { pageIndex: number; selection?: string; captures?: CaptureAttachment[]; requestId?: string };
type PendingCapture = { key: string; source?: CaptureSource; attachment?: CaptureAttachment; busy?: boolean; error?: string };
type Draft = { text: string; attached: Snapshot | null; captures: PendingCapture[] };
type PendingTurn = Snapshot & { chatId: string; message: string; error?: string };
const emptyDraft = (): Draft => ({ text: "", attached: null, captures: [] });
type Props = { docId: string; pageIndex: number; selectionRequest?: SelectionRequest | null; captureRequests?: CaptureRequest[]; onCapturesConsumed?: (ids: string[]) => void };

export default function ChatView({ docId, pageIndex, selectionRequest, captureRequests, onCapturesConsumed }: Props) {
  const [chats, setChats] = useState<ChatThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftKey = activeId ?? "new";
  const currentDraft = drafts[draftKey] ?? emptyDraft();
  const draft = currentDraft.text;
  const attached = currentDraft.attached;
  const captures = currentDraft.captures;
  const patchDraft = useCallback((key: string, update: (value: Draft) => Draft) => setDrafts(all => ({ ...all, [key]: update(all[key] ?? emptyDraft()) })), []);
  const setDraft = (text: string) => patchDraft(draftKey, value => ({ ...value, text }));
  const setAttached = (attached: Snapshot | null) => patchDraft(draftKey, value => ({ ...value, attached }));
  const [preview, setPreview] = useState<CaptureAttachment | null>(null);
  const seenCaptures = useRef(new Set<string>());
  const uploading = useRef(false);
  const storageLoaded = useRef(false);
  const draftWrite = useRef<{ running: boolean; pending: string | null }>({ running: false, pending: null });
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [partial, setPartial] = useState("");
  const [status, setStatus] = useState("");
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<Record<string, PendingTurn>>({});
  const failed = activeId ? outbox[activeId] ?? null : null;
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const seenSelection = useRef<number | undefined>(undefined);
  const messagesRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [r, savedResponse] = await Promise.all([fetch(`/api/chat/${docId}`), fetch(`/api/chat/${docId}/drafts`)]);
        if (!r.ok) throw new Error("Impossible de charger les conversations.");
        if (!savedResponse.ok) throw new Error("Impossible de charger les brouillons. Rechargez le document pour les retrouver.");
        const j = await r.json() as { chats: ChatThread[] };
        const saved = await savedResponse.json() as { drafts: Record<string, Draft>; outbox: Record<string, PendingTurn> };
        if (cancelled) return;
        setDrafts(saved.drafts);
        setOutbox(Object.fromEntries(Object.entries(saved.outbox).map(([key, value]) => [key, { ...value, error: value.error ?? "Envoi interrompu. Votre question et ses captures sont conservées." }])));
        storageLoaded.current = true;
        setChats(j.chats); setActiveId(j.chats[0]?.id ?? null);
      } catch (e) { if (!cancelled) { setChats([]); setError((e as Error).message); } }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [docId]);

  useEffect(() => {
    if (!storageLoaded.current) return;
    // Save only authoritative image references. The server-side file survives
    // a restart even when the desktop's local HTTP port changes.
    const saved = Object.fromEntries(Object.entries(drafts).map(([key, value]) => [key, { ...value, captures: value.captures.filter(c => c.attachment).map(c => ({ key: c.key, attachment: c.attachment })) }]));
    draftWrite.current.pending = JSON.stringify({ drafts: saved, outbox });
    if (draftWrite.current.running) return;
    draftWrite.current.running = true;
    void (async () => {
      try {
        while (draftWrite.current.pending !== null) {
          const body = draftWrite.current.pending;
          draftWrite.current.pending = null;
          const response = await fetch(`/api/chat/${docId}/drafts`, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60_000 });
          if (!response.ok) throw new Error("Le brouillon n’a pas été sauvegardé. Gardez ce document ouvert et réessayez.");
        }
        setDraftSaveError(null);
      } catch (e) { setDraftSaveError((e as Error).message); }
      finally { draftWrite.current.running = false; }
    })();
  }, [drafts, outbox, docId]);

  useEffect(() => {
    if (!selectionRequest || chats === null || seenSelection.current === selectionRequest.id) return;
    seenSelection.current = selectionRequest.id;
    patchDraft(draftKey, value => ({ ...value, attached: { pageIndex: selectionRequest.pageIndex, selection: selectionRequest.text }, text: value.text || (selectionRequest.action === "explain" ? "Explique ce passage en détail, avec des exemples et le contexte du document." : "") }));
    draftRef.current?.focus();
  }, [selectionRequest, chats, draftKey, patchDraft]);

  useEffect(() => {
    if (chats === null || !captureRequests?.length) return;
    const fresh = captureRequests.filter(item => !seenCaptures.current.has(item.id));
    if (!fresh.length) return;
    fresh.forEach(item => seenCaptures.current.add(item.id));
    patchDraft(draftKey, value => ({ ...value, captures: [...value.captures, ...fresh.map(({ id, ...source }) => ({ key: id, source }))] }));
    onCapturesConsumed?.(fresh.map(item => item.id));
  }, [captureRequests, chats, draftKey, onCapturesConsumed, patchDraft]);

  useEffect(() => {
    if (uploading.current) return;
    for (const [key, value] of Object.entries(drafts)) {
      const next = value.captures.find(item => item.source && !item.attachment && !item.error && !item.busy);
      if (!next) continue;
      uploading.current = true;
      patchDraft(key, draft => ({ ...draft, captures: draft.captures.map(item => item.key === next.key ? { ...item, busy: true } : item) }));
      void (async () => {
        try {
          const r = await fetch(`/api/captures/${docId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next.source) });
          const data = await r.json(); if (!r.ok || !data.capture) throw new Error(data.error ?? "La capture n’a pas été ajoutée.");
          patchDraft(key, draft => ({ ...draft, captures: draft.captures.map(item => item.key === next.key ? { key: item.key, attachment: data.capture } : item) }));
        } catch (e) {
          patchDraft(key, draft => ({ ...draft, captures: draft.captures.map(item => item.key === next.key ? { ...item, busy: false, error: (e as Error).message } : item) }));
        } finally { uploading.current = false; }
      })();
      break;
    }
  }, [drafts, docId, patchDraft]);

  useEffect(() => {
    if (!preview) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [preview]);

  const active = useMemo(() => chats?.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [active?.messages.length, partial, status, sending]);

  const makeChat = useCallback(async () => {
    const r = await fetch(`/api/chat/${docId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create" }) });
    const j = await r.json();
    if (!r.ok || !j.chat) throw new Error(j.error ?? "Impossible de créer la conversation.");
    const chat = j.chat as ChatThread;
    if (activeId === null) setDrafts(all => ({ ...all, [chat.id]: all.new ?? emptyDraft(), new: emptyDraft() }));
    setChats((prev) => [chat, ...(prev ?? [])]); setActiveId(chat.id);
    return chat.id;
  }, [docId, activeId]);
  const createChat = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setCreating(true); setError(null);
    try { await makeChat(); } catch (e) { setError((e as Error).message); } finally { setCreating(false); busyRef.current = false; }
  };
  const deleteChat = async (id: string) => {
    if (sending || !window.confirm("Supprimer cette conversation ?")) return;
    const r = await fetch(`/api/chat/${docId}?chatId=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) { setError("Impossible de supprimer la conversation."); return; }
    setChats((prev) => prev?.filter((c) => c.id !== id) ?? []);
    setDrafts(all => { const next = { ...all }; delete next[id]; return next; });
    setOutbox(all => { const next = { ...all }; delete next[id]; return next; });
    if (activeId === id) setActiveId(null);
  };

  const deliver = useCallback(async (chatId: string, message: string, snapshot: Snapshot) => {
    setSending(true); setSendingChatId(chatId); setOutbox(all => ({ ...all, [chatId]: { chatId, message, ...snapshot } })); setPartial(""); setStatus("Connexion…");
    const controller = new AbortController(); abortRef.current = controller;
    let delivered = false;
    try {
      const r = await fetch(`/api/chat/${docId}`, { method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", chatId, message, pageIndex: snapshot.pageIndex, selection: snapshot.selection, captureIds: snapshot.captures?.map(c => c.id) ?? [], requestId: snapshot.requestId }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `Erreur ${r.status}`); }
      if (!r.body) throw new Error("Flux de réponse indisponible.");
      const reader = r.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let done = false;
      const event = (raw: string) => {
        const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
        if (!data) return;
        const item = JSON.parse(data);
        if (item.type === "error") throw new Error(item.error ?? "La réponse a échoué.");
        if (item.type === "status") setStatus(item.text);
        if (item.type === "text") { setPartial(item.text); setStatus(""); }
        if (item.type === "done") {
          if (!item.chat) throw new Error("Conversation absente de la réponse.");
          setChats((prev) => prev?.map((c) => c.id === chatId ? item.chat : c) ?? [item.chat]);
          setPartial(""); done = true; delivered = true;
          setOutbox(all => { const next = { ...all }; delete next[chatId]; return next; });
        }
      };
      while (true) {
        const chunk = await reader.read(); buffer += decoder.decode(chunk.value, { stream: !chunk.done }).replace(/\r\n/g, "\n");
        let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) { const raw = buffer.slice(0, split); buffer = buffer.slice(split + 2); event(raw); }
        if (chunk.done) break;
      }
      if (buffer.trim()) event(buffer);
      if (!done) throw new Error("La connexion a été interrompue avant la fin de la réponse.");
    } catch (e) {
      if (!delivered) setOutbox(all => ({ ...all, [chatId]: { chatId, message, ...snapshot, error: controller.signal.aborted ? "Réponse arrêtée. Votre question et ses captures sont conservées." : (e as Error).message } }));
    } finally { setSending(false); setStatus(""); busyRef.current = false; abortRef.current = null; }
  }, [docId]);

  const send = useCallback(async () => {
    const message = draft.trim(); if (!message || busyRef.current || outbox[draftKey] || captures.length > MAX_CAPTURES_PER_MESSAGE || captures.some(c => !c.attachment)) return;
    busyRef.current = true; setSending(true); setError(null);
    // Snapshot before any asynchronous creation: scrolling afterwards never changes this turn.
    const snapshot: Snapshot = { ...(attached ?? { pageIndex }), captures: captures.map(c => c.attachment!), requestId: crypto.randomUUID() };
    const sentKeys = new Set(captures.map(c => c.key));
    try {
      const chatId = activeId ?? await makeChat();
      const user = { role: "user" as const, content: message, ts: Date.now(), ...snapshot };
      setChats((prev) => prev?.map((c) => c.id === chatId ? { ...c, messages: [...c.messages, user], updatedAt: user.ts } : c) ?? []);
      patchDraft(chatId, value => ({ ...value, text: value.text === draft ? "" : value.text, attached: value.attached === attached ? null : value.attached, captures: value.captures.filter(c => !sentKeys.has(c.key)) })); await deliver(chatId, message, snapshot);
    } catch (e) { setError((e as Error).message); setSending(false); busyRef.current = false; }
  }, [draft, attached, captures, outbox, draftKey, patchDraft, pageIndex, activeId, makeChat, deliver]);
  const retry = () => { if (!failed || busyRef.current) return; busyRef.current = true; void deliver(failed.chatId, failed.message, { pageIndex: failed.pageIndex, selection: failed.selection, captures: failed.captures, requestId: failed.requestId }); };

  if (chats === null) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--ink-500)]">
        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Chargement des conversations…
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* Chat list */}
      <aside className="flex w-32 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-canvas)]">
        <button
          type="button"
          onClick={createChat}
          disabled={creating || sending}
          className="m-2 flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1.5 text-[12px] font-medium text-[var(--ink-900)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle discussion
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {chats.length === 0 ? (
            <p className="px-2 py-3 text-[11.5px] leading-relaxed text-[var(--ink-400)]">
              Vos conversations sur ce PDF apparaîtront ici.
            </p>
          ) : (
            chats.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] ${
                  activeId === c.id
                    ? "bg-[var(--surface-raised)] text-[var(--ink-900)] shadow-[var(--shadow-nav)]"
                    : "text-[var(--ink-700)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => { setActiveId(c.id); setError(null); }}
                  className="min-w-0 flex-1 truncate text-left"
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteChat(c.id)}
                  className="invisible h-5 w-5 shrink-0 rounded text-[var(--ink-400)] hover:bg-[var(--surface-sunken)] hover:text-rose-600 group-hover:visible"
                  title="Supprimer la discussion" aria-label={`Supprimer la discussion ${c.title}`}
                >
                  <Trash2 className="m-auto h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Active thread */}
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--surface-raised)]">
        {!active ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <div className="max-w-sm">
              <MessageSquare className="mx-auto mb-3 h-7 w-7 text-[var(--ink-400)]" />
              <p className="text-[13.5px] leading-relaxed text-[var(--ink-500)]">
                Posez une question sur le document ou sur la page consultée. Chaque conversation est sauvegardée. Sélectionnez un passage du PDF pour préciser votre demande.
              </p>
            </div>
          </div>
        ) : (
          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {active.messages.length === 0 && (
              <p className="text-center text-[12px] text-[var(--ink-400)]">
                Posez votre première question ci-dessous.
              </p>
            )}
            {active.messages.map((m, i) => (
              <div key={i}>{m.role === "user" && m.pageIndex !== undefined && <p className="mb-1 text-right text-[10px] text-[var(--ink-400)]">Page {m.pageIndex + 1} du PDF</p>}{m.captures?.length ? <div className="mb-2 flex flex-wrap justify-end gap-2">{m.captures.map(c => <CaptureThumb key={c.id} capture={c} onPreview={() => setPreview(c)} />)}</div> : null}<Bubble role={m.role} content={m.content} /></div>
            ))}
            {sendingChatId === active.id && (partial || sending) && <Bubble role="assistant" content={partial || status || "…"} pulsing={!partial} />}
            {failed && failed.chatId === active.id && !sending && (
              <div className="mb-3 flex flex-col items-start gap-1.5">
                <p className="text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300">
                  {failed.error}
                </p>
                <p className="line-clamp-2 text-xs text-[var(--ink-700)]">{failed.message}</p>
                {!!failed.captures?.length && <div className="flex flex-wrap gap-2">{failed.captures.map(c => <CaptureThumb key={c.id} capture={c} onPreview={() => setPreview(c)} />)}</div>}
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900"
                >
                  <RefreshCw className="h-3 w-3" /> Réessayer (page {failed.pageIndex + 1})
                </button>
                <button type="button" className="text-xs underline text-[var(--ink-600)]" onClick={() => {
                  patchDraft(failed.chatId, value => ({ ...value, text: [failed.message, value.text].filter(Boolean).join("\n\n"), attached: { pageIndex: failed.pageIndex, selection: failed.selection }, captures: [...(failed.captures ?? []).filter(c => !value.captures.some(item => item.attachment?.id === c.id)).map(c => ({ key: c.id, attachment: c })), ...value.captures] }));
                  setOutbox(all => { const next = { ...all }; delete next[failed.chatId]; return next; });
                }}>Reprendre dans le brouillon</button>
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--ink-500)]"><span data-testid="page-context">Contexte : page {pageIndex + 1} du PDF</span>{sending && <span className="ml-auto">{status || "Réponse en cours…"}</span>}</div>
          {attached?.selection && <div className="mb-2 rounded-md bg-[var(--surface-sunken)] p-2 text-[11px] text-[var(--ink-700)]"><button type="button" onClick={() => setAttached(null)} className="float-right px-1" aria-label="Retirer le passage">×</button><span>Passage sélectionné · page {attached.pageIndex + 1}</span><p className="mt-1 line-clamp-3">{attached.selection}</p></div>}
          {captures.length > 0 && <div className="mb-2 max-h-44 overflow-y-auto" aria-label="Captures jointes au brouillon" data-testid="capture-draft">
            <p className="mb-2 text-[11px] text-[var(--ink-500)]">{captures.length} capture{captures.length > 1 ? "s" : ""} · envoi avec votre prochaine question</p>
            <>{captures.length > MAX_CAPTURES_PER_MESSAGE && <p role="alert" className="mb-2 text-xs text-red-700">Joignez au maximum {MAX_CAPTURES_PER_MESSAGE} captures par message. Retirez les captures en trop avant l’envoi.</p>}</><div className="flex flex-wrap gap-2">{captures.map(item => <div key={item.key} className="relative">
              {item.attachment ? <CaptureThumb capture={item.attachment} onPreview={() => setPreview(item.attachment!)} onRemove={() => patchDraft(draftKey, value => ({ ...value, captures: value.captures.filter(c => c.key !== item.key) }))} /> : <div className="w-32 rounded-lg border border-[var(--border-subtle)] p-2 text-[10px]">
                {item.source && <img src={item.source.dataUrl} alt="Capture en cours d’ajout" className="h-14 w-full rounded object-contain" />}
                <span>{item.error ? "Ajout impossible" : "Ajout de la capture…"}</span>
                {item.error && <><p role="alert" className="text-red-700">{item.error}</p><button type="button" onClick={() => patchDraft(draftKey, value => ({ ...value, captures: value.captures.map(c => c.key === item.key ? { ...c, error: undefined } : c) }))} className="mt-1 underline">Réessayer l’ajout</button></>}
                <button type="button" aria-label="Retirer la capture en attente" onClick={() => patchDraft(draftKey, value => ({ ...value, captures: value.captures.filter(c => c.key !== item.key) }))} className="absolute -right-1 -top-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1"><X className="h-3 w-3" /></button>
              </div>}
            </div>)}</div>
          </div>}
          {draftSaveError && <p role="alert" className="mb-2 text-xs text-red-700">{draftSaveError} <button type="button" className="underline" onClick={() => setDrafts(all => ({ ...all }))}>Réessayer la sauvegarde</button></p>}
          {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Que souhaitez-vous comprendre ?"
              rows={2}
              className="min-h-[44px] flex-1 resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-900)] focus:border-[var(--accent-500)] focus:outline-none"
              disabled={sending}
            />
            {sending ? <button type="button" onClick={() => abortRef.current?.abort()} className="h-[44px] rounded-md border border-[var(--border-subtle)] px-3 text-xs text-[var(--ink-900)]">Arrêter</button> : <button
              type="submit"
              disabled={sending || !!failed || !draft.trim() || captures.length > MAX_CAPTURES_PER_MESSAGE || captures.some(c => !c.attachment)}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-[var(--button-primary-bg)] text-white hover:bg-[var(--button-primary-hover)] disabled:opacity-40"
              title="Envoyer (Entrée)"
            >
              <Send className="h-4 w-4" />
            </button>}
          </div>
        </form>
      </section>
      {preview && <div role="dialog" aria-modal="true" aria-label={preview.name} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-8" onClick={() => setPreview(null)}>
        <div className="flex max-h-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-6 p-3 text-sm"><span>{preview.name} · page {preview.pageIndex + 1}</span><button type="button" autoFocus aria-label="Fermer l’aperçu" onClick={() => setPreview(null)} className="rounded p-1 hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button></div>
          <div className="min-h-0 overflow-auto p-3 pt-0"><img src={preview.url} alt={preview.name} width={preview.width} height={preview.height} className="max-h-[75vh] w-auto max-w-full object-contain" /></div>
        </div>
      </div>}
    </div>
  );
}

function Bubble({
  role,
  content,
  pulsing,
}: {
  role: "user" | "assistant";
  content: string;
  pulsing?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-[var(--button-primary-bg)] text-white"
            : "bg-[var(--surface-sunken)] text-[var(--ink-900)]"
        } whitespace-pre-wrap ${pulsing ? "animate-pulse" : ""}`}
      >
        {pulsing ? (
          content
        ) : (
          <ReactMarkdown
            disallowedElements={["img"]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="mb-1 list-disc pl-4 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="mb-1 list-decimal pl-4 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="mb-0.5 last:mb-0">{children}</li>,
              pre: ({ children }) => (
                <pre className="mb-2 mt-1 overflow-x-auto rounded-md bg-[var(--border-subtle)] p-3 last:mb-0">
                  {children}
                </pre>
              ),
              code: ({ className, children, node, ...props }) => {
                void node;
                const text = String(children);
                const isInline = !className && !text.includes("\n");
                return isInline ? (
                  <code className="rounded bg-[var(--border-subtle)] px-1 py-0.5 text-[12px]" {...props}>
                    {children}
                  </code>
                ) : (
                  <code className={`${className ?? ""} text-[12px]`} {...props}>
                    {children}
                  </code>
                );
              },
              a: ({ children, href }) => {
                const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
                return (
                  <a href={safe} className="underline underline-offset-2 hover:opacity-80" target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

function CaptureThumb({ capture, onPreview, onRemove }: { capture: CaptureAttachment; onPreview: () => void; onRemove?: () => void }) {
  return <div className="relative w-32 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-1.5">
    <button type="button" aria-label={`Agrandir ${capture.name}`} onClick={onPreview} className="block w-full text-left">
      <img src={capture.url} alt={capture.name} className="h-14 w-full rounded bg-white object-contain" />
      <span className="mt-1 flex items-center gap-1 text-[10px] text-[var(--ink-700)]"><ImagePlus className="h-3 w-3 shrink-0" /><span className="truncate">{capture.name}</span></span>
      <span className="text-[9px] text-[var(--ink-500)]">Page {capture.pageIndex + 1}</span>
    </button>
    {onRemove && <button type="button" onClick={onRemove} aria-label={`Retirer ${capture.name}`} className="absolute -right-1 -top-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1 text-[var(--ink-600)] hover:text-red-700"><X className="h-3 w-3" /></button>}
  </div>;
}
