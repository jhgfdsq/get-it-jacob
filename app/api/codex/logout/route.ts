// Modified for Get It Jacob: disconnect reader runtime too.
/**
 * POST /api/codex/logout
 *
 * Runs `codex logout`. Returns { ok: boolean }. The client side
 * follows up by re-launching the Electron setup wizard.
 */

import { NextResponse } from "next/server";
import { clearReaderAuth } from "@/lib/clear-reader-auth";
import { runLogout } from "@/lib/codex-account";

export const runtime = "nodejs";

export async function POST() {
  clearReaderAuth();
  const ok = runLogout();
  return NextResponse.json({ ok });
}
