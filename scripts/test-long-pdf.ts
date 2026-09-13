/** Real 205-page upload, extraction and rendering. No external AI is invoked. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DocumentAIServer } from "../lib/document-ai";

async function main() {
  fs.mkdirSync("work", { recursive: true });
  const directory = fs.mkdtempSync(path.resolve("work/long-pdf-test-"));
  process.env.GETIT_DATA_DIR = directory;
  const { POST: upload } = await import("../app/api/upload/route");
  const { readPreparation, buildPreparedContext, startPreparation } = await import("../lib/preparation");
  const { getDoc } = await import("../lib/store");
  const { loadWorkContext } = await import("../lib/work-context");
  const { docDir } = await import("../lib/paths");
  const pageCount = 205;
  const pagesSeen: number[] = [];
  let seedCalls = 0;
  let docId = "";
  const startedAt = Date.now();
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let number = 1; number <= pageCount; number++) {
      const page = pdf.addPage([400, 500]);
      page.drawText(`PAGE ${number} SUR ${pageCount} - TEMOIN ${number * 17}`, { x: 30, y: 440, size: 14, font });
      // Include a vector figure on every page and beyond the old 150-page gate.
      page.drawRectangle({ x: 35, y: 40, width: 50 + number, height: 160, color: rgb(0.2, 0.6, 0.8) });
    }
    const bytes = await pdf.save();
    const inputFile = path.resolve("work/205-pages.pdf");
    fs.writeFileSync(inputFile, bytes);
    globalThis.__getItDocumentAI = {
      run: async (args: { input: string; imagePaths?: string[] }) => {
        if (args.imagePaths?.length) {
          seedCalls++;
          assert.equal(args.imagePaths.length, pageCount, "one context load includes every visual source");
          const indices = args.imagePaths.map(file => {
            const pageNumber = Number(path.basename(file).match(/^page-(\d+)\.(?:png|jpg)$/)?.[1]);
            assert.ok(pageNumber >= 1 && pageNumber <= pageCount);
            const image = fs.readFileSync(file);
            assert.equal(image.readUInt16BE(0), 0xffd8, "each visual page really rendered as JPEG");
            assert.ok(image.length > 1000);
            assert.ok(args.input.includes(`PAGE ${pageNumber} SUR ${pageCount} - TEMOIN ${pageNumber * 17}`), "text is aligned with each rendered source page");
            pagesSeen.push(pageNumber);
            return pageNumber - 1;
          });
          assert.equal(indices.length, pageCount);
          return { text: "Document prêt.", threadId: "long-pdf-seeded-thread" };
        }
        seedCalls++;
        assert.equal(readPreparation(docId).status, "preparing", "not ready until all pages reach the chat");
        for (let number = 1; number <= pageCount; number++) {
          assert.ok(args.input.includes(`PAGE PDF ${number} / ${pageCount}`));
          assert.ok(args.input.includes(`TEMOIN ${number * 17}`));

        }
        return { text: "Document prêt.", threadId: "long-pdf-seeded-thread" };
      },
    } as unknown as DocumentAIServer;

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "205-pages.pdf");
    const response = await upload(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    assert.equal(response.status, 200, "200+ pages are admitted by the actual upload route");
    const result = await response.json();
    docId = result.docId;
    assert.equal(result.numPages, pageCount);
    assert.equal(result.pages.length, pageCount);
    assert.equal(getDoc(docId)?.extracted.pages.length, pageCount);
    const extractedAt = Date.now();
    await globalThis.__jacobPreparations?.get(docId)?.promise;
    const preparation = readPreparation(docId);
    assert.equal(preparation.status, "ready", preparation.error);
    assert.equal(preparation.completedPages, pageCount);
    assert.equal(preparation.pages.length, pageCount);
    assert.deepEqual(pagesSeen, Array.from({ length: pageCount }, (_, index) => index + 1), "every page rendered and prepared once, with no truncation");
    assert.equal(seedCalls, 1);
    assert.ok(loadWorkContext(docId).chats.some(chat => chat.codexThreadId === "long-pdf-seeded-thread"));
    assert.ok(buildPreparedContext(docId).includes("PAGE PDF 205 / 205"));
    startPreparation(docId);
    assert.equal(seedCalls, 1, "reopening never repeats preparation");
    assert.equal(pagesSeen.length, pageCount);
    assert.equal(fs.readdirSync(path.join(docDir(docId), "pages")).length, pageCount);

    // Counter-example: lifting the page gate must not admit damaged PDF input.
    const badForm = new FormData();
    badForm.append("file", new Blob(["%PDF-invalid document"]), "broken.pdf");
    const badResponse = await upload(new Request("http://localhost/api/upload", { method: "POST", body: badForm }));
    assert.equal(badResponse.status, 422);
    assert.equal((await badResponse.json()).code, "unreadable");
    const proof = {
      status: "PASS", pages: pageCount, fileBytes: bytes.length,
      extractAndUploadMs: extractedAt - startedAt, totalWithRenderingMs: Date.now() - startedAt,
      renderedPages: pagesSeen.length, initialContextCalls: seedCalls,
      chatSeeds: seedCalls, externalAICalls: 0, malformedPdfRejected: true,
    };
    fs.writeFileSync("work/long-pdf-result.json", JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof));
  } finally {
    globalThis.__getItDocumentAI = undefined;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
