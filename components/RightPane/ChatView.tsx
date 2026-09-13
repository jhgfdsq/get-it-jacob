// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";

/**
 * Chat with the document.
 *
 * Sidebar: list of chats (most-recent first), "+ new" button. Main: open
 * thread with a tight ChatGPT-style input and tap-and-go shipping. We never
 * cap the visible history because chats are scoped per-doc and the codex
 * model receives a server-side excerpt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Send, MessageSquare, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatThread } from "@/lib/work-context-types";


export type SelectionRequest = { id: number; action: "discuss" | "explain"; text: string; pageIndex: number };
type Snapshot = { pageIndex: number; selection?: string };
type Props = { docId: string; pageIndex: number; selectionRequest?: SelectionRequest | null };

export default function ChatView({ docId, pageIndex, selectionRequest }: Props) {
  const [chats, setChats] = useState<ChatThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<Snapshot | null>(null);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [partial, setPartial] = useState("");
  const [status, setStatus] = useState("");
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<({ chatId: string; message: string; error: string } & Snapshot) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const seenSelection = useRef<number | undefined>(undefined);
  const messagesRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/${docId}`).then(async (r) => {
      if (!r.ok) throw new Error("Impossible de charger les conversations.");
      const j = await r.json() as { chats: ChatThread[] };
      if (!cancelled) { setChats(j.chats); setActiveId(j.chats[0]?.id ?? null); }
    }).catch((e) => { if (!cancelled) { setChats([]); setError(e.message); } });
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [docId]);

  useEffect(() => {
    if (!selectionRequest || seenSelection.current === selectionRequest.id) return;
    seenSelection.current = selectionRequest.id;
    setAttached({ pageIndex: selectionRequest.pageIndex, selection: selectionRequest.text });
    setDraft(selectionRequest.action === "explain" ? "Explique ce passage en détail, avec des exemples et le contexte du document." : "À propos de ce passage : ");
    draftRef.current?.focus();
  }, [selectionRequest]);

  const active = useMemo(() => chats?.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [active?.messages.length, partial, status, sending]);

  const makeChat = useCallback(async () => {
    const r = await fetch(`/api/chat/${docId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create" }) });
    const j = await r.json();
    if (!r.ok || !j.chat) throw new Error(j.error ?? "Impossible de créer la conversation.");
    const chat = j.chat as ChatThread;
    setChats((prev) => [chat, ...(prev ?? [])]); setActiveId(chat.id);
    return chat.id;
  }, [docId]);
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
    if (activeId === id) setActiveId(null);
  };

  const deliver = useCallback(async (chatId: string, message: string, snapshot: Snapshot) => {
    setSending(true); setSendingChatId(chatId); setFailed(null); setPartial(""); setStatus("Connexion…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const r = await fetch(`/api/chat/${docId}`, { method: "POST", signal: controller.signal,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", chatId, message, ...snapshot }) });
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
          setPartial(""); done = true;
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
      setFailed({ chatId, message, ...snapshot, error: controller.signal.aborted ? "Réponse arrêtée." : (e as Error).message });
    } finally { setSending(false); setStatus(""); busyRef.current = false; abortRef.current = null; }
  }, [docId]);

  const send = useCallback(async () => {
    const message = draft.trim(); if (!message || busyRef.current) return;
    busyRef.current = true; setSending(true); setError(null);
    // Snapshot before any asynchronous creation: scrolling afterwards never changes this turn.
    const snapshot = attached ?? { pageIndex };
    try {
      const chatId = activeId ?? await makeChat();
      const user = { role: "user" as const, content: message, ts: Date.now(), ...snapshot };
      setChats((prev) => prev?.map((c) => c.id === chatId ? { ...c, messages: [...c.messages, user], updatedAt: user.ts } : c) ?? []);
      setDraft(""); setAttached(null); await deliver(chatId, message, snapshot);
    } catch (e) { setError((e as Error).message); setSending(false); busyRef.current = false; }
  }, [draft, attached, pageIndex, activeId, makeChat, deliver]);
  const retry = () => { if (!failed || busyRef.current) return; busyRef.current = true; void deliver(failed.chatId, failed.message, { pageIndex: failed.pageIndex, selection: failed.selection }); };

  if (chats === null) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-[var(--ink-500)]">
        <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Chargement des conversations…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Chat list */}
      <aside className="flex w-32 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-canvas)]">
        <button
          type="button"
          onClick={createChat}
          disabled={creating || sending}
          className="m-2 flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-1.5 text-[12px] font-medium text-[var(--ink-900)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" /> Nouveau chat
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
                  onClick={() => setActiveId(c.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteChat(c.id)}
                  className="invisible h-5 w-5 shrink-0 rounded text-[var(--ink-400)] hover:bg-[var(--surface-sunken)] hover:text-rose-600 group-hover:visible"
                  title="Supprimer le chat"
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
              <div key={i}>{m.role === "user" && m.pageIndex !== undefined && <p className="mb-1 text-right text-[10px] text-[var(--ink-400)]">Page {m.pageIndex + 1} du PDF</p>}<Bubble role={m.role} content={m.content} /></div>
            ))}
            {sendingChatId === active.id && (partial || sending) && <Bubble role="assistant" content={partial || status || "…"} pulsing={!partial} />}
            {failed && failed.chatId === active.id && !sending && (
              <div className="mb-3 flex flex-col items-start gap-1.5">
                <p className="text-[11.5px] leading-relaxed text-rose-700 dark:text-rose-300">
                  {failed.error}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-900"
                >
                  <RefreshCw className="h-3 w-3" /> Réessayer (page {failed.pageIndex + 1})
                </button>
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
              disabled={sending || !draft.trim()}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-[var(--button-primary-bg)] text-white hover:bg-[var(--button-primary-hover)] disabled:opacity-40"
              title="Envoyer (Entrée)"
            >
              <Send className="h-4 w-4" />
            </button>}
          </div>
        </form>
      </section>
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
