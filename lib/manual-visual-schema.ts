import { z } from "zod";
const common = { title: z.string().min(1).max(160), explanation: z.string().max(4000), sourcePages: z.array(z.number().int().positive()).min(1).max(30) };
export const manualVisualSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("graph"), chart: z.enum(["bar", "line"]), unit: z.string().min(1).max(120), points: z.array(z.object({ label: z.string().min(1).max(120), value: z.number().finite() })).min(1).max(40) }),
  z.object({ ...common, kind: z.literal("diagram"), nodes: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(100) })).min(1).max(16), edges: z.array(z.object({ from: z.string().max(40), to: z.string().max(40), label: z.string().max(100) })).max(30) }),
]);
export type ManualVisualSpec = z.infer<typeof manualVisualSchema>;
export type SavedVisual = { id: string; createdAt: number; pageIndex: number; selection: string; spec: ManualVisualSpec };
export function parseManualVisual(raw: string): ManualVisualSpec {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const spec = manualVisualSchema.parse(JSON.parse(clean));
  if (spec.kind === "diagram") {
    const ids = new Set(spec.nodes.map((node) => node.id));
    if (ids.size !== spec.nodes.length || spec.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) throw new Error("Le diagramme contient des relations invalides.");
  }
  return spec;
}
