import { useState } from 'react';
import { NODE_GAP, useCanvasStore } from '../../store/canvasStore';
import type { Node, Port, XY } from '../../types/graph';
import ConnectionDot from './ConnectionDot';
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT, nodeHeight, nodeRect, portPosition, snapXY } from './geometry';

type Props = {
  node: Node;
  selected: boolean;
  onPortDown: (node: Node, port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
  onPortUp: (node: Node, port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
};

export default function CanvasNode({ node, selected, onPortDown, onPortUp }: Props) {
  const { updateNode, selectNode, portLayer } = useCanvasStore();
  const [renaming, setRenaming] = useState(false);
  const inputs = node.ports.filter(p => p.side === 'input');
  const outputs = node.ports.filter(p => p.side === 'output');
  const h = nodeHeight(node);
  const label = (p: Port) => portLayer ? (p.aliases?.[portLayer - 1] || p.label) : p.label;

  const startDrag = (e: React.PointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    selectNode(node.id);
    const start: XY = { x: e.clientX, y: e.clientY };
    const original = node.position;
    const zoom = useCanvasStore.getState().viewport.zoom;
    const header = e.currentTarget;
    const freeSpot = (moved: Node, nodes: Node[]) => {
      const hit = (a: ReturnType<typeof nodeRect>, b: ReturnType<typeof nodeRect>) => a.x < b.x + b.w + NODE_GAP && a.x + a.w + NODE_GAP > b.x && a.y < b.y + b.h + NODE_GAP && a.y + a.h + NODE_GAP > b.y;
      for (let i = 0; i < 200; i++) {
        const n = { ...moved, position: snapXY({ x: moved.position.x + i * NODE_GAP, y: moved.position.y + i * NODE_GAP }) };
        if (!nodes.some(x => x.id !== moved.id && hit(nodeRect(n), nodeRect(x)))) return n;
      }
      return moved;
    };
    const stop = (ev: PointerEvent) => {
      useCanvasStore.setState(s => {
        const moved = s.nodes.find(n => n.id === node.id);
        return moved ? { nodes: s.nodes.map(n => n.id === node.id ? freeSpot(moved, s.nodes) : n) } : s;
      });
      header.releasePointerCapture(ev.pointerId); header.onpointermove = null; header.onpointerup = null; header.onpointercancel = null;
    };
    header.setPointerCapture(e.pointerId);
    header.onpointermove = ev => {
      if ((ev.buttons & 1) === 0) return stop(ev);
      useCanvasStore.setState(s => ({ nodes: s.nodes.map(n => n.id === node.id ? { ...n, position: snapXY({ x: original.x + (ev.clientX - start.x) / zoom, y: original.y + (ev.clientY - start.y) / zoom }) } : n) }));
    };
    header.onpointerup = stop;
    header.onpointercancel = stop;
  };

  return <g transform={`translate(${node.position.x} ${node.position.y})`} onPointerDown={e => { e.stopPropagation(); selectNode(node.id); }}>
    <rect width={NODE_WIDTH} height={h} fill="#fff" stroke={selected ? '#2196F3' : '#e0e0e0'} strokeWidth={selected ? 2 : 1} filter="url(#nodeShadow)" />
    <rect className="node-header" width={NODE_WIDTH} height={HEADER_HEIGHT} fill={node.headerColor} onPointerDown={startDrag} />
    <rect y={24} width={NODE_WIDTH} height={10} fill={node.headerColor} onPointerDown={startDrag} />
    <text x={10} y={22} fill="#fff" fontSize={13} fontWeight={700} onDoubleClick={() => setRenaming(true)}>{node.label}</text>
    {renaming && <foreignObject x={6} y={5} width={NODE_WIDTH - 12} height={25}>
      <input autoFocus defaultValue={node.label} onBlur={e => { updateNode(node.id, { label: e.currentTarget.value }); setRenaming(false); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </foreignObject>}
    <line x1={NODE_WIDTH / 2} y1={HEADER_HEIGHT} x2={NODE_WIDTH / 2} y2={h - 8} stroke="#eee" />
    {inputs.map((p, i) => <g key={p.id}>
      <text x={12} y={portPosition(node, p.id).y - node.position.y + 4} fontSize={11} fill="#555">{label(p)}</text>
      <ConnectionDot port={p} x={0} y={portPosition(node, p.id).y - node.position.y} onPointerUp={(port, e) => onPortUp(node, port, e)} />
    </g>)}
    {outputs.map((p, i) => <g key={p.id}>
      <text x={NODE_WIDTH - 12} y={portPosition(node, p.id).y - node.position.y + 4} textAnchor="end" fontSize={11} fill="#555">{label(p)}</text>
      <ConnectionDot port={p} x={NODE_WIDTH} y={portPosition(node, p.id).y - node.position.y} onPointerDown={(port, e) => onPortDown(node, port, e)} />
    </g>)}
  </g>;
}
