// Modified September 2026 for Get It Jacob; see NOTICE.
import assert from "node:assert/strict";
import { drawCaptureRect, moveCaptureRect, resizeCaptureRect } from "../components/pdf-capture-geometry";
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const drawn = drawCaptureRect({ x: 0.8, y: 0.7 }, { x: -0.4, y: 1.4 });
assert.deepEqual(drawn, { x: 0, y: 0.7, width: 0.8, height: 0.30000000000000004 });
const box = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };
const moved = moveCaptureRect(box, 1, -1);
close(moved.x, 0.6); close(moved.y, 0); close(moved.width, 0.4); close(moved.height, 0.2);
const enlarged = resizeCaptureRect(box, "se", { x: 2, y: 2 });
close(enlarged.width, 0.8); close(enlarged.height, 0.7);
const crossed = resizeCaptureRect(box, "nw", { x: 0.9, y: 0.8 });
close(crossed.x, 0.6); close(crossed.y, 0.5); close(crossed.width, 0.3); close(crossed.height, 0.3);
const north = resizeCaptureRect(box, "n", { x: 0.95, y: 0.1 });
close(north.x, box.x); close(north.width, box.width); close(north.y, 0.1); close(north.height, 0.4);
console.log("PASS: reverse drawing, page boundaries, move clamps, resize and crossed handles preserve a valid source crop.");
