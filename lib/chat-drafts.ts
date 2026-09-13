// Modified September 2026 for Get It Jacob; see NOTICE.
/** Durable local drafts/outbox, independent of the application's localhost port. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { docDir } from "./paths";
import { getDoc } from "./store";
import { CaptureError, resolveCapture } from "./captures";
import { MAX_CAPTURES_PER_MESSAGE, type CaptureAttachment } from "./capture-types";

import { validateChatPassages, MAX_PASSAGE_CHARS, type ChatPassage } from "./chat-passages";

export const MAX_DRAFT_BODY_BYTES = 1024 * 1024;
type AttachedPassage = { pageIndex: number; selection?: string };
type SavedDraft = { text: string; passages: ChatPassage[]; attached?: AttachedPassage | null; captures: Array<{ key: string; attachment: CaptureAttachment }> };
type SavedOutbox = { chatId: string; message: string; pageIndex: number; passages: ChatPassage[]; selection?: string; captures: CaptureAttachment[]; requestId: string; error?: string };
export type ChatDraftState = { drafts: Record<string, SavedDraft>; outbox: Record<string, SavedOutbox> };
const validKey = (key: string) => /^[a-z0-9-]{1,64}$/.test(key);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function fail(message = "Le brouillon de discussion est invalide."): never { throw new CaptureError(message); }
function requireDocument(docId: string) {
  const doc = validKey(docId) ? getDoc(docId) : undefined;
  if (!doc) throw new CaptureError("Document introuvable.", 404);
  return doc;
}
function draftPath(docId: string) { return path.join(docDir(docId), "chat-drafts.json"); }
export function validateChatDrafts(docId: string, value: unknown): ChatDraftState {
  const doc = requireDocument(docId);
  if (!record(value) || !record(value.drafts) || !record(value.outbox)) fail();
  const pages = new Set(doc.extracted.pages.map(page => page.pageIndex));
  const passages = (source: unknown, legacy?: AttachedPassage) => {
    try { return validateChatPassages(source, pages, legacy); }
    catch (error) { fail(error instanceof Error ? error.message : undefined); }
  };
  const passage = (source: unknown): AttachedPassage => {
    if (!record(source) || !Number.isInteger(source.pageIndex) || !doc.extracted.pages.some(page => page.pageIndex === source.pageIndex)) fail("La page du brouillon est invalide.");
    if (source.selection != null && (typeof source.selection !== "string" || source.selection.length > MAX_PASSAGE_CHARS)) fail("La sélection du brouillon est trop longue ou invalide.");
    return { pageIndex: source.pageIndex as number, ...(typeof source.selection === "string" ? { selection: source.selection } : {}) };
  };
  const attachment = (source: unknown): CaptureAttachment => {
    if (!record(source) || typeof source.id !== "string") fail("Capture du brouillon invalide.");
    return resolveCapture(docId, source.id).capture;
  };
  const drafts: ChatDraftState["drafts"] = {};
  const outbox: ChatDraftState["outbox"] = {};
  for (const [key, draft] of Object.entries(value.drafts)) {
    if (!validKey(key) || !record(draft) || typeof draft.text !== "string" || draft.text.length > 100_000 || !Array.isArray(draft.captures)) fail();
    const captures: SavedDraft["captures"] = [];
    for (const item of draft.captures) {
      if (!record(item)) fail("Capture du brouillon invalide.");
      // A crop being uploaded is not a durable attachment yet. Never persist
      // raw source pixels/base64 or transport flags in the draft file.
      if (item.attachment == null) continue;
      if (typeof item.key !== "string" || !item.key || item.key.length > 128) fail("Identifiant de capture invalide.");
      captures.push({ key: item.key, attachment: attachment(item.attachment) });
    }
    if (captures.length > MAX_CAPTURES_PER_MESSAGE || new Set(captures.map(item => item.key)).size !== captures.length || new Set(captures.map(item => item.attachment.id)).size !== captures.length) fail("Le brouillon contient trop de captures ou des doublons.");
    const legacy = draft.attached != null ? passage(draft.attached) : undefined;
    drafts[key] = { text: draft.text, passages: passages(draft.passages, legacy), ...(legacy && !legacy.selection?.trim() ? { attached: legacy } : {}), captures };
  }
  for (const [key, entry] of Object.entries(value.outbox)) {
    if (!validKey(key) || !record(entry) || entry.chatId !== key || typeof entry.message !== "string" || !entry.message.trim() || entry.message.length > 100_000 || !Array.isArray(entry.captures) || entry.captures.length > MAX_CAPTURES_PER_MESSAGE || typeof entry.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(entry.requestId)) fail("L’envoi en attente est invalide.");
    if (entry.error != null && (typeof entry.error !== "string" || entry.error.length > 4_000)) fail();
    const captures = entry.captures.map(attachment);
    if (new Set(captures.map(item => item.id)).size !== captures.length) fail("L’envoi contient une capture en double.");
    const legacy = passage(entry);
    outbox[key] = { chatId: key, message: entry.message, pageIndex: legacy.pageIndex, passages: passages(entry.passages, legacy), captures, requestId: entry.requestId, ...(typeof entry.error === "string" ? { error: entry.error } : {}) };
  }
  return { drafts, outbox };
}
export function loadChatDrafts(docId: string): ChatDraftState {
  requireDocument(docId);
  const target = draftPath(docId);
  if (!fs.existsSync(target)) return { drafts: {}, outbox: {} };
  if (fs.statSync(target).size > MAX_DRAFT_BODY_BYTES) throw new CaptureError("Le fichier des brouillons dépasse 1 Mo.", 413);
  return validateChatDrafts(docId, JSON.parse(fs.readFileSync(target, "utf8")));
}
export function saveChatDrafts(docId: string, value: unknown): ChatDraftState {
  const state = validateChatDrafts(docId, value);
  const serialized = JSON.stringify(state);
  if (Buffer.byteLength(serialized) > MAX_DRAFT_BODY_BYTES) throw new CaptureError("Les brouillons dépassent 1 Mo.", 413);
  const target = draftPath(docId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, serialized); fs.renameSync(temporary, target); }
  catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  return state;
}
