import { memo } from 'react';
import { SIGNAL_TYPES } from '../../nodes/NodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import type { Edge, Port, XY } from '../../types/graph';

type Props = {
  edge: Edge;
  sourcePort: Port;
  source: XY;
  target: XY;
  selected: boolean;
  dimmed?: boolean;
  path?: string;
};

function CanvasEdge({ edge, sourcePort, source, target, selected, dimmed, path }: Props) {
  const selectEdge = useCanvasStore(state => state.selectEdge);
  if (!path) return <g className="edge edge-unroutable" onPointerDown={event => { event.stopPropagation(); selectEdge(edge.id); }}>
    <title>Cable cannot be routed without a collision</title>
    {[source, target].map((point, i) => <circle key={i} cx={point.x} cy={point.y} r={7} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />)}
  </g>;
  return <g className="edge">
    <path d={path} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" pointerEvents="stroke" onPointerDown={event => { event.stopPropagation(); selectEdge(edge.id); }} />
    <path d={path} fill="none" stroke="#f8fafc" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
    <path d={path} fill="none" stroke={dimmed ? '#94a3b8' : SIGNAL_TYPES[sourcePort.signalType].color} strokeOpacity={dimmed ? 0.25 : 0.9} strokeWidth={selected ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
    {edge.label && <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 8} fontSize={11} fill="#0f172a" pointerEvents="none">{edge.label}</text>}
  </g>;
}

export default memo(CanvasEdge);
