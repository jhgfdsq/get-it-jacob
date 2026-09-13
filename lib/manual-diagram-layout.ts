/** Fixed two-column diagram routing. Lines terminate on box boundaries,
 * so nodes never paint over arrowheads. Vertical paths run in clear gutters. */
export function diagramEdgePath(a: { x: number; y: number }, b: { x: number; y: number }, slot = 0): string {
  const width = 230, height = 70;
  // Distinct edge ports prevent two relations from sharing a misleading junction.
  const offset = slot ? ((slot % 5) - 2) * 8 : 0;
  const laneOffset = slot ? ((slot % 3) - 1) * 6 : 0;
  const ay = a.y + height / 2 + offset, by = b.y + height / 2 + offset;
  if (a.x === b.x && a.y === b.y) {
    const side = a.x + width;
    return `M ${side} ${ay} L ${side + 12} ${ay} L ${side + 12} ${a.y - 10} L ${a.x + width / 2} ${a.y - 10} L ${a.x + width / 2} ${a.y}`;
  }
  if (a.x !== b.x) {
    const start = a.x < b.x ? a.x + width : a.x;
    const end = a.x < b.x ? b.x : b.x + width;
    const lane = (start + end) / 2 + laneOffset;
    return `M ${start} ${ay} L ${lane} ${ay} L ${lane} ${by} L ${end} ${by}`;
  }
  const side = a.x < 100 ? a.x : a.x + width;
  const lane = a.x < 100 ? side - 12 + laneOffset / 2 : side + 22 + laneOffset / 2;
  return `M ${side} ${ay} L ${lane} ${ay} L ${lane} ${by} L ${side} ${by}`;
}
