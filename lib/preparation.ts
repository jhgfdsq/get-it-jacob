/** One explicitly requested import pass; viewing and polling never start AI. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { docDir, pdfPath } from "./paths";
import { getDoc } from "./store";
import { createPdfPageRenderer } from "./pdf-extract";
import { primePreparedChat } from "./document-ai";

export type PreparedPage = { pageIndex: number; notes: string; kind?: "text" | "visual" };
export type PreparationState = {
  version: 1 | 2;
  visualPages?: number[];
  status: "missing" | "preparing" | "ready" | "error";
  completedPages: number;
  totalPages: number;
  pages: PreparedPage[];
  updatedAt: number;
  error?: string;
  activePages?: number[];
  phase?: "pages" | "context";
};
type ActivePreparation = { controller: AbortController; promise: Promise<void> };
declare global {
  var __jacobPreparations: Map<string, ActivePreparation> | undefined;
  var __jacobPreparationSlots: { running: number; queue: Array<() => void> } | undefined;
}
const active = globalThis.__jacobPreparations ??= new Map<string, ActivePreparation>();
const slots = globalThis.__jacobPreparationSlots ??= { running: 0, queue: [] };
async function acquirePreparationSlot(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  if (slots.running >= 2) {
    await new Promise<void>((resolve, reject) => {
      const ready = () => { signal.removeEventListener("abort", abort); slots.running++; resolve(); };
      const abort = () => {
        const index = slots.queue.indexOf(ready);
        if (index >= 0) slots.queue.splice(index, 1);
        reject(signal.reason);
      };
      slots.queue.push(ready);
      signal.addEventListener("abort", abort, { once: true });
    });
  } else { slots.running++; }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slots.running--;
    slots.queue.shift()?.();
  };
}
const statePath = (id: string) => path.join(docDir(id), "preparation.json");

function missingState(docId: string): PreparationState {
  return { version: 1, status: "missing", completedPages: 0,
    totalPages: getDoc(docId)?.numPages ?? 0, pages: [], updatedAt: 0 };
}

/** Strict coverage check: a successful process exit alone never marks a page read. */
export function parsePreparedPages(text: string, expected: number[]): PreparedPage[] {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(clean) as { pages?: unknown };
  if (!Array.isArray(parsed.pages)) throw new Error("La réponse ne contient pas les notes attendues.");
  const pages = parsed.pages as PreparedPage[];
  if (pages.length !== expected.length || new Set(pages.map(p => p.pageIndex)).size !== pages.length ||
      pages.some(p => !Number.isInteger(p.pageIndex) || !expected.includes(p.pageIndex) ||
        typeof p.notes !== "string" || !p.notes.trim())) {
    throw new Error("La couverture des pages reçues est incomplète. Les pages manquantes restent à préparer.");
  }
  return pages.map(p => ({ pageIndex: p.pageIndex, notes: p.notes.trim() }));
}

export function readPreparation(docId: string): PreparationState {
  const empty = missingState(docId);
  if (!fs.existsSync(statePath(docId))) return empty;
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(docId), "utf8")) as PreparationState;
    if (![1, 2].includes(saved.version) || !Array.isArray(saved.pages) || !["missing", "preparing", "ready", "error"].includes(saved.status)) throw new Error("format");
    const unique = new Map<number, PreparedPage>();
    for (const page of saved.pages) {
      if (Number.isInteger(page.pageIndex) && page.pageIndex >= 0 && page.pageIndex < empty.totalPages &&
          typeof page.notes === "string" && page.notes.trim()) unique.set(page.pageIndex, page);
    }
    const result = { ...saved, totalPages: empty.totalPages, pages: [...unique.values()].sort((a,b) => a.pageIndex-b.pageIndex), completedPages: unique.size };
    if (result.status === "ready" && result.completedPages !== result.totalPages) {
      return { ...result, status: "error", error: "Préparation incomplète. Reprenez les pages restantes." };
    }
    if (result.status === "preparing" && !active.has(docId)) {
      return { ...result, status: "error", error: "La préparation a été interrompue. Les pages terminées sont conservées. Cliquez sur Reprendre." };
    }
    if (result.status === "ready" && result.version === 2 && (result.visualPages ?? []).some(index => !fs.existsSync(pageImagePath(docId, index)))) {
      return { ...result, status: "error", error: "Une image source manque. Reprenez la préparation locale." };
    }
    return result;
  } catch {
    return { ...empty, status: "error", error: "Le fichier de préparation est illisible. Une reprise explicite est nécessaire." };
  }
}

