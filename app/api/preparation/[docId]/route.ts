import { NextResponse } from "next/server";
import { getDoc } from "@/lib/store";
import { cancelPreparation, readPreparation, startPreparation, type PreparationState } from "@/lib/preparation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ docId: string }> };
function progress(state: PreparationState) {
  // Polling transfers coverage, never all notes again.
  return { ...state, pages: state.pages.map(({ pageIndex }) => ({ pageIndex })) };
}
export async function GET(_request: Request, context: Context) {
  const { docId } = await context.params;
  if (!getDoc(docId)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  return NextResponse.json(progress(readPreparation(docId)), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: Context) {
  const { docId } = await context.params;
  if (!getDoc(docId)) return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === "cancel") {
    cancelPreparation(docId);
    return NextResponse.json(progress(readPreparation(docId)));
  }
  if (body.action && body.action !== "start" && body.action !== "resume") return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  return NextResponse.json(progress(startPreparation(docId)), { status: 202 });
}
