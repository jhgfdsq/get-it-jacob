// Modified September 2026 for Get It Jacob; see NOTICE.
import { NextResponse } from "next/server";
import { CaptureError, saveCapture } from "@/lib/captures";
import { MAX_CAPTURE_BYTES, type CaptureSource } from "@/lib/capture-types";
export const runtime = "nodejs";
export async function POST(req: Request, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params;
  try {
    // Bound streamed JSON too: Content-Length is optional and not authoritative.
    const reader = req.body?.getReader();
    if (!reader) throw new CaptureError("Capture manquante.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > Math.ceil(MAX_CAPTURE_BYTES / 3) * 4 + 1024) { await reader.cancel(); throw new CaptureError("La capture dépasse 12 Mo.", 413); }
      chunks.push(item.value);
    }
    let source: CaptureSource;
    try { source = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new CaptureError("Capture invalide."); }
    return NextResponse.json({ capture: await saveCapture(docId, source) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CaptureError ? error.message : "Impossible d’enregistrer cette capture." }, { status: error instanceof CaptureError ? error.status : 500 });
  }
}
