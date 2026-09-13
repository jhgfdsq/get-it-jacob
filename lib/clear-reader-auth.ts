// Modified for Get It Jacob: also clear app-owned auth after explicit sign-out.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths';
import { shutdownDocumentAI } from './document-ai';
export function clearReaderAuth() {
  shutdownDocumentAI();
  const filename = path.join(DATA_DIR,'codex-runtime','auth.json');
  try { fs.unlinkSync(filename); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
}
