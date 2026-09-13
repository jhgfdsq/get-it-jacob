// Modified September 2026 for Get It Jacob; see NOTICE.
/** Local, document-scoped image attachments. Saving a capture never calls AI. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { docDir } from "./paths";
import { getDoc } from "./store";
import { MAX_CAPTURE_BYTES, MAX_CAPTURE_DIMENSION, MAX_CAPTURE_PIXELS, MAX_CAPTURES_PER_MESSAGE, type CaptureAttachment, type CaptureSource } from "./capture-types";

type StoredCapture = CaptureAttachment & { format: "png" | "jpeg" };
type Manifest = { version: 1; nextNumber: number; captures: StoredCapture[] };
export class CaptureError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function requireDocument(docId: string) {
  const doc = /^[a-z0-9-]{1,64}$/.test(docId) ? getDoc(docId) : undefined;
  if (!doc) throw new CaptureError("Document introuvable.", 404);
  return doc;
}
function folder(docId: string) { return path.join(docDir(docId), "captures"); }
function readManifest(docId: string): Manifest {
  const target = path.join(folder(docId), "manifest.json");
  if (!fs.existsSync(target)) return { version: 1, nextNumber: 1, captures: [] };
  const value = JSON.parse(fs.readFileSync(target, "utf8")) as Manifest;
  if (value.version !== 1 || !Number.isSafeInteger(value.nextNumber) || value.nextNumber < 1 || !Array.isArray(value.captures)) throw new Error("Le registre des captures est illisible.");
  return value;
}
function dimensions(bytes: Buffer, format: "png" | "jpeg") {
  if (format === "png") {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") throw new CaptureError("Image PNG invalide.");
    let cursor = 8;
    let sawPixels = false;
    let complete = false;
    while (cursor + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(cursor);
      if (length > bytes.length - cursor - 12) break;
      const chunk = bytes.toString("ascii", cursor + 4, cursor + 8);
      if (chunk === "IDAT") sawPixels = true;
      if (chunk === "IEND") { complete = length === 0; break; }
      cursor += length + 12;
    }
    if (!complete || !sawPixels) throw new CaptureError("Image PNG incomplète.");
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw new CaptureError("Image JPEG invalide.");
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) throw new CaptureError("Image JPEG invalide.");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    offset += length;
  }
  throw new CaptureError("Dimensions JPEG introuvables.");
}
function validDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= MAX_CAPTURE_DIMENSION && height <= MAX_CAPTURE_DIMENSION && width * height <= MAX_CAPTURE_PIXELS;
}
function metadata(capture: StoredCapture): CaptureAttachment {
  const { id, name, pageIndex, width, height, url } = capture;
  return { id, name, pageIndex, width, height, url };
}
export async function saveCapture(docId: string, source: CaptureSource): Promise<CaptureAttachment> {
  const doc = requireDocument(docId);
  if (!source || !Number.isInteger(source.pageIndex) || !doc.extracted.pages.some(page => page.pageIndex === source.pageIndex)) throw new CaptureError("La page de la capture est invalide.");
  if (!validDimensions(source.width, source.height)) throw new CaptureError("Capture trop grande : 8 192 pixels par côté et 24 millions de pixels maximum.");
  if (typeof source.dataUrl !== "string" || source.dataUrl.length > Math.ceil(MAX_CAPTURE_BYTES / 3) * 4 + 32) throw new CaptureError("La capture dépasse 12 Mo.", 413);
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source.dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new CaptureError("La capture doit être une image PNG ou JPEG valide.");
  const format = match[1] as "png" | "jpeg";
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_CAPTURE_BYTES) throw new CaptureError("La capture dépasse 12 Mo.", 413);
  const size = dimensions(bytes, format);
  if (!validDimensions(size.width, size.height) || size.width !== source.width || size.height !== source.height) throw new CaptureError("Les dimensions de la capture ne correspondent pas à l’image.");
  let image;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    image = await Promise.race([
      loadImage(bytes),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Image decode timed out")), 5_000); }),
    ]);
  } catch { throw new CaptureError("L’image de la capture est illisible."); }
  finally { clearTimeout(timer); }
  if (image.width !== size.width || image.height !== size.height) throw new CaptureError("Les dimensions décodées de la capture sont invalides.");
  // Re-encode the decoded pixels, discarding metadata and arbitrary trailing data.
  const canvas = createCanvas(size.width, size.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  const canonical = format === "png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg", 95);
  if (canonical.length > MAX_CAPTURE_BYTES) throw new CaptureError("La capture dépasse 12 Mo une fois décodée.", 413);
  // No await between reading and committing the manifest: concurrent uploads
  // receive distinct monotonic names in the single local server process.
  requireDocument(docId);
  const manifest = readManifest(docId);
  const id = randomUUID();
  const capture: StoredCapture = { id, name: `Capture d’écran ${manifest.nextNumber}`, pageIndex: source.pageIndex, ...size, url: `/api/captures/${docId}/${id}`, format };
  fs.mkdirSync(folder(docId), { recursive: true });
  const imagePath = path.join(folder(docId), `${id}.${format}`);
  fs.writeFileSync(imagePath, canonical, { flag: "wx" });
  manifest.captures.push(capture);
  manifest.nextNumber++;
  const target = path.join(folder(docId), "manifest.json");
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(manifest)); fs.renameSync(temporary, target); }
  catch (error) { fs.rmSync(imagePath, { force: true }); fs.rmSync(temporary, { force: true }); throw error; }
  return metadata(capture);
}
export function resolveCapture(docId: string, captureId: string): { capture: CaptureAttachment; path: string; contentType: string } {
  requireDocument(docId);
  if (typeof captureId !== "string" || !/^[a-f0-9-]{36}$/.test(captureId)) throw new CaptureError("Capture introuvable dans ce document.", 404);
  const stored = readManifest(docId).captures.find(capture => capture.id === captureId);
  if (!stored || !["png", "jpeg"].includes(stored.format)) throw new CaptureError("Capture introuvable dans ce document.", 404);
  const imagePath = path.join(folder(docId), `${captureId}.${stored.format}`);
  if (!fs.existsSync(imagePath) || !fs.lstatSync(imagePath).isFile()) throw new CaptureError("Le fichier de cette capture est introuvable.", 404);
  return { capture: metadata(stored), path: imagePath, contentType: `image/${stored.format}` };
}
export function resolveCaptures(docId: string, ids: unknown, enforceLimit = true) {
  if (ids == null) return [];
  if (!Array.isArray(ids) || (enforceLimit && ids.length > MAX_CAPTURES_PER_MESSAGE) || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) throw new CaptureError(`Joignez au maximum ${MAX_CAPTURES_PER_MESSAGE} captures distinctes par message.`);
  return ids.map(id => resolveCapture(docId, id));
}
