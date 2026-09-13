// Modified for Get It Jacob: preferences without background generation.
"use client";
import { useEffect, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";
export const SETTINGS_EVENT = "getit-settings";
export default function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [effort, setEffort] = useState("low");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    fetch("/api/settings").then(r => r.json()).then(s => {setTheme(s.theme ?? "light"); setEffort(s.codexEffortFast ?? "low");}).catch(() => setError("Impossible de lire les réglages."));
    const close = (e: MouseEvent) => {if (!root.current?.contains(e.target as Node)) setOpen(false);};
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  async function save(values: Record<string, string>) {
    setError("");
    try {
      const r = await fetch("/api/settings", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(values)});
      if (!r.ok) throw new Error();
      if (values.theme) {
        setTheme(values.theme);
        const dark = values.theme === "dark" || (values.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", dark);
      }
      if (values.codexEffortFast) setEffort(values.codexEffortFast);
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, {detail:values}));
    } catch {setError("Le réglage n’a pas été enregistré.");}
  }
  return <div ref={root} className="relative">
    <button onClick={() => setOpen(!open)} title="Réglages" aria-label="Réglages" className="rounded-md p-2 text-[var(--ink-500)] hover:bg-[var(--surface-sunken)]"><Settings2 className="h-4 w-4" /></button>
    {open && <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-xl">
      <div className="mb-4 flex justify-between text-sm font-semibold">Réglages<button aria-label="Fermer les réglages" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
      <label className="mb-1 block text-xs text-[var(--ink-600)]">Apparence</label>
      <select aria-label="Apparence" value={theme} onChange={e => void save({theme:e.target.value})} className="mb-4 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-sm"><option value="light">Claire</option><option value="dark">Sombre</option><option value="system">Comme le Mac</option></select>
      <label className="mb-1 block text-xs text-[var(--ink-600)]">Réponses du chat</label>
      <select aria-label="Réponses du chat" value={effort} onChange={e => void save({codexEffortFast:e.target.value})} className="mb-4 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-2 text-sm"><option value="low">Rapides</option><option value="medium">Équilibrées</option><option value="high">Approfondies</option></select>
      <p className="text-xs leading-relaxed text-[var(--ink-500)]">Connexion ChatGPT. Le PDF est préparé une fois à l’import. Ensuite, le chat et les visuels répondent uniquement à vos demandes.</p>
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    </div>}
  </div>;
}
