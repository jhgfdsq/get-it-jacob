// Modified September 2026 for Get It Jacob; see NOTICE.
import { NextResponse } from "next/server";
import { CaptureError } from "@/lib/captures";
import { loadChatDrafts, saveChatDrafts, MAX_DRAFT_BODY_BYTES } from "@/lib/chat-drafts";
export const runtime = "nodejs";
type Context = { params: Promise<{ docId: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof CaptureError ? error.message : "Impossible de lire ou d’enregistrer les brouillons." }, { status: error instanceof CaptureError ? error.status : 500 });
}
export async function GET(_req: Request, ctx: Context) {
  try { return NextResponse.json(loadChatDrafts((await ctx.params).docId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}
export async function PUT(req: Request, ctx: Context) {
  try {
    const { docId } = await ctx.params;
    const reader = req.body?.getReader();
    if (!reader) throw new CaptureError("Brouillons manquants.");
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > MAX_DRAFT_BODY_BYTES) { await reader.cancel(); throw new CaptureError("Les brouillons dépassent 1 Mo.", 413); }
      chunks.push(item.value);
    }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new CaptureError("Brouillons invalides."); }
    return NextResponse.json(saveChatDrafts(docId, value), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
