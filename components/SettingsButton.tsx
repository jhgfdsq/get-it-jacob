// Modified for Get It Jacob: appearance and response preferences only.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";

export const SETTINGS_EVENT = "getit-settings";

export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [effort, setEffort] = useState("low");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingSave = useRef(false);
  const readVersion = useRef(0);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function load() {
    const version = ++readVersion.current;
    setLoading(true);
    setLoaded(false);
    setError("");
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const settings = await response.json();
      if (version !== readVersion.current) return;
      setTheme(settings.theme ?? "light");
      setEffort(settings.codexEffortFast ?? "low");
      setLoaded(true);
    } catch {
      if (version === readVersion.current) setError("Impossible de lire les réglages. Fermez puis rouvrez ce menu pour réessayer.");
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }

  async function save(values: Record<string, string>) {
    // One write at a time prevents older network responses from replacing a newer choice.
    if (pendingSave.current || loading || !loaded) return;
    pendingSave.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error();
      if (values.theme) {
        setTheme(values.theme);
        const dark = values.theme === "dark" || (values.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", dark);
      }
      if (values.codexEffortFast) setEffort(values.codexEffortFast);
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: values }));
    } catch {
      setError("Le réglage n’a pas été enregistré. Votre choix précédent est conservé.");
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }

  const disabled = loading || saving || !loaded;
  const selectClass = "w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-sm disabled:cursor-wait disabled:opacity-50";

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          if (!open && !pendingSave.current) void load();
          setOpen(!open);
        }}
        title="Réglages"
        aria-label="Réglages"
        aria-expanded={open}
        aria-controls={panelId}
        className="rounded-md p-2 text-[var(--ink-500)] hover:bg-[var(--surface-sunken)]"
      ><Settings2 className="h-4 w-4" /></button>
      {open && (
        <div id={panelId} role="region" aria-label="Réglages" className="absolute right-0 top-full z-[70] mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between text-sm font-semibold">
            Réglages
            <button type="button" aria-label="Fermer les réglages" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="rounded p-1 hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
          </div>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs text-[var(--ink-600)]">Apparence</span>
            <select aria-label="Apparence" disabled={disabled} value={theme} onChange={event => void save({ theme: event.target.value })} className={selectClass}>
              <option value="light">Claire</option><option value="dark">Sombre</option><option value="system">Comme le Mac</option>
            </select>
          </label>
          <label className="mb-2 block">
            <span className="mb-1 block text-xs text-[var(--ink-600)]">Réponses du chat</span>
            <select aria-label="Réponses du chat" disabled={disabled} value={effort} onChange={event => void save({ codexEffortFast: event.target.value })} className={selectClass}>
              <option value="low">Rapides</option><option value="medium">Équilibrées</option><option value="high">Approfondies</option>
            </select>
          </label>
          <p className="text-xs leading-relaxed text-[var(--ink-500)]">Les réponses approfondies peuvent prendre plus de temps. Les changements sont enregistrés automatiquement.</p>
          {(loading || saving) && <p role="status" className="mt-3 text-xs text-[var(--ink-500)]">{loading ? "Chargement…" : "Enregistrement…"}</p>}
          {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
