// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";

// Connection and usage live here; appearance and response preferences live in Settings.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CircleUserRound,
  LogOut,
  RefreshCw,
  User as UserIcon,
  XCircle,
  ExternalLink,
  Settings2,
  Gauge,
  X,
} from "lucide-react";

import type { ProviderName } from "@/lib/provider-types";

type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
  since: number | null;
  updatedAt: number | null;
};

type RateWindow = {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number | null;
} | null;

type ProviderStatus = {
  provider: ProviderName;
  label: string;
  docsUrl: string;
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  authMode: "account" | "apiKey" | null;
  /** True only for Codex on a ChatGPT login (5h/weekly limits); everything
   *  else shows daily token usage. */
  exposesLimits?: boolean;
  account: {
    email: string | null;
    name: string | null;
    planType: string | null;
  } | null;
  rateLimits: {
    primary: RateWindow;
    secondary: RateWindow;
    credits: { hasCredits: boolean; unlimited: boolean; balance: string } | null;
  } | null;
  usage: ProviderUsage | null;
};

// `window.getit` is declared globally in components/CodexHealthBanner.tsx.

export default function AccountButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <span className="viz-tooltip-anchor relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="tab-icon-btn"
          ref={trigger}
          aria-label="Compte ChatGPT"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <CircleUserRound className="h-3.5 w-3.5" />
        </button>
        {!open && (
          <span className="viz-tooltip" role="tooltip">
            Compte ChatGPT, utilisation et déconnexion.
          </span>
        )}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-label="Compte ChatGPT"
            key="account-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-[70] mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-popover)]"
          >
            <AccountPanel open={open} onClose={() => { setOpen(false); trigger.current?.focus(); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

async function openSetup() {
  if (!window.getit?.runCodexSetup) throw new Error("Ouvrez l’application Get It Jacob pour connecter ChatGPT.");
  await window.getit.runCodexSetup();
}

function AccountPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // The panel mounts for each opening with loading=true and no prior error.
    fetch("/api/provider/status", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ProviderStatus;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Impossible de lire l’état du compte. Fermez puis rouvrez ce menu pour réessayer.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSignOut = useCallback(async () => {
    if (busy || !data) return;
    const msg =
      data.authMode === "apiKey"
        ? "Se déconnecter et effacer la clé enregistrée ? Vos documents et conversations restent sur ce Mac."
        : "Se déconnecter de ChatGPT ? Vos documents et conversations restent sur ce Mac.";
    if (!confirm(msg)) return;
    setBusy(true);
    setErr(null);
    try {
      const response = await fetch("/api/provider/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: data.provider }),
      });
      if (!response.ok) throw new Error();
      setData({ ...data, authenticated: false, account: null, rateLimits: null, usage: null });
    } catch {
      setErr("Impossible de confirmer la déconnexion. Fermez puis rouvrez ce menu pour vérifier l’état du compte.");
    } finally {
      setBusy(false);
    }
  }, [busy, data]);

  const handleConnect = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await openSetup();
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Impossible d’ouvrir la connexion ChatGPT.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-500)]">
          Compte ChatGPT
        </p>
        <div className="flex items-center gap-2">
        {data?.authenticated && (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            title="Se déconnecter de ChatGPT"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--ink-700)] transition hover:border-[var(--feedback-wrong-border)] hover:bg-[var(--feedback-wrong-bg)] hover:text-[var(--feedback-wrong-text)] disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <LogOut className="h-2.5 w-2.5" />}
            {busy ? "…" : "Se déconnecter"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Fermer le compte" className="rounded p-1 text-[var(--ink-500)] hover:bg-[var(--surface-sunken)]"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {loading && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--ink-400)]">
          <RefreshCw className="h-3 w-3 animate-spin text-[var(--accent-600)]" />
          Chargement du compte…
        </div>
      )}

      {!loading && err && (
        <p role="alert" className="mt-1.5 text-[11px] text-[var(--feedback-wrong-text)]">{err}</p>
      )}

      {!loading && data && (
        <>
          {/* Identity */}
          {data.authenticated ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--ink-500)]">
                <UserIcon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-[var(--ink-900)]">
                  {data.account?.name ?? data.account?.email ?? "Connecté à ChatGPT"}
                </p>
                <p className="truncate text-[10.5px] text-[var(--ink-500)]">
                  {data.account?.email && data.account?.email !== data.account?.name ? data.account?.email : ""}
                  {data.account?.planType ? (
                    <>
                      {data.account?.email && data.account?.email !== data.account?.name ? " · " : ""}
                      <span className="font-medium uppercase text-[var(--accent-700)]">
                        {data.account?.planType}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--ink-500)]">
                <XCircle className="h-3.5 w-3.5 text-rose-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-[var(--ink-900)]">ChatGPT</p>
                <p className="text-[10.5px] text-[var(--ink-500)]">
                  Non connecté
                </p>
              </div>
            </div>
          )}

          {/* The view is tied to whether the engine EXPOSES limits, not to the
              auth mode: only Codex on a ChatGPT login surfaces 5h/weekly windows
              and keeps showing them (a transient read miss shows a placeholder,
              never a silent flip to tokens). Every other engine — Claude (no
              limit surface), Gemini, Pi, Codex-on-API-key — shows daily token
              usage instead. */}
          {data.exposesLimits ? (
            data.rateLimits && (data.rateLimits.primary || data.rateLimits.secondary) ? (
              <div className="mt-4 space-y-1.5">
                <LimitRow label="Utilisation sur 5 heures" win={data.rateLimits.primary} />
                <LimitRow label="Utilisation hebdomadaire" win={data.rateLimits.secondary} />
              </div>
            ) : data.authenticated ? (
              <div className="mt-4 text-[10.5px] text-[var(--ink-400)]">
                Les limites d’utilisation sont momentanément indisponibles.
              </div>
            ) : null
          ) : data.authenticated && data.usage && data.usage.calls > 0 ? (
            <UsageRow usage={data.usage} showCost={data.authMode === "apiKey"} />
          ) : data.authenticated ? (
            <div className="mt-4 text-[10.5px] text-[var(--ink-400)]">
              Aucun token utilisé aujourd’hui.
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-4 flex items-center gap-2">
            <a
              href={data.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-[10.5px] font-medium text-[var(--ink-700)] transition hover:border-[var(--accent-300)] hover:text-[var(--accent-700)]"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Aide
            </a>
            {!data.authenticated && <button
              type="button"
              disabled={busy}
              onClick={() => void handleConnect()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-[10.5px] font-medium text-[var(--ink-700)] transition hover:border-[var(--accent-300)] hover:text-[var(--accent-700)]"
            >
              <Settings2 className="h-2.5 w-2.5" />
              {busy ? "Connexion…" : "Connecter ChatGPT"}
            </button>}
          </div>
        </>
      )}
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function UsageRow({ usage, showCost }: { usage: ProviderUsage; showCost: boolean }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1 font-medium text-[var(--ink-700)]">
          <Gauge className="h-3 w-3 text-[var(--accent-600)]" /> Tokens aujourd’hui
        </span>
        <span className="tabular-nums text-[var(--ink-900)]">
          {fmtTokens(usage.totalTokens)}
          {showCost && usage.costUsd > 0 ? (
            <span className="ml-1 font-normal text-[var(--ink-400)]">· ${usage.costUsd.toFixed(2)}</span>
          ) : null}
        </span>
      </div>
      <p className="mt-1 text-[10.5px] text-[var(--ink-400)]">
        {fmtTokens(usage.inputTokens)} en entrée · {fmtTokens(usage.outputTokens)} en sortie · {usage.calls} appel{usage.calls === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function LimitRow({ label, win }: { label: string; win: RateWindow }) {
  if (!win) {
    return (
      <div className="flex items-center justify-between text-[10.5px] text-[var(--ink-400)]">
        <span>{label}</span>
        <span>indisponible</span>
      </div>
    );
  }
  const used = Math.max(0, Math.min(100, Math.round(win.usedPercent)));
  const tone = used >= 90 ? "bg-rose-500" : used >= 60 ? "bg-amber-500" : "bg-[var(--accent-600)]";
  const resetIn = win.resetsAt ? formatResetIn(win.resetsAt * 1000) : null;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-[var(--ink-700)]">{label}</span>
        <span className="tabular-nums text-[var(--ink-900)]">
          {used} % utilisés
          {resetIn ? <span className="ml-1 font-normal text-[var(--ink-400)]">· réinitialisation dans {resetIn}</span> : null}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className={`h-full ${tone}`} style={{ width: `${used}%` }} />
      </div>
    </div>
  );
}

function formatResetIn(absMs: number): string {
  const dt = absMs - Date.now();
  if (dt <= 0) return "quelques instants";
  const totalMin = Math.round(dt / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 48) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${Math.round(h / 24)} j`;
}
