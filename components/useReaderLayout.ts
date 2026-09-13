// Modified September 2026 for Get It Jacob; see NOTICE.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
type Layout = { readerPdfPercent: number; readerChatListVisible: boolean };
export default function useReaderLayout() {
  const [layout, setLayout] = useState<Layout>({ readerPdfPercent: 54, readerChatListVisible: true });
  const [error, setError] = useState<string | null>(null);
  const touched = useRef(new Set<keyof Layout>());
  const queue = useRef<{ pending: Partial<Layout>; running: boolean }>({ pending: {}, running: false });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings").then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(saved => {
      if (cancelled) return;
      setLayout(current => ({ readerPdfPercent: !touched.current.has("readerPdfPercent") && typeof saved.readerPdfPercent === "number" ? saved.readerPdfPercent : current.readerPdfPercent, readerChatListVisible: !touched.current.has("readerChatListVisible") && typeof saved.readerChatListVisible === "boolean" ? saved.readerChatListVisible : current.readerChatListVisible }));
    }).catch(() => { /* Layout remains usable with its defaults. */ });
    return () => { cancelled = true; };
  }, []);
  const update = useCallback((values: Partial<Layout>, save = true) => {
    for (const key of Object.keys(values) as (keyof Layout)[]) touched.current.add(key);
    setLayout(current => ({ ...current, ...values }));
    if (!save) return;
    queue.current.pending = { ...queue.current.pending, ...values };
    if (queue.current.running) return;
    queue.current.running = true;
    void (async () => {
      try {
        while (Object.keys(queue.current.pending).length) {
          const body = queue.current.pending; queue.current.pending = {};
          const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
          if (!response.ok) throw new Error();
        }
        setError(null);
      } catch { setError("La disposition n’a pas été enregistrée. Ajustez-la à nouveau pour réessayer."); }
      finally { queue.current.running = false; }
    })();
  }, []);
  return { ...layout, update, error };
}
