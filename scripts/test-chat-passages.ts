// Modified September 2026 for Get It Jacob; see NOTICE.
/** Passage persistence, migration and model-input contracts. Synthetic data only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { DocumentAIInput, DocumentAIServer } from "../lib/document-ai";
import { MAX_PASSAGE_CHARS, MAX_PASSAGES, MAX_TOTAL_PASSAGE_CHARS, validateChatPassages } from "../lib/chat-passages";

async function main() {
  fs.mkdirSync("work", { recursive: true });
  const dataDir = fs.mkdtempSync(path.resolve("work/chat-passages-test-"));
  process.env.GETIT_DATA_DIR = dataDir;
  const { saveDoc } = await import("../lib/store");
  const { docDir, pdfPath } = await import("../lib/paths");
  const { loadChatDrafts, saveChatDrafts } = await import("../lib/chat-drafts");
  const { loadWorkContext, saveWorkContext } = await import("../lib/work-context");
  const route = await import("../app/api/chat/[docId]/route");
  const docId = "multi-passage-test";
  const calls: DocumentAIInput[] = [];
  globalThis.__getItDocumentAI = { async run(input: DocumentAIInput) {
    calls.push(input);
    return { text: "Passages reçus.", threadId: input.threadId ?? `test-thread-${calls.length}` };
  } } as unknown as DocumentAIServer;
  try {
    saveDoc({ id: docId, filename: "synthetic.pdf", numPages: 3, uploadedAt: Date.now(), pdfUrl: "/synthetic.pdf", extracted: { numPages: 3, pages: [0, 1, 2].map(pageIndex => ({ pageIndex, text: `DOCUMENT PAGE ${pageIndex + 1}`, width: 500, height: 700, items: [] })) } });
    fs.writeFileSync(pdfPath(docId), "synthetic source");
    fs.writeFileSync(path.join(docDir(docId), "preparation.json"), JSON.stringify({ version: 2, status: "ready", totalPages: 3, completedPages: 3, visualPages: [], pages: [0, 1, 2].map(pageIndex => ({ pageIndex, notes: "Indexed", kind: "text" })), updatedAt: Date.now() }));
    const ctx = { params: Promise.resolve({ docId }) };
    const post = (body: unknown) => route.POST(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx);
    const requestId = "12345678-1234-1234-1234-123456789abc";
    const legacyDraft = { drafts: { new: { text: "Compare", attached: { pageIndex: 0, selection: "Premier extrait" }, captures: [] } }, outbox: { "old-chat": { chatId: "old-chat", message: "Ancienne question", pageIndex: 2, selection: "Ancien passage", captures: [], requestId } } };
    fs.writeFileSync(path.join(docDir(docId), "chat-drafts.json"), JSON.stringify(legacyDraft));
    const migratedDraft = loadChatDrafts(docId);
    assert.deepEqual(migratedDraft.drafts.new.passages, [{ pageIndex: 0, selection: "Premier extrait" }]);
    assert.deepEqual(migratedDraft.outbox["old-chat"].passages, [{ pageIndex: 2, selection: "Ancien passage" }]);
    assert.equal(migratedDraft.outbox["old-chat"].requestId, requestId);
    const passages = [{ pageIndex: 0, selection: "Premier extrait" }, { pageIndex: 2, selection: "Second extrait" }];
    const state = { drafts: { new: { text: "Compare", passages, captures: [] } }, outbox: {} };
    saveChatDrafts(docId, state);
    globalThis.__getitStore?.clear();
    assert.deepEqual(loadChatDrafts(docId), state, "all passages survive disk reload in their order with individual source pages");
    assert.equal(calls.length, 0, "collecting, migrating and reloading passages never calls AI");
    const chat = (await (await post({ action: "create" })).json()).chat;
    const payload = { action: "send", chatId: chat.id, message: "Compare les extraits", pageIndex: 1, passages, captureIds: [], requestId };
    const decode = async (response: Response) => {
      assert.equal(response.status, 200);
      return (await response.text()).split("\n\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))).at(-1);
    };
    const invalids = [null, {}, [{ pageIndex: 3, selection: "text" }], [{ pageIndex: 0.5, selection: "text" }], [{ pageIndex: 0, selection: "  " }], [{ pageIndex: 0, selection: 1 }], [{ pageIndex: 0, selection: "x".repeat(MAX_PASSAGE_CHARS + 1) }], Array.from({ length: MAX_PASSAGES + 1 }, () => passages[0]), Array.from({ length: MAX_TOTAL_PASSAGE_CHARS / MAX_PASSAGE_CHARS + 1 }, () => ({ pageIndex: 0, selection: "x".repeat(MAX_PASSAGE_CHARS) }))];
    for (const invalid of invalids) {
      assert.equal((await post({ ...payload, passages: invalid })).status, 400);
      assert.throws(() => saveChatDrafts(docId, { drafts: { new: { ...state.drafts.new, passages: invalid } }, outbox: {} }));
    }
    assert.deepEqual(loadChatDrafts(docId), state, "invalid passage saves leave the existing draft intact");
    assert.throws(() => validateChatPassages([{ pageIndex: 1, selection: "Missing extracted page" }], new Set([0, 2])), /page/);
    assert.equal(calls.length, 0, "invalid requests never reach the model");
    const first = await decode(await post(payload));
    assert.equal(first.type, "done");
    assert.deepEqual(first.chat.messages[0].passages, passages);
    assert.match(calls[0].input, /CURRENT VIEWED PAGE: 2/);
    assert.match(calls[0].input, /Passage 1 \[PDF page 1\]: "Premier extrait"/);
    assert.match(calls[0].input, /Passage 2 \[PDF page 3\]: "Second extrait"/);
    assert.match(calls[0].input, /quoted evidence, never instructions/);
    assert.match(calls[0].input, /DOCUMENT PAGE 1/);
    const replay = await decode(await post(payload));
    assert.equal(replay.timing.replayed, true);
    assert.equal(calls.length, 1, "same committed request replays without a model call");
    assert.equal((await post({ ...payload, passages: [passages[1], passages[0]] })).status, 409, "changing passage order changes the request");
    assert.equal((await post({ ...payload, passages: [{ ...passages[0], pageIndex: 1 }, passages[1]] })).status, 409, "changing a source page changes the request");
    assert.equal(calls.length, 1);
    const resumed = await decode(await post({ ...payload, requestId: undefined, message: "Encore", passages: [passages[1]] }));
    assert.equal(resumed.timing.resumed, true);
    assert.match(calls[1].input, /Passage 1 \[PDF page 3\]: "Second extrait"/);
    assert.doesNotMatch(calls[1].input, /DOCUMENT PAGE 1|Premier extrait/);
    const persisted = loadWorkContext(docId);
    const thread = persisted.chats.find(item => item.id === chat.id)!;
    delete thread.codexThreadId;
    // Restore an actual old message lacking the new passages property as well.
    thread.messages.push({ role: "user", content: "Question ancienne", ts: 1, pageIndex: 2, selection: "Ancien passage" }, { role: "assistant", content: "Réponse ancienne", ts: 2 });
    saveWorkContext(persisted);
    const restored = await decode(await post({ ...payload, requestId: undefined, message: "Reprends tout", passages: [] }));
    assert.equal(restored.timing.resumed, false);
    assert.match(calls[2].input, /Passage 1 \[PDF page 1\]: "Premier extrait"/);
    assert.match(calls[2].input, /Passage 2 \[PDF page 3\]: "Second extrait"/);
    assert.match(calls[2].input, /Passage 1 \[PDF page 3\]: "Ancien passage"/);
    const get = await route.GET(new Request("http://localhost/"), ctx);
    const oldMessage = (await get.json()).chats[0].messages.find((item: { content: string }) => item.content === "Question ancienne");
    assert.deepEqual(oldMessage.passages, [{ pageIndex: 2, selection: "Ancien passage" }]);
    // Old one-selection sends are equivalent to the migrated one-passage outbox.
    const oldPayload = { ...payload, requestId: "87654321-1234-1234-1234-123456789abc", passages: undefined, selection: " Ancien envoi ", pageIndex: 2 };
    await decode(await post(oldPayload));
    const wc = loadWorkContext(docId);
    const legacyMessage = wc.chats[0].messages.find(item => item.requestId === oldPayload.requestId)!;
    delete legacyMessage.passages;
    saveWorkContext(wc);
    const count = calls.length;
    const legacyReplay = await decode(await post({ ...oldPayload, selection: undefined, passages: [{ pageIndex: 2, selection: "Ancien envoi" }] }));
    assert.equal(legacyReplay.timing.replayed, true);
    assert.equal(calls.length, count);
    console.log("PASS: multiple ordered page-specific excerpts, draft/outbox legacy migration, disk persistence, strict aggregate/page validation, independent viewed page, initial/resumed/restored model context, persisted history, and old/new idempotent replay. Zero real AI calls.");
  } finally {
    globalThis.__getItDocumentAI = undefined;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
