"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { diagramEdgePath } from "@/lib/manual-diagram-layout";
import type { ManualVisualSpec, SavedVisual } from "@/lib/manual-visual-schema";
export type VisualRequest = { id: number; kind: "graph" | "diagram"; text: string; pageIndex: number };
export default function ManualVisual({ docId, request }: { docId: string; request?: VisualRequest | null }) {
  const [visuals, setVisuals] = useState<SavedVisual[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<VisualRequest | null>(null);
  const seen = useRef<number | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { let cancelled = false; fetch(`/api/manual-viz/${docId}`).then((r) => r.json()).then((j) => { if (!cancelled) { setVisuals(j.visuals ?? []); setActive(j.visuals?.[0]?.id ?? null); } }).catch(() => {}); return () => { cancelled = true; abort.current?.abort(); }; }, [docId]);
  useEffect(() => { if (request && seen.current !== request.id) { seen.current = request.id; setPending(request); setError(null); } }, [request]);
  const generate = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true); setError(null); const controller = new AbortController(); abort.current = controller;
    try {
      const r = await fetch(`/api/manual-viz/${docId}`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: pending.kind, pageIndex: pending.pageIndex, selection: pending.text }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "La création du visuel a échoué.");
      setVisuals((prev) => [j.visual, ...prev]); setActive(j.visual.id); setPending(null);
    } catch (e) { setError(controller.signal.aborted ? "Création arrêtée." : (e as Error).message); } finally { setBusy(false); abort.current = null; }
  }, [pending, busy, docId]);
  const visual = visuals.find((v) => v.id === active);
  return <div className="h-full overflow-y-auto p-5 text-[var(--ink-900)]">
    {pending && <div className="mb-4 rounded-lg border border-[var(--border-subtle)] p-3"><p className="text-xs text-[var(--ink-500)]">{pending.kind === "graph" ? "Graphique" : "Diagramme"} · page {pending.pageIndex + 1}</p><p className="my-2 line-clamp-4 text-xs">{pending.text}</p><button type="button" onClick={generate} disabled={busy} className="rounded-md bg-[var(--button-primary-bg)] px-3 py-2 text-xs text-white disabled:opacity-50">{busy ? "Création en cours…" : `Créer le ${pending.kind === "graph" ? "graphique" : "diagramme"}`}</button>{busy && <button type="button" onClick={() => abort.current?.abort()} className="ml-3 text-xs">Arrêter</button>}</div>}
    {error && <p role="alert" className="mb-4 text-xs text-red-700">{error}</p>}
    {visuals.length > 0 && <select aria-label="Visuels enregistrés" value={active ?? ""} onChange={(e) => setActive(e.target.value)} className="mb-4 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2 text-xs">{visuals.map((v) => <option key={v.id} value={v.id}>{v.spec.title} · p. {v.pageIndex + 1}</option>)}</select>}
    {busy && <RefreshCw className="my-4 h-5 w-5 animate-spin text-[var(--accent-600)]" />}
    {visual ? <><h2 className="mb-4 text-lg font-medium">{visual.spec.title}</h2><Figure spec={visual.spec} /><p className="mt-4 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink-700)]">{visual.spec.explanation}</p><p className="mt-3 text-[11px] text-[var(--ink-500)]">Pages sources du PDF : {visual.spec.sourcePages.join(", ")}. Visuel créé à votre demande à partir du document, à vérifier avec la source.</p></> : !pending && <div className="flex min-h-60 flex-col items-center justify-center text-center text-sm text-[var(--ink-500)]"><ChartNoAxesCombined className="mb-3 h-7 w-7" /><p>Sélectionnez un passage du PDF puis ouvrez « Créer un visuel » pour choisir un graphique ou un diagramme. Rien n’est généré en arrière-plan.</p></div>}
  </div>;
}
function Figure({ spec }: { spec: ManualVisualSpec }) {
  if (spec.kind === "graph") {
    const values = spec.points.map((p) => p.value); const min = Math.min(0, ...values), max = Math.max(0, ...values); const range = max - min || 1;
    const x = (i: number) => 62 + (i + .5) * 490 / spec.points.length;
    const y = (v: number) => 240 - (v - min) / range * 200;
    return <div className="overflow-x-auto rounded-md bg-[var(--surface-canvas)]"><p className="px-3 pt-3 text-[11px] text-[var(--ink-700)]">{spec.unit}</p><svg viewBox="0 0 590 345" role="img" aria-label={spec.title} className="min-w-[360px] w-full">{Array.from({ length: 5 }, (_, i) => { const v = min + range * i / 4; return <g key={i}><line x1="58" x2="555" y1={y(v)} y2={y(v)} stroke="#ccc" strokeWidth=".5" /><text x="53" y={y(v) + 4} textAnchor="end" fontSize="10" fill="currentColor">{Number(v.toPrecision(3))}</text></g>; })}{spec.chart === "line" && <polyline points={spec.points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="#9b744e" strokeWidth="2" />}{spec.points.map((p, i) => <g key={i}>{spec.chart === "bar" ? <rect x={x(i) - Math.min(20, 180 / spec.points.length)} y={Math.min(y(p.value), y(0))} width={Math.min(40, 360 / spec.points.length)} height={Math.max(1, Math.abs(y(0) - y(p.value)))} fill="#9b744e" /> : <circle cx={x(i)} cy={y(p.value)} r="3" fill="#9b744e" />}<text transform={`translate(${x(i)},260) rotate(40)`} fontSize="10" fill="currentColor">{p.label.length > 24 ? p.label.slice(0, 23) + "…" : p.label}</text></g>)}</svg><table className="w-full border-t border-[var(--border-subtle)] text-xs"><caption className="sr-only">Valeurs du graphique</caption><tbody>{spec.points.map((p, i) => <tr key={i}><td className="px-3 py-1">{p.label}</td><td className="px-3 py-1 text-right tabular-nums">{p.value.toLocaleString("fr-FR")} {spec.unit}</td></tr>)}</tbody></table></div>;
  }
  const positions = new Map(spec.nodes.map((node, i) => [node.id, { x: i % 2 * 260 + 20, y: Math.floor(i / 2) * 110 + 25 }]));
  return <><svg viewBox={`0 0 550 ${Math.ceil(spec.nodes.length / 2) * 110 + 15}`} role="img" aria-label={spec.title} className="w-full rounded-md bg-[var(--surface-canvas)]"><defs><marker id="manual-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9b744e" /></marker></defs>{spec.edges.map((edge, i) => { const a = positions.get(edge.from)!, b = positions.get(edge.to)!; return <path key={i} d={diagramEdgePath(a, b, i + 1)} fill="none" stroke="#9b744e" strokeWidth="1.5" markerEnd="url(#manual-arrow)" />; })}{spec.nodes.map((node) => { const p = positions.get(node.id)!; const words = node.label.match(/.{1,30}(?:\s|$)|.{1,30}/g) ?? [node.label]; return <g key={node.id}><rect x={p.x} y={p.y} width="230" height="70" rx="8" fill="var(--surface-raised)" stroke="#b89d80" /><text x={p.x + 115} y={p.y + 22} textAnchor="middle" fontSize="11" fill="currentColor">{words.slice(0, 4).map((line, i) => <tspan key={i} x={p.x + 115} dy={i ? 13 : 0}>{line}</tspan>)}</text></g>; })}</svg><ul className="mt-3 space-y-1 text-xs text-[var(--ink-700)]">{spec.edges.map((edge, i) => <li key={i}>{spec.nodes.find((n) => n.id === edge.from)?.label} → {spec.nodes.find((n) => n.id === edge.to)?.label}{edge.label ? ` : ${edge.label}` : ""}</li>)}</ul></>;
}
