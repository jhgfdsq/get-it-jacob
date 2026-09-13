// Modified September 2026 for Get It Jacob; see NOTICE.
/** Disk persistence and route validation only. No browser, network or AI. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { DocumentAIServer } from "../lib/document-ai";

async function main() {
  fs.mkdirSync("work", { recursive: true });
  process.env.GETIT_DATA_DIR = fs.mkdtempSync(path.resolve("work/chat-drafts-test-"));
  const { saveDoc } = await import("../lib/store");
  const { docDir } = await import("../lib/paths");
  const { saveCapture } = await import("../lib/captures");
  const { loadChatDrafts } = await import("../lib/chat-drafts");
  const route = await import("../app/api/chat/[docId]/drafts/route");
  let aiCalls = 0;
  globalThis.__getItDocumentAI = { async run() { aiCalls++; throw new Error("Drafts must not call AI"); } } as unknown as DocumentAIServer;
  for (const id of ["draft-doc-a", "draft-doc-b"]) saveDoc({ id, filename: "synthetic.pdf", numPages: 2, uploadedAt: Date.now(), pdfUrl: "/synthetic.pdf", extracted: { numPages: 2, pages: [0, 1].map(pageIndex => ({ pageIndex, text: "test", width: 500, height: 700, items: [] })) } });
  const docId = "draft-doc-a";
  const context = (id = docId) => ({ params: Promise.resolve({ docId: id }) });
  const request = (value: unknown) => new Request("http://localhost:54321/api/chat/draft-doc-a/drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const put = (value: unknown, id = docId) => route.PUT(request(value), context(id));
  const get = (id = docId) => route.GET(new Request("http://localhost:65432/api/chat/draft-doc-a/drafts"), context(id));
  assert.deepEqual(await (await get()).json(), { drafts: {}, outbox: {} });
  const canvas = createCanvas(20, 20);
  const source = { pageIndex: 1, width: 20, height: 20, dataUrl: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}` };
  const capture = await saveCapture(docId, source);
  const otherCapture = await saveCapture("draft-doc-b", source);
  const value = {
    drafts: {
      new: { text: "Question en cours", attached: { pageIndex: 1 }, captures: [{ key: "crop-1", attachment: { ...capture, name: "FAKE", url: "http://bad.invalid" }, source: { dataUrl: "secret-raw-pixels" }, busy: true }, { key: "unfinished", source }] },
      "chat-a": { text: "Autre brouillon", attached: { pageIndex: 0, selection: "Le passage choisi" }, captures: [] },
    },
    outbox: { "chat-b": { chatId: "chat-b", message: "Compare ceci", pageIndex: 1, captures: [capture], requestId: "12345678-1234-1234-1234-123456789abc", error: "Connexion interrompue", unrelated: "must disappear" } },
  };
  const saved = await put(value);
  assert.equal(saved.status, 200);
  const expected = await saved.json();
  assert.deepEqual(expected.drafts.new.captures, [{ key: "crop-1", attachment: capture }], "only server-trusted ready attachment is persisted");
  assert.deepEqual(expected.drafts.new.attached, { pageIndex: 1 }, "selection is optional");
  assert(!("unrelated" in expected.outbox["chat-b"]));
  const persisted = fs.readFileSync(path.join(docDir(docId), "chat-drafts.json"), "utf8");
  assert.doesNotMatch(persisted, /dataUrl|secret-raw-pixels|unfinished|FAKE|bad.invalid|must disappear/);
  globalThis.__getitStore?.clear();
  assert.deepEqual(loadChatDrafts(docId), expected);
  assert.deepEqual(await (await get()).json(), expected, "GET on a different localhost port restores disk draft/outbox");
  assert.equal((await get()).headers.get("Cache-Control"), "no-store");
  const invalids: unknown[] = [null, [], {}, { drafts: [], outbox: {} }, { drafts: { "../outside": value.drafts.new }, outbox: {} }, { drafts: { new: { ...value.drafts.new, attached: { pageIndex: 2 } } }, outbox: {} }, { drafts: { new: { ...value.drafts.new, text: "x".repeat(100001) } }, outbox: {} }, { drafts: {}, outbox: { "chat-a": value.outbox["chat-b"] } }, { drafts: {}, outbox: { "chat-b": { ...value.outbox["chat-b"], requestId: "invalid" } } }];
  for (const invalid of invalids) assert.equal((await put(invalid)).status, 400);
  assert.equal((await put({ drafts: { new: { text: "", attached: null, captures: [{ key: "other", attachment: otherCapture }] } }, outbox: {} })).status, 404);
  assert.equal((await put({ drafts: {}, outbox: { "chat-b": { ...value.outbox["chat-b"], captures: [otherCapture] } } })).status, 404);
  assert.equal((await put({ ...value, extra: "x".repeat(1024 * 1024) })).status, 413);
  assert.equal((await put(value, "../outside")).status, 404);
  assert.equal((await get("../outside")).status, 404);
  assert.deepEqual(await (await get()).json(), expected, "rejected writes leave existing drafts untouched");
  assert.equal(aiCalls, 0, "all draft read/write/error paths use zero AI calls");
  assert.equal((await put({ drafts: {}, outbox: {} })).status, 200);
  assert.deepEqual(await (await get()).json(), { drafts: {}, outbox: {} });
  console.log("PASS: port-independent disk drafts/outbox, atomic persistence, trusted capture metadata, ready-only attachments, optional selection, path/document isolation, body limits, invalid-write preservation and zero AI.");
  globalThis.__getItDocumentAI = undefined;
  fs.rmSync(process.env.GETIT_DATA_DIR!, { recursive: true, force: true });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
