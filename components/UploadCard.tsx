// Modified September 2026 for Get It Jacob; see NOTICE for the fork changes.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  ArrowRight,
  MessageCircle,
  Atom,
  FileText,
  FlaskConical,
  HeartPulse,
  Scale,
  Sigma,
  BarChart3,
  SquareFunction,
  Network,
  AlertTriangle,
  X,
} from "lucide-react";

type FeatureColor = "rose" | "amber" | "emerald" | "violet" | "sky";
type FeatureIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean;
}>;
type SampleIcon = {
  Icon: FeatureIcon;
  tone: FeatureColor;
  label: string;
};

const SAMPLE_ICONS: Record<string, SampleIcon> = {
  anatomy: { Icon: HeartPulse, tone: "rose", label: "Anatomy" },
  physics: { Icon: Atom, tone: "amber", label: "Physics" },
  costituzione: { Icon: Scale, tone: "emerald", label: "Constitution" },
  calculus: { Icon: SquareFunction, tone: "violet", label: "Calculus" },
  chemistry: { Icon: FlaskConical, tone: "sky", label: "Chemistry" },
};
const DEFAULT_SAMPLE_ICON: SampleIcon = { Icon: FileText, tone: "emerald", label: "Document" };

const FEATURES: Array<{
  color: FeatureColor;
  icon: FeatureIcon;
  title: string;
  desc: string;
}> = [
  { color: "rose", icon: MessageCircle, title: "Chat", desc: "Discuter du document" },
  { color: "amber", icon: Network, title: "Diagrammes", desc: "Comprendre les liens sur demande" },
  { color: "violet", icon: Sigma,     title: "Formules", desc: "Des explications à votre rythme" },
  { color: "sky",    icon: BarChart3, title: "Graphiques", desc: "Les données sur demande" },
  { color: "emerald", icon: FileText,  title: "Source",      desc: "Votre page comme contexte" },
];

type Sample = {
  id: string;
  title: string;
  description: string;
  color: string;
  sizeKb: number;
};

type LibraryRow = {
  id: string;
  filename: string;
  uploadedAt: number;
  numPages: number;
  lastActivityAt: number;
  kgStatus: "missing" | "building" | "ready" | "error";
  kgEvaluationCount: number;
};

const FILENAME_TO_TITLE: Record<string, string> = {
  "anatomy.pdf": "Anatomy & Physiology",
  "physics.pdf": "Classical Mechanics",
  "costituzione.pdf": "Costituzione Italiana",
  "calculus.pdf": "Differential & Integral Calculus",
  "chemistry.pdf": "Organic Chemistry",
};

/** A PDF, or a Markdown file we render to PDF on upload. Kept in sync with
 *  MARKDOWN_EXT in app/api/upload/route.ts. */
const ACCEPTED_FILE = /\.(pdf|md|markdown|mdown|mkd|mdwn)$/i;

function humaniseAgo(ts: number): string {
  const dt = Date.now() - ts;
  if (dt < 5_000) return "à l’instant";
  if (dt < 60_000) return `${Math.round(dt / 1000)} s plus tôt`;
  if (dt < 3_600_000) return `${Math.round(dt / 60_000)} min plus tôt`;
  if (dt < 86_400_000) return `${Math.round(dt / 3_600_000)} h plus tôt`;
  if (dt < 7 * 86_400_000) return `${Math.round(dt / 86_400_000)} j plus tôt`;
  return new Date(ts).toLocaleDateString();
}

