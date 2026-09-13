// Modified for Get It Jacob: retired automatic analysis pipeline.
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST() {
  return NextResponse.json({error: "Cette analyse automatique est désactivée. Utilisez les actions sur sélection."}, {status: 410});
}
