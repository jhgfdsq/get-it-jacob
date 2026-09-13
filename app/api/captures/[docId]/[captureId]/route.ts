// Modified September 2026 for Get It Jacob; see NOTICE.
import fs from "node:fs";
import { NextResponse } from "next/server";
import { CaptureError, resolveCapture } from "@/lib/captures";
export const runtime = "nodejs";
export async function GET(_req: Request, ctx: { params: Promise<{ docId: string; captureId: string }> }) {
  const { docId, captureId } = await ctx.params;
  try {
    const image = resolveCapture(docId, captureId);
    return new Response(new Uint8Array(fs.readFileSync(image.path)), { headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CaptureError ? error.message : "Impossible de lire cette capture." }, { status: error instanceof CaptureError ? error.status : 500 });
  }
}
