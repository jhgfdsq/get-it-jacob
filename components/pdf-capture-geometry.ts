// Modified September 2026 for Get It Jacob; see NOTICE.
export type CaptureRect = { x: number; y: number; width: number; height: number };
export type CapturePoint = { x: number; y: number };
export type CaptureHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
export function drawCaptureRect(start: CapturePoint, end: CapturePoint): CaptureRect {
  const x = Math.min(clampUnit(start.x), clampUnit(end.x));
  const y = Math.min(clampUnit(start.y), clampUnit(end.y));
  return { x, y, width: Math.abs(clampUnit(end.x) - clampUnit(start.x)), height: Math.abs(clampUnit(end.y) - clampUnit(start.y)) };
}
export function moveCaptureRect(rect: CaptureRect, dx: number, dy: number): CaptureRect {
  return { ...rect, x: Math.max(0, Math.min(1 - rect.width, rect.x + dx)), y: Math.max(0, Math.min(1 - rect.height, rect.y + dy)) };
}
export function resizeCaptureRect(rect: CaptureRect, handle: CaptureHandle, point: CapturePoint): CaptureRect {
  let left = rect.x, right = rect.x + rect.width, top = rect.y, bottom = rect.y + rect.height;
  if (handle.includes("w")) left = clampUnit(point.x);
  if (handle.includes("e")) right = clampUnit(point.x);
  if (handle.includes("n")) top = clampUnit(point.y);
  if (handle.includes("s")) bottom = clampUnit(point.y);
  return drawCaptureRect({ x: left, y: top }, { x: right, y: bottom });
}
