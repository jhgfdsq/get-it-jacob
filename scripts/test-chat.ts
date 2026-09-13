/** Deterministic protocol + route regressions. No Codex binary/network call. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

type Rpc = { id?: number; method: string; params?: Record<string, unknown> };
class FakeCodex extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  requests: Rpc[] = [];
  threadCount = 0;
  nextTurn = 0;
  hold = false;
  fail = false;
  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().trim().split("\n")) {
        const request = JSON.parse(line) as Rpc;
        this.requests.push(request);
        this.respond(request);
      }
    });
  }
  output(message: object) { this.stdout.write(JSON.stringify(message) + "\n"); }
  respond(request: Rpc) {
    const { method, id, params = {} } = request;
    if (method === "initialize") this.output({ id, result: {} });
    if (method === "thread/start") this.output({ id, result: { thread: { id: `thread-${++this.threadCount}` } } });
    if (method === "thread/resume") this.output({ id, result: { thread: { id: params.threadId } } });
    if (method === "turn/interrupt") this.output({ id, result: {} });
    if (method !== "turn/start") return;
    const threadId = params.threadId;
    const turnId = `turn-${++this.nextTurn}`;
    this.output({ id, result: { turn: { id: turnId } } });
    this.output({ method: "turn/started", params: { threadId, turn: { id: turnId } } });
    if (this.hold) return;
    setTimeout(() => {
      const notification = (event: string, extra: object) => this.output({ method: event, params: { threadId, turnId, ...extra } });
      if (this.fail) {
        notification("turn/completed", { turn: { id: turnId, status: "failed", error: { message: "Upstream unavailable" } } });
        return;
      }
      notification("item/reasoning/summaryTextDelta", { delta: "private reasoning not exposed" });
      notification("item/agentMessage/delta", { itemId: "reply", delta: "Bonjour " });
      notification("item/agentMessage/delta", { itemId: "reply", delta: "Jacob é" });
      notification("item/completed", { item: { id: "reply", type: "agentMessage", text: "Bonjour Jacob é" } });
      notification("thread/tokenUsage/updated", { tokenUsage: { last: { inputTokens: 40, cachedInputTokens: 20, outputTokens: 4 } } });
      setTimeout(() => notification("turn/completed", { turn: { id: turnId, status: "completed" } }), 15);
    }, 5);
  }
  kill() { this.killed = true; this.emit("exit", 0); return true; }
}
async function main() {
  fs.mkdirSync("work", { recursive: true });
  process.env.GETIT_DATA_DIR = fs.mkdtempSync(path.resolve("work/chat-test-"));
  const { DocumentAIServer, shutdownDocumentAI, primePreparedChat, DOCUMENT_CONTEXT_VERSION } = await import("../lib/document-ai");
  const fake = new FakeCodex();
  let launches = 0;
  const server = new DocumentAIServer(() => { launches++; return fake as unknown as ChildProcessWithoutNullStreams; });
  globalThis.__getItDocumentAI = server;
  try {
    const events: Array<{ type: string; text: string }> = [];
    const first = await server.run({ input: "First", imagePaths: ["/test/page-1.png"], onEvent: (event) => events.push(event) });
    assert.equal(first.text, "Bonjour Jacob é");
    assert.deepEqual(events.filter((event) => event.type === "text").map((event) => event.text), ["Bonjour ", "Bonjour Jacob é", "Bonjour Jacob é"]);
    assert(!events.some((event) => event.text.includes("private reasoning")));
    assert.deepEqual((fake.requests.find((request) => request.method === "turn/start")?.params?.input as unknown[])[1], { type: "localImage", path: "/test/page-1.png" });
    assert.equal(fake.requests.find((request) => request.method === "thread/start")?.params?.sandbox, "read-only");
    await server.run({ input: "Second", threadId: first.threadId });
    assert.equal(launches, 1, "native process remains warm");
    assert.equal(fake.requests.filter((request) => request.method === "thread/start").length, 1, "loaded thread reused");
    assert.equal(fake.requests.filter((request) => request.method === "initialize").length, 1);
    await server.run({ input: "Resume persisted", threadId: "previous-session" });
    assert.equal(fake.requests.filter((request) => request.method === "thread/resume").length, 1);
    fake.hold = true;
    const abort = new AbortController();
    const cancelled = server.run({ input: "Cancel", threadId: first.threadId, signal: abort.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(server.run({ input: "Concurrent", threadId: first.threadId }), /déjà en cours/);
    abort.abort();
    await assert.rejects(cancelled, /annulée/);
    assert(fake.requests.some((request) => request.method === "turn/interrupt"));
    fake.hold = false;
    fake.fail = true;
    const requestsBefore = fake.requests.length;
    await assert.rejects(server.run({ input: "Failure" }), /Upstream unavailable/);
    assert.equal(fake.requests.slice(requestsBefore).filter((request) => request.method === "turn/start").length, 1, "no expensive automatic retry");
    fake.fail = false;

    const { saveDoc } = await import("../lib/store");
    const { docDir, pdfPath } = await import("../lib/paths");
    const { loadWorkContext, saveWorkContext } = await import("../lib/work-context");
    const route = await import("../app/api/chat/[docId]/route");
    const docId = "test-chat-document";
    const ctx = { params: Promise.resolve({ docId }) };
    saveDoc({ id: docId, filename: "sample.pdf", numPages: 3, uploadedAt: Date.now(), pdfUrl: "/test.pdf", extracted: { numPages: 3, pages: [0, 1, 2].map((pageIndex) => ({ pageIndex, text: `ORIGINAL PAGE ${pageIndex + 1}`, width: 500, height: 700, items: [] })) } });
    fs.writeFileSync(pdfPath(docId), "test-source");
    const post = (body: unknown) => route.POST(new Request(`http://localhost/api/chat/${docId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx);
    const created = await (await post({ action: "create" })).json();
    const chatId = created.chat.id;
    const payload = { action: "send", chatId, message: "Développe ceci", pageIndex: 1, selection: "phrase choisie" };
    assert.equal((await post(payload)).status, 409, "no chat before complete preparation");
    fs.writeFileSync(path.join(docDir(docId), "preparation.json"), JSON.stringify({ version: 1, status: "ready", completedPages: 3, totalPages: 3, pages: [0, 1, 2].map((pageIndex) => ({ pageIndex, notes: `VISUAL NOTE ${pageIndex + 1}` })), updatedAt: Date.now() }));
    for (const pageIndex of [-1, 3, 0.5, "1", null]) assert.equal((await post({ ...payload, pageIndex })).status, 400);
    assert.equal((await post({ ...payload, message: { bad: true } })).status, 400);
    assert.equal((await post({ ...payload, selection: 123 })).status, 400);
    const decode = (text: string) => text.split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    const firstResponse = await post(payload);
    assert.match(firstResponse.headers.get("Content-Type") || "", /text\/event-stream/);
    assert.equal((await post(payload)).status, 409, "concurrent message rejected");
    const reader = firstResponse.body!.getReader();
    const immediate = await reader.read();
    assert.match(new TextDecoder().decode(immediate.value), /prise en compte/);
    let responseText = new TextDecoder().decode(immediate.value);
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; responseText += new TextDecoder().decode(chunk.value); }
    const sequence = decode(responseText);
    assert.equal(sequence.at(-1).type, "done");
    assert(sequence.findIndex((event) => event.type === "text") < sequence.findIndex((event) => event.type === "done"));
    const firstChatInput = fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as Array<{ text: string }>;
    assert.match(firstChatInput[0].text, /ORIGINAL PAGE 1/);
    assert.match(firstChatInput[0].text, /ORIGINAL PAGE 3/);
    assert.match(firstChatInput[0].text, /VISUAL NOTE 3/);
    assert.match(firstChatInput[0].text, /CURRENT VIEWED PAGE: 2/);
    assert.match(firstChatInput[0].text, /phrase choisie/);
    assert.match(firstChatInput[0].text, /takes precedence/);
    const persisted = loadWorkContext(docId).chats[0];
    assert.equal(persisted.messages.length, 2);
    assert.equal(persisted.messages[0].pageIndex, 1);
    assert.equal(persisted.messages[1].pageIndex, 1);
    assert.equal(persisted.messages[0].selection, "phrase choisie");
    const secondResponse = await post({ ...payload, pageIndex: 2, selection: undefined, message: "Explique plutôt la page 1" });
    const secondEvents = decode(await secondResponse.text());
    assert.equal(secondEvents.at(-1).timing.resumed, true);
    const nextInput = (fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as Array<{ text: string }>)[0].text;
    assert.match(nextInput, /CURRENT VIEWED PAGE: 3/);
    assert.match(nextInput, /Explique plutôt la page 1/);
    assert.doesNotMatch(nextInput, /ORIGINAL PAGE|VISUAL NOTE/);
    fake.fail = true;
    const failedEvents = decode(await (await post(payload)).text());
    assert.equal(failedEvents.at(-1).type, "error");
    const afterFailure = loadWorkContext(docId).chats[0];
    assert.equal(afterFailure.messages.length, 4, "failed turn does not persist orphan message");
    assert.equal(afterFailure.codexThreadId, undefined, "ambiguous failed thread not reused");
    fake.fail = false;
    // A legacy native context is never mistaken for the new image-backed seed.
    const legacy = loadWorkContext(docId);
    legacy.chats[0].codexThreadId = "old-v1-thread";
    legacy.chats[0].threadProvider = "codex";
    legacy.chats[0].documentContextVersion = 1;
    saveWorkContext(legacy);
    const beforePrime = fake.requests.filter((request) => request.method === "turn/start").length;
    await primePreparedChat(docId, "ALL DOCUMENT TEXT AND ORIGINAL PAGE IMAGES", undefined, ["/test/page-3.png"]);
    const primedChat = loadWorkContext(docId).chats[0];
    assert(primedChat.codexThreadId);
    assert.equal(primedChat.documentContextVersion, DOCUMENT_CONTEXT_VERSION);
    assert.equal(loadWorkContext(docId).chats[1].messages.length, 4, "legacy conversation retained unchanged");
    assert.equal(fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.effort, "low", "seed only acknowledges source loading with minimal reasoning");
    const seedInput = fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as Array<{ text?: string; type: string; path?: string }>;
    assert.deepEqual(seedInput[1], { type: "localImage", path: "/test/page-3.png" });
    assert.match(seedInput[0].text!, /Do not summarize/);
    assert.equal(primedChat.messages.length, 0, "seed acknowledgment never pollutes reader chat");
    await primePreparedChat(docId, "ALL DOCUMENT TEXT AND ORIGINAL PAGE IMAGES", undefined, ["/test/page-3.png"]);
    assert.equal(fake.requests.filter((request) => request.method === "turn/start").length, beforePrime + 1, "interrupted import reuses persisted seed");
    const seededResponse = decode(await (await post({ ...payload, chatId: primedChat.id })).text());
    assert.equal(seededResponse.at(-1).timing.resumed, true, "first reader message resumes preloaded context");
    const seededInput = (fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as Array<{ text: string }>)[0].text;
    assert.doesNotMatch(seededInput, /ALL DOCUMENT TEXT|ORIGINAL PAGE/);
    assert.equal((fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as unknown[]).length, 1, "images are not resent on resumed thread");
    const migrated = decode(await (await post(payload)).text());
    assert.equal(migrated.at(-1).timing.resumed, false, "legacy thread migrates explicitly to version 2");
    const migratedInput = (fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as Array<{ text: string }>)[0].text;
    assert.match(migratedInput, /PREVIOUS CONVERSATION/);
    assert.match(migratedInput, /Bonjour Jacob é/);
    const migratedChat = loadWorkContext(docId).chats.find(chat => chat.id === chatId)!;
    assert.equal(migratedChat.messages.length, 6, "migration preserves old messages and appends current exchange");
    assert.equal(migratedChat.documentContextVersion, DOCUMENT_CONTEXT_VERSION);
    // New conversations carry original visual page images exactly once.
    const imageDir = path.join(docDir(docId), "pages");
    fs.mkdirSync(imageDir, { recursive: true });
    const visualPath = path.join(imageDir, "page-3.png");
    fs.writeFileSync(visualPath, "test-image");
    fs.writeFileSync(path.join(docDir(docId), "preparation.json"), JSON.stringify({ version: 2, status: "ready", completedPages: 3, totalPages: 3, visualPages: [2], pages: [0, 1, 2].map((pageIndex) => ({ pageIndex, notes: "Local source indexed", kind: pageIndex === 2 ? "visual" : "text" })), updatedAt: Date.now() }));
    const preparation = await import("../lib/preparation");
    assert.deepEqual(preparation.getPreparedImagePaths(docId, 2), [visualPath]);
    assert.deepEqual(preparation.getPreparedImagePaths(docId, 1), []);
    assert.match(preparation.buildPreparedContext(docId, 2), /IN ORDER, to PDF pages: 3/);
    assert.match(preparation.buildPreparedContext(docId, 1), /IN ORDER, to PDF pages: none/);
    assert.doesNotMatch(preparation.buildPreparedContext(docId, 1), /IMAGE ORIGINALE JOINTE POUR CETTE PAGE/);
    const imageChat = await (await post({ action: "create" })).json();
    const imageEvents = decode(await (await post({ ...payload, chatId: imageChat.chat.id })).text());
    assert.equal(imageEvents.at(-1).type, "done");
    const imageTurn = fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as Array<{ type: string; path?: string; text?: string }>;
    assert.deepEqual(imageTurn[1], { type: "localImage", path: visualPath });
    assert.match(imageTurn[0].text!, /ORIGINAL PAGE 1/);
    assert.match(imageTurn[0].text!, /ORIGINAL PAGE 3/);
    const imageResume = decode(await (await post({ ...payload, chatId: imageChat.chat.id, pageIndex: 2 })).text());
    assert.equal(imageResume.at(-1).timing.resumed, true);
    assert.equal((fake.requests.filter((request) => request.method === "turn/start").at(-1)!.params!.input as unknown[]).length, 1, "original images stay in native context across turns");
    console.log("PASS: warm native protocol, real partial events, Unicode, page/image inputs, resume, cancellation, concurrency, no retries, HTTP validation, preparation gate, SSE, context reuse, explicit page priority, persistence and failure recovery.");
  } finally { shutdownDocumentAI(); fs.rmSync(process.env.GETIT_DATA_DIR!, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
