import assert from "node:assert/strict";
import { diagramEdgePath } from "../lib/manual-diagram-layout";
import { parseManualVisual } from "../lib/manual-visual-schema";
const base = { title: "Revenus publiés", explanation: "Unité et période d'après le document.", sourcePages: [2] };
const graph = { ...base, kind: "graph", chart: "bar", unit: "M€ 2025", points: [{ label: "A", value: 25 }, { label: "B", value: -5 }] };
assert.deepEqual(parseManualVisual(JSON.stringify(graph)), graph);
assert.deepEqual(parseManualVisual("```json\n" + JSON.stringify(graph) + "\n```"), graph);
assert.throws(() => parseManualVisual(JSON.stringify({ ...graph, points: [] })));
assert.throws(() => parseManualVisual(JSON.stringify({ ...graph, sourcePages: [0] })));
assert.throws(() => parseManualVisual(JSON.stringify({ ...graph, chart: "javascript", code: "alert(1)" })));
const diagram = { ...base, kind: "diagram", nodes: [{ id: "a", label: "Début" }, { id: "b", label: "Fin" }], edges: [{ from: "a", to: "b", label: "cause" }] };
assert.deepEqual(parseManualVisual(JSON.stringify(diagram)), diagram);
assert.throws(() => parseManualVisual(JSON.stringify({ ...diagram, edges: [{ from: "a", to: "missing", label: "invalid" }] })));
assert.throws(() => parseManualVisual(JSON.stringify({ ...diagram, nodes: [{ id: "a", label: "one" }, { id: "a", label: "two" }] })));
console.log("PASS: declarative visual validation, invalid sources, executable chart type, missing edges and duplicate nodes.");

assert.equal(diagramEdgePath({ x: 20, y: 25 }, { x: 280, y: 25 }), "M 250 60 L 265 60 L 265 60 L 280 60");
assert.equal(diagramEdgePath({ x: 280, y: 25 }, { x: 20, y: 135 }), "M 280 60 L 265 60 L 265 170 L 250 170");
assert.equal(diagramEdgePath({ x: 20, y: 25 }, { x: 20, y: 245 }), "M 20 60 L 8 60 L 8 280 L 20 280");
assert.equal(diagramEdgePath({ x: 280, y: 25 }, { x: 280, y: 245 }), "M 510 60 L 532 60 L 532 280 L 510 280");
assert(diagramEdgePath({ x: 20, y: 25 }, { x: 20, y: 25 }).endsWith("L 135 25"));
console.log("PASS: diagram arrows end on box boundaries and route vertical lines through clear gutters.");

assert.notEqual(diagramEdgePath({ x: 20, y: 25 }, { x: 280, y: 135 }, 3), diagramEdgePath({ x: 20, y: 135 }, { x: 280, y: 25 }, 4));
assert(diagramEdgePath({ x: 20, y: 25 }, { x: 280, y: 135 }, 3).includes("L 259 "));
assert(diagramEdgePath({ x: 20, y: 135 }, { x: 280, y: 25 }, 4).includes("L 265 "));
console.log("PASS: diagonal relations use distinct ports and lanes.");
