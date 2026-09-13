/** Deterministic local checks. Does not invoke Codex or any AI service. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocumentAIServer } from "../lib/document-ai";

async function main() {
  fs.mkdirSync("work", { recursive: true });
  const directory = fs.mkdtempSync(path.resolve("work/preparation-test-"));
  process.env.GETIT_DATA_DIR = directory;
  const { extractPdf, createPdfPageRenderer } = await import("../lib/pdf-extract");
  const { parsePreparedPages, readPreparation, buildPreparedContext, startPreparation, cancelPreparation } = await import("../lib/preparation");
  const { saveDoc, deleteDoc } = await import("../lib/store");
  const { pdfPath, docDir } = await import("../lib/paths");
  try {
    assert.throws(() => parsePreparedPages('{"pages":[{"pageIndex":0,"notes":"one"}]}', [0,1]), /couverture/);
    assert.throws(() => parsePreparedPages('{"pages":[{"pageIndex":0,"notes":"one"},{"pageIndex":0,"notes":"duplicate"}]}', [0,1]), /couverture/);
    assert.throws(() => parsePreparedPages('{"pages":[{"pageIndex":2,"notes":"wrong page"}]}', [0]), /couverture/);
    assert.throws(() => parsePreparedPages('{"pages":[{"pageIndex":0,"notes":" "}]}', [0]), /couverture/);
    assert.equal(parsePreparedPages('```json\n{"pages":[{"pageIndex":0,"notes":" A "}]}\n```', [0])[0].notes, "A");

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([400,500]).drawText("Original full text retained 12345.", { x:40,y:400,size:18,font });
    // Second page contains a visual chart only: no selectable text.
    const imageOnly = pdf.addPage([400,500]);
    imageOnly.drawRectangle({ x:40,y:40,width:100,height:200,color:rgb(0.2,0.6,0.8) });
    const bytes = await pdf.save();
    const extracted = await extractPdf(new Uint8Array(bytes));
    assert.equal(extracted.numPages, 2);
    assert.equal(extracted.pages[1].text, "");
    saveDoc({ id:"coverage-test", filename:"test.pdf", uploadedAt:Date.now(), numPages:2, extracted, pdfUrl:"/api/pdf/coverage-test" });
    fs.writeFileSync(pdfPath("coverage-test"), bytes);
    const renderer = await createPdfPageRenderer(new Uint8Array(bytes));
    try {
      for (let pageIndex=0;pageIndex<2;pageIndex++) {
        const output = path.join(directory, `page-${pageIndex}.png`);
        await renderer.render(pageIndex, output);
        const image = fs.readFileSync(output);
        assert.equal(image.subarray(1,4).toString(), "PNG");
        assert.equal(image.readUInt32BE(20), 2200, "long side retains the expected rendering resolution");
        assert.ok(image.length > 1000);
      }
    } finally { await renderer.close(); }
    const statePath = path.join(docDir("coverage-test"), "preparation.json");
    const initial = {version:1,status:"preparing",completedPages:1,totalPages:2,pages:[{pageIndex:0,notes:"First page."}],updatedAt:Date.now()};
    fs.writeFileSync(statePath, JSON.stringify(initial));
    assert.equal(readPreparation("coverage-test").status, "error", "restart requires explicit resume");
    assert.equal(readPreparation("coverage-test").completedPages, 1, "restart preserves completed page");
    assert.throws(()=>buildPreparedContext("coverage-test"), /terminer/);
    fs.writeFileSync(statePath, JSON.stringify({...initial,status:"ready"}));
    assert.equal(readPreparation("coverage-test").status, "error", "incomplete cached ready is rejected");
    fs.writeFileSync(statePath, JSON.stringify({...initial,status:"ready",completedPages:2,pages:[...initial.pages,{pageIndex:1,notes:"Blue visual chart."}]}));
    const context = buildPreparedContext("coverage-test");
    assert.equal(readPreparation("coverage-test").status, "ready");
    assert.ok(context.includes("Original full text retained 12345."));
    assert.ok(context.includes("PAGE PDF 2 / 2"));
    assert.ok(context.includes("Blue visual chart."));
    // Full pipeline with a deterministic transport substitute. This object is
    // installed only by this test process, never selected by an application flag.
    const { loadWorkContext } = await import("../lib/work-context");
    const longer = await PDFDocument.load(bytes);
    longer.addPage([400,500]);
    longer.addPage([400,500]);
    const longerBytes = await longer.save();
    const longerExtracted = await extractPdf(new Uint8Array(longerBytes));
    saveDoc({ id:"resume-test",filename:"resume.pdf",uploadedAt:Date.now(),numPages:4,extracted:longerExtracted,pdfUrl:"/api/pdf/resume-test" });
    fs.writeFileSync(pdfPath("resume-test"), longerBytes);
    let calls = 0;
    globalThis.__getItDocumentAI = {
      run: async (args: {input:string;imagePaths?:string[]}) => {
        calls++;
        assert.equal(args.imagePaths?.length, 1, "only the graphic page is sent, not text or blank pages");
        assert.ok(args.imagePaths?.[0].endsWith("page-2.jpg"));
        assert.equal(readPreparation("resume-test").status, "preparing", "reader not ready before seed succeeds");
        assert.equal(readPreparation("resume-test").phase, "context");
        assert.ok(args.input.includes("Original full text retained 12345."));
        assert.ok(args.input.includes("PAGE PDF 4 / 4"));
        assert.ok(args.input.includes("IN ORDER, to PDF pages: 2"));
        if (calls === 1) throw new Error("Simulated service interruption");
        assert.equal(calls, 2, "a retry only seeds the cached source context");
        return { text:"Document prêt.", threadId:"test-seeded-chat" };
      },
    } as unknown as DocumentAIServer;
    startPreparation("resume-test");
    await globalThis.__jacobPreparations?.get("resume-test")?.promise;
    assert.equal(readPreparation("resume-test").status, "error");
    assert.equal(readPreparation("resume-test").completedPages, 4);
    assert.equal(calls, 1, "no automatic retry after service error");
    startPreparation("resume-test");
    await globalThis.__jacobPreparations?.get("resume-test")?.promise;
    assert.equal(readPreparation("resume-test").status, "ready");
    assert.equal(readPreparation("resume-test").completedPages, 4);
    assert.ok(loadWorkContext("resume-test").chats.some(chat=>chat.codexThreadId === "test-seeded-chat"));
    startPreparation("resume-test");
    assert.equal(calls, 2, "reopening prepared document never repeats AI");
    assert.equal(globalThis.__jacobPreparationSlots?.running, 0);
    saveDoc({ id:"cancel-test",filename:"cancel.pdf",uploadedAt:Date.now(),numPages:2,extracted,pdfUrl:"/api/pdf/cancel-test" });
    fs.writeFileSync(pdfPath("cancel-test"), bytes);
    let notifyStarted!: () => void;
    const modelStarted = new Promise<void>(resolve => { notifyStarted = resolve; });
    globalThis.__getItDocumentAI = {
      run: async ({ signal }: { signal:AbortSignal }) => {
        notifyStarted();
        return await new Promise((_resolve,reject) => { signal.addEventListener("abort",()=>reject(signal.reason),{once:true}); });
      },
    } as unknown as DocumentAIServer;
    startPreparation("cancel-test");
    const cancellationJob = globalThis.__jacobPreparations?.get("cancel-test")?.promise;
    await modelStarted;
    cancelPreparation("cancel-test");
    deleteDoc("cancel-test");
    await cancellationJob;
    assert.equal(fs.existsSync(docDir("cancel-test")), false, "inflight completion never resurrects deleted document");
    assert.equal(globalThis.__jacobPreparationSlots?.running, 0, "cancel releases render slot");
    assert.equal(globalThis.__jacobPreparations?.has("cancel-test"), false);
    globalThis.__getItDocumentAI = undefined;
    console.log("PASS: cancellation/deletion without resurrection, local source import + explicit seed retry from cache + default chat seeded before ready, page coverage, duplicate/wrong/empty rejection, selective visual rendering, interrupted preparation recovery, original text + visual notes persistence. No AI called.");
  } finally { fs.rmSync(directory, { recursive:true, force:true }); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