export default function UploadCard() {
  const router = useRouter();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preparationId, setPreparationId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ status: string; completedPages: number; totalPages: number; error?: string; activePages?: number[]; phase?: "pages" | "context" } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sample-pdfs")
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setSamples(j.samples || []); })
      .catch(() => {});
    fetch("/api/library", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { docs?: LibraryRow[] }) => { if (!cancelled) setLibrary(j.docs ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preparationId || progress?.status === "error" || progress?.status === "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/preparation/${preparationId}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "La progression est indisponible.");
        if (cancelled) return;
        setProgress(result);
        if (result.status === "ready") { router.push(`/viewer/${preparationId}`); return; }
        if (result.status === "error" || result.status === "missing") {
          setError(result.error || "Préparation interrompue. Reprenez les pages restantes.");
          setBusy(null);
          return;
        }
        timer = setTimeout(poll, 1200);
      } catch (error) {
        if (cancelled) return;
        setError((error as Error).message);
        setProgress(current => current ? { ...current, status: "error" } : null);
        setBusy(null);
      }
    }
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [preparationId, progress?.status, router]);

  async function resumePreparation() {
    if (!preparationId) return;
    setError(null);
    setBusy("upload");
    try {
      const response = await fetch(`/api/preparation/${preparationId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Impossible de reprendre.");
      setProgress(result);
      if (result.status === "ready") router.push(`/viewer/${preparationId}`);
    } catch (error) { setError((error as Error).message); setBusy(null); }
  }

  const libraryPreview = useMemo(() => library.slice(0, 6), [library]);

  const startSample = useCallback(
    async (id: string) => {
      if (busy) return;
      setError(null);
      setProgress(null);
      setPreparationId(null);
      setBusy(id);
      try {
        const fd = new FormData();
        fd.set("sample", id);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        if (!r.ok) throw new Error((await r.json()).error ?? "upload failed");
        const j = await r.json();
        setPreparationId(j.docId);
        setProgress(j.preparation);
        if (j.preparation?.status === "ready") router.push(`/viewer/${j.docId}`);
      } catch (e) {
        setError((e as Error).message);
        setBusy(null);
      }
    },
    [router, busy],
  );

  const startUpload = useCallback(
    async (file: File) => {
      if (busy) return;
      setError(null);
      setProgress(null);
      setPreparationId(null);
      if (!ACCEPTED_FILE.test(file.name)) {
        setError("Choisissez un fichier PDF ou Markdown (.md).");
        return;
      }
      setBusy("upload");
      try {
        const fd = new FormData();
        fd.set("file", file);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        if (!r.ok) throw new Error((await r.json()).error ?? "upload failed");
        const j = await r.json();
        setPreparationId(j.docId);
        setProgress(j.preparation);
        if (j.preparation?.status === "ready") router.push(`/viewer/${j.docId}`);
      } catch (e) {
        setError((e as Error).message);
        setBusy(null);
      }
    },
    [router, busy],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-10 py-14">
      <h1 className="text-balance text-[44px] font-bold leading-[1.08] tracking-tight text-[var(--ink-900)]">
        Read it. See it.{" "}
        <span
          className="font-black tracking-[-0.02em]"
          style={{ fontSize: "1.28em" }}
        >
          Get It.
        </span>
      </h1>

      <p className="mt-7 max-w-2xl text-[15px] leading-[1.65] text-[var(--ink-700)]">
        Déposez votre PDF. Une préparation initiale examine chaque page,
        son texte et ses figures. Ensuite, lisez à gauche et discutez à droite.
        Le chat suit votre page et les actions sur les passages restent à votre demande.
      </p>

      {/* Drop zone — output-type badges + CTA button */}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) startUpload(f);
        }}
        onClick={() => { if (!busy) inputRef.current?.click(); }}
        onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inputRef.current?.click(); } }}
        role="button"
        tabIndex={0}
        className={[
          "mt-9 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-9 text-center transition-colors",
          dragOver
            ? "border-[var(--accent-500)] bg-[var(--accent-50)]"
            : "border-[var(--accent-100)] bg-[var(--accent-50)]/40 hover:border-[var(--accent-500)] hover:bg-[var(--accent-50)]",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          disabled={busy != null}
          accept="application/pdf,.pdf,text/markdown,.md,.markdown"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) startUpload(f);
          }}
        />
        {/* Output-type badges — what we'll generate from the PDF */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {FEATURES.map(({ color, icon: Icon, title }) => (
            <span
              key={color}
              title={title}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
              style={{
                background: `var(--tag-${color}-bg)`,
                color: `var(--tag-${color}-fg)`,
                borderColor: `var(--tag-${color}-ring)`,
              }}
            >
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </div>
        <p className="flex flex-wrap items-center justify-center gap-2 text-[14px] text-[var(--ink-700)]">
          {busy != null ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-600)]" />
              <span className="font-medium text-[var(--ink-900)]">
                Lecture locale et préparation du document…
              </span>
            </>
          ) : (
            <>
              <span>Déposez votre PDF ou Markdown ici, ou</span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-600)] px-3 py-1 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[var(--accent-700)]">
                <Upload className="h-3.5 w-3.5" />
                Choisir le fichier
              </span>
            </>
          )}
        </p>
        <p className="mt-3 text-[11.5px] text-[var(--ink-400)]">
          PDF, scans et Markdown · Sans limite de pages · 80 Mo maximum par fichier.
        </p>
      </div>

      {progress && (
        <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-4">
          <p className="text-sm font-medium text-[var(--ink-900)]">Préparation : {progress.completedPages} / {progress.totalPages} pages examinées</p>
          <progress aria-label="Pages examinées" className="mt-3 h-2 w-full accent-[var(--accent-600)]" value={progress.completedPages} max={Math.max(progress.totalPages, 1)} />
          <p className="mt-2 text-xs leading-relaxed text-[var(--ink-500)]">
            {progress.status === "preparing" ? progress.phase === "context" ? "Toutes les pages sont examinées. Installation du contexte complet dans le chat…" : `Lecture du texte et des figures${progress.activePages?.length ? `, pages ${progress.activePages.join(", ")}` : ""}. Le lecteur s’ouvrira automatiquement une fois toutes les pages examinées.` : "Les pages déjà préparées sont conservées."}
            {" "}La durée dépend du document et du service IA. Les éléments illisibles sont signalés dans les notes.
          </p>
          {progress.status === "preparing" && preparationId && <button type="button" className="mt-3 text-xs text-[var(--ink-600)] underline" onClick={async () => {
            await fetch(`/api/preparation/${preparationId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
          }}>Arrêter et conserver les pages terminées</button>}
        </div>
      )}

      {/* Upload error / rejected-document alert — prominent, right under the
          drop zone so the cause is obvious the moment a bad PDF is refused. */}
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--feedback-wrong-border)] bg-[var(--feedback-wrong-bg)] px-4 py-3.5"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--feedback-wrong-icon)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--feedback-wrong-text)]">
              La préparation n’a pas pu se terminer
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--feedback-wrong-text)]">{error}</p>
            {preparationId && <button type="button" onClick={resumePreparation} disabled={busy != null} className="mt-3 rounded-md bg-[var(--accent-600)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Reprendre les pages restantes</button>}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--feedback-wrong-icon)] transition hover:bg-[var(--feedback-wrong-bg)] hover:text-[var(--feedback-wrong-text)]"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Library — only render if there's actually something to show */}
      {libraryPreview.length > 0 && (
        <div className="mt-12">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-400)]">
              Votre bibliothèque
            </p>
            {library.length > libraryPreview.length ? (
              <Link
                href="/library"
                className="text-[11px] font-medium text-[var(--accent-700)] hover:underline"
              >
                Tout voir ({library.length})
              </Link>
            ) : (
              <Link
                href="/library"
                className="text-[11px] font-medium text-[var(--accent-700)] hover:underline"
              >
                Ouvrir la bibliothèque
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {libraryPreview.map((d) => {
              const title =
                FILENAME_TO_TITLE[d.filename] ?? d.filename.replace(/\.(pdf|md|markdown|mdown|mkd|mdwn)$/i, "");
              return (
                <Link
                  key={d.id}
                  href={`/viewer/${d.id}`}
                  className="group flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left transition hover:border-[var(--border-strong)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--ink-500)]">
                    <FileText className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[var(--ink-900)]">
                      {title}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-500)]">
                      {d.numPages} page{d.numPages === 1 ? "" : "s"} · ouvert {humaniseAgo(d.lastActivityAt)}
                    </p>
                    {d.kgStatus === "ready" && d.kgEvaluationCount > 0 && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-[var(--feedback-correct-border)] bg-[var(--feedback-correct-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--feedback-correct-text)]">
                        <Network className="h-2.5 w-2.5" />
                        {d.kgEvaluationCount} eval{d.kgEvaluationCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <div className="self-center text-[var(--ink-400)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ink-900)]">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents d’exemple — Reflect-grade list cards */}
      <div className="mt-12">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-400)]">
          Documents d’exemple
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {samples.map((s) => {
            const sampleIcon = SAMPLE_ICONS[s.id] ?? DEFAULT_SAMPLE_ICON;
            const SampleIcon = sampleIcon.Icon;

            return (
              <button
                key={s.id}
                onClick={() => startSample(s.id)}
                disabled={busy != null}
                className="group flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left transition hover:border-[var(--border-strong)] disabled:opacity-50"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)]"
                  style={{
                    color: `var(--tag-${sampleIcon.tone}-fg)`,
                  }}
                  title={sampleIcon.label}
                >
                  <SampleIcon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[var(--ink-900)]">{s.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--ink-500)]">
                    {s.description}
                  </p>
                  <div className="mt-2 text-[11px] tabular-nums text-[var(--ink-400)]">{s.sizeKb} KB</div>
                </div>
                <div className="self-center text-[var(--ink-400)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ink-900)]">
                  {busy === s.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-600)]" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
