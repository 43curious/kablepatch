import { SIGNAL_TYPES } from '../../nodes/NodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import type { Edge, Node } from '../../types/graph';
import { portPosition, straightPath } from './geometry';

export default function CanvasEdge({ edge, nodes, selected, dimmed, offset = 0, path }: { edge: Edge; nodes: Node[]; selected: boolean; dimmed?: boolean; offset?: number; path?: string }) {
  const selectEdge = useCanvasStore(s => s.selectEdge);
  const a = nodes.find(n => n.id === edge.sourceNodeId);
  const b = nodes.find(n => n.id === edge.targetNodeId);
  const source = a?.ports.find(p => p.id === edge.sourcePortId);
  const target = b?.ports.find(p => p.id === edge.targetPortId);
  if (!a || !b || !source || !target) return null;
  const p1 = portPosition(a, edge.sourcePortId);
  const p2 = portPosition(b, edge.targetPortId);
  const d = path ?? straightPath(p1, p2, nodes, offset, source.side, target.side);
  return <g className="edge" onPointerDown={e => { e.stopPropagation(); selectEdge(edge.id); }}>
    <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
    <path d={d} fill="none" stroke={dimmed ? '#94a3b8' : SIGNAL_TYPES[source.signalType].color} strokeOpacity={dimmed ? 0.25 : 0.9} strokeWidth={selected ? 3 : 2} />
    {edge.label && <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 8} fontSize={11} fill="#0f172a">{edge.label}</text>}
  </g>;
}