function savePreparation(docId: string, state: PreparationState) {
  // Never resurrect a deleted document folder, including after an AI callback.
  if (!fs.existsSync(pdfPath(docId))) throw new Error("Document supprimé.");
  const destination = statePath(docId);
  const tmp = `${destination}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: Date.now() }));
    fs.renameSync(tmp, destination);
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

/** The complete extracted text is preserved, separately from AI visual notes. */
export function buildPreparedContext(docId: string, imagePageIndex?: number): string {
  const doc = getDoc(docId);
  if (!doc) throw new Error("Document introuvable.");
  const state = readPreparation(docId);
  if (state.status !== "ready") throw new Error("Le document doit terminer sa préparation avant le chat.");
  return formatPreparedContext(docId, state, imagePageIndex);
}

const pageImagePath = (docId: string, pageIndex: number) => {
  const base = path.join(docDir(docId), "pages", `page-${pageIndex + 1}`);
  if (fs.existsSync(base + ".jpg")) return base + ".jpg";
  // Existing source caches remain usable, without rerendering on reopen.
  return fs.existsSync(base + ".png") ? base + ".png" : base + ".jpg";
};

/** Stable original visual sources, never a new inference during a chat turn. */
export function getPreparedImagePaths(docId: string, pageIndex?: number): string[] {
  const state = readPreparation(docId);
  if (state.status !== "ready") throw new Error("Le document doit terminer sa préparation avant le chat.");
  return (state.visualPages ?? []).filter(index => pageIndex == null || index === pageIndex).map(index => pageImagePath(docId, index));
}

function formatPreparedContext(docId: string, state: PreparationState, imagePageIndex?: number): string {
  const doc = getDoc(docId)!;
  const notes = new Map(state.pages.map(p => [p.pageIndex, p]));
  const attached = new Set((state.visualPages ?? []).filter(index => imagePageIndex == null || index === imagePageIndex));
  const order = [...attached].map(p => p + 1);
  const header = state.version === 2
    ? `SOURCE DOCUMENT: ${JSON.stringify(doc.filename)}. All ${doc.numPages} PDF pages are indexed locally. No prior AI summary has replaced the text.\nThe attached original page images correspond, IN ORDER, to PDF pages: ${order.join(", ") || "none"}. Use these images to read charts, diagrams or scans when answering a question. A local source index is not a claim that every image has already been interpreted.\n`
    : "Prepared legacy document: original source text and earlier AI visual notes.\n";
  return header + doc.extracted.pages.map(p => `\n===== PAGE PDF ${p.pageIndex + 1} / ${doc.numPages} =====\nTEXTE ORIGINAL EXTRAIT (intégral) :\n${p.text || "[Pas de texte extrait. Consulter l’image originale si elle est jointe.]"}\n${state.version === 1 ? `NOTES IA ANTÉRIEURES (peuvent comporter des erreurs) :\n${notes.get(p.pageIndex)?.notes ?? ""}` : attached.has(p.pageIndex) ? "IMAGE ORIGINALE JOINTE POUR CETTE PAGE." : notes.get(p.pageIndex)?.kind === "visual" ? "Image source conservée localement, non jointe à cette requête." : "Source textuelle indexée localement."}`).join("\n");
}

export function cancelPreparation(docId: string) {
  active.get(docId)?.controller.abort(new Error("Préparation arrêtée à votre demande."));
}

/** Starts once, or resumes only unfinished pages following an explicit POST. */
export function startPreparation(docId: string): PreparationState {
  const previous = readPreparation(docId);
  if (previous.status === "ready" || active.has(docId)) return readPreparation(docId);
  const doc = getDoc(docId);
  if (!doc) throw new Error("Document introuvable.");
  // Preserve legacy notes for recovery; never rerun the old per-three-page AI pass.
  if (previous.version === 1 && fs.existsSync(statePath(docId)) && !fs.existsSync(statePath(docId) + ".legacy-v1")) fs.copyFileSync(statePath(docId), statePath(docId) + ".legacy-v1");
  const state: PreparationState = { ...previous, version: 2, pages: previous.version === 2 ? previous.pages : [], status: "preparing", phase: "pages", error: undefined, activePages: [], totalPages: doc.numPages };
  const controller = new AbortController();
  // Register before writing status so readers can distinguish a live job from an interrupted import.
  const entry: ActivePreparation = { controller, promise: Promise.resolve() };
  active.set(docId, entry);
  savePreparation(docId, state);
  entry.promise = prepare(docId, state, controller.signal).catch(error => {
    if (fs.existsSync(pdfPath(docId))) {
      savePreparation(docId, { ...state, status: "error", activePages: [], error: error instanceof Error ? error.message : "Échec de préparation." });
    }
  }).finally(() => { if (active.get(docId) === entry) active.delete(docId); });
  return state;
}

async function prepare(docId: string, state: PreparationState, signal: AbortSignal) {
  const doc = getDoc(docId)!;
  const renderedDir = path.join(docDir(docId), "pages");
  fs.mkdirSync(renderedDir, { recursive: true });
  const release = await acquirePreparationSlot(signal);
  let renderer: Awaited<ReturnType<typeof createPdfPageRenderer>> | undefined;
  try {
    signal.throwIfAborted();
    renderer = await createPdfPageRenderer(new Uint8Array(fs.readFileSync(pdfPath(docId))));
    const manifest = await renderer.inspect(signal);
    signal.throwIfAborted();
    state.visualPages = manifest.filter(page => page.hasVisualContent).map(page => page.pageIndex);
    const visual = new Set(state.visualPages);
    const completed = new Map(state.pages.map(page => [page.pageIndex, page]));
    for (const page of doc.extracted.pages) {
      signal.throwIfAborted();
      const kind = visual.has(page.pageIndex) ? "visual" : "text";
      const imagePath = pageImagePath(docId, page.pageIndex);
      if (kind === "visual" && !fs.existsSync(imagePath)) {
        state.activePages = [page.pageIndex + 1];
        savePreparation(docId, state);
        await renderer.render(page.pageIndex, imagePath, signal);
      }
      completed.set(page.pageIndex, { pageIndex: page.pageIndex, kind,
        notes: kind === "visual" ? "Image source originale conservée, disponible dans le contexte du chat." : "Texte original indexé localement, sans appel IA." });
      state.pages = [...completed.values()].sort((a,b) => a.pageIndex - b.pageIndex);
      state.completedPages = state.pages.length;
      savePreparation(docId, state);
    }
    if (state.pages.length !== doc.numPages) throw new Error("Toutes les pages n’ont pas été indexées.");
    state.phase = "context";
    state.activePages = [];
    savePreparation(docId, state);
    // The first conversation is seeded before opening the reader. On an
    // explicit retry this step reuses the source cache instead of repeating per-page AI calls.
    await primePreparedChat(docId, formatPreparedContext(docId, state), signal, (state.visualPages ?? []).map(index => pageImagePath(docId, index)));
    signal.throwIfAborted();
    state.status = "ready";
    state.activePages = [];
    state.error = undefined;
    savePreparation(docId, state);
  } finally {
    try { await renderer?.close(); } finally { release(); }
  }
}
