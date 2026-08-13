import { memo, useState } from 'react';
import { portsAreCompatible, useCanvasStore } from '../../store/canvasStore';
import type { Node, Port, XY } from '../../types/graph';
import type { NodeGeometry } from '../../graph/indexes';
import ConnectionDot from './ConnectionDot';
import { GRID, HEADER_HEIGHT, isEthernetSwitch, isSinglePortNode, portPosition, portSide, snapXY, switchNameStripeY } from './geometry';

type Props = {
  node: Node;
  geometry: NodeGeometry;
  selected: boolean;
  highlightColor?: string;
  readOnly?: boolean;
  connection?: { nodeId: string; port: Port };
  onPortDown: (node: Node, port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
  onPortUp: (node: Node, port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
  onPortClick: (node: Node, port: Port) => void;
};

function CanvasNode({ node, geometry, selected, highlightColor, readOnly = false, connection, onPortDown, onPortUp, onPortClick }: Props) {
  const updateNode = useCanvasStore(s => s.updateNode);
  const selectNode = useCanvasStore(s => s.selectNode);
  const setDraggingNode = useCanvasStore(s => s.setDraggingNode);
  const moveNodeTransient = useCanvasStore(s => s.moveNodeTransient);
  const finishNodeDrag = useCanvasStore(s => s.finishNodeDrag);
  const beginTransaction = useCanvasStore(s => s.beginTransaction);
  const portLayer = useCanvasStore(s => s.portLayer);
  const [renaming, setRenaming] = useState(false);
  const w = geometry.width, h = geometry.height;
  const positionOf = (portId: string) => geometry.ports.get(portId)?.position ?? portPosition(node, portId);
  const ethernet = node.ports.filter(port => port.signalType === 'ethernet');
  const inputs = node.ports.filter(port => port.signalType !== 'ethernet' && portSide(port) === 'input');
  const outputs = node.ports.filter(port => port.signalType !== 'ethernet' && portSide(port) === 'output');
  const compact = isSinglePortNode(node) && !ethernet.length, ethernetSwitch = isEthernetSwitch(node);
  const compactPort = node.ports[0]!;
  const compactInput = compact && portSide(compactPort) === 'input';
  const label = (p: Port) => portLayer ? (p.aliases?.[portLayer - 1] || p.label) : p.label;

  const startDrag = (e: React.PointerEvent<SVGGraphicsElement>) => {
    if (readOnly) return;
    e.stopPropagation();
    if (e.shiftKey) return selectNode(node.id, true);
    let dragged = node;
    if (e.altKey) {
      useCanvasStore.getState().pasteNodes([node], [], { x: GRID * 2, y: GRID * 2 });
      const state = useCanvasStore.getState();
      dragged = state.nodes.find(n => n.id === state.selectedNodeId) ?? node;
    } else selectNode(node.id);
    beginTransaction();
    setDraggingNode(dragged.id);
    const start: XY = { x: e.clientX, y: e.clientY };
    const original = dragged.position;
    const zoom = useCanvasStore.getState().viewport.zoom;
    const header = e.currentTarget;
    let frame = 0, pending: XY | undefined;
    const stop = (ev: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      finishNodeDrag(dragged.id, pending);
      pending = undefined;
      header.releasePointerCapture(ev.pointerId); header.onpointermove = null; header.onpointerup = null; header.onpointercancel = null;
    };
    header.setPointerCapture(e.pointerId);
    header.onpointermove = ev => {
      if ((ev.buttons & 1) === 0) return stop(ev);
      pending = snapXY({ x: original.x + (ev.clientX - start.x) / zoom, y: original.y + (ev.clientY - start.y) / zoom });
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (pending) { moveNodeTransient(dragged.id, pending); pending = undefined; } });
    };
    header.onpointerup = stop;
    header.onpointercancel = stop;
  };

  const dot = (port: Port, x: number, y: number) => {
    const active = connection?.nodeId === node.id && connection.port.id === port.id;
    const connectionState = !connection ? undefined : active ? 'active' : portsAreCompatible(connection.port, port) ? 'compatible' : 'incompatible';
    return <ConnectionDot port={port} x={x} y={y} connectionState={connectionState} onPointerDown={readOnly || port.side === 'input' ? undefined : (item, e) => onPortDown(node, item, e)} onPointerUp={readOnly || port.side === 'output' ? undefined : (item, e) => onPortUp(node, item, e)} onClick={readOnly ? undefined : item => onPortClick(node, item)} />;
  };

  return <g transform={`translate(${node.position.x} ${node.position.y})`} onPointerDown={e => { e.stopPropagation(); if (!readOnly) selectNode(node.id, e.shiftKey); }}>
    {highlightColor && <rect className="vlan-node-highlight" x={-7} y={-7} width={w + 14} height={h + 14} rx={9} fill={highlightColor} stroke={highlightColor} pointerEvents="none" />}
    {compact ? <>
      <rect width={w} height={h} fill="#fff" stroke={selected ? '#2196F3' : '#e0e0e0'} strokeWidth={selected ? 2 : 1} filter="url(#nodeShadow)" />
      <rect className="node-header" x={compactInput ? w - 6 : 0} width={6} height={h} fill={node.headerColor} onPointerDown={startDrag} />
      <rect className="node-header" x={compactInput ? 0 : 6} width={w - 6} height={h} fill="transparent" onPointerDown={startDrag} />
      <text className="node-header-label" x={compactInput ? w - 16 : 16} y={29} textAnchor={compactInput ? 'end' : 'start'} fill="#172033" fontSize={13} fontWeight={700} onPointerDown={startDrag} onDoubleClick={() => !readOnly && setRenaming(true)}>{node.label}</text>
      <text x={compactInput ? 12 : w - 12} y={29} textAnchor={compactInput ? 'start' : 'end'} fontSize={11} fill="#475569">{label(compactPort)}</text>
      {renaming && <foreignObject x={10} y={11} width={w - 20} height={25}><input autoFocus defaultValue={node.label} onBlur={e => { updateNode(node.id, { label: e.currentTarget.value }); setRenaming(false); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></foreignObject>}
      {dot(compactPort, compactInput ? 0 : w, GRID)}
    </> : ethernetSwitch ? <>
      <rect width={w} height={h} fill="#fff" stroke={selected ? '#2196F3' : '#e0e0e0'} strokeWidth={selected ? 2 : 1} filter="url(#nodeShadow)" />
      <rect x={1} y={1} width={w - 2} height={h - 2} fill="none" stroke={node.headerColor} strokeWidth={2} opacity={0.35} pointerEvents="none" />
      <rect className="node-header" x={0} y={switchNameStripeY(node)} width={w} height={40} fill={node.headerColor} onPointerDown={startDrag} />
      <text className="node-header-label" x={w / 2} y={switchNameStripeY(node) + 25} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={700} onPointerDown={startDrag} onDoubleClick={() => !readOnly && setRenaming(true)}>{node.label}</text>
      {renaming && <foreignObject x={w / 2 - Math.min(140, w / 2 - 12)} y={switchNameStripeY(node) + 6} width={Math.min(280, w - 24)} height={28}><input autoFocus defaultValue={node.label} onBlur={e => { updateNode(node.id, { label: e.currentTarget.value }); setRenaming(false); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></foreignObject>}
      {node.ports.map(port => { const point = positionOf(port.id), x = point.x - node.position.x, top = point.y === node.position.y, y = top ? 23 : h - 23, fullLabel = label(port), shortLabel = fullLabel.length > 8 ? `${fullLabel.slice(0, 4)}…${fullLabel.slice(-3)}` : fullLabel; return <g key={port.id}><text x={x} y={y} textAnchor="middle" fontSize={9} fill="#555" transform={`rotate(${top ? 45 : -45} ${x} ${y})`}><title>{fullLabel}</title>{shortLabel}</text>{dot(port, x, top ? 0 : h)}</g>; })}
    </> : <>
      <rect width={w} height={h} fill="#fff" stroke={selected ? '#2196F3' : '#e0e0e0'} strokeWidth={selected ? 2 : 1} filter="url(#nodeShadow)" />
      <rect className="node-header" width={w} height={HEADER_HEIGHT} fill={node.headerColor} onPointerDown={startDrag} />
      <rect y={24} width={w} height={10} fill={node.headerColor} onPointerDown={startDrag} />
      {node.emoji && <text x={10} y={22} fill="#fff" fontSize={14} pointerEvents="none">{node.emoji}</text>}
      <text className="node-header-label" x={node.emoji ? 31 : 10} y={22} fill="#fff" fontSize={13} fontWeight={700} onPointerDown={startDrag} onDoubleClick={() => !readOnly && setRenaming(true)}>{node.label}</text>
      {renaming && <foreignObject x={6} y={5} width={w - 12} height={25}><input autoFocus defaultValue={node.label} onBlur={e => { updateNode(node.id, { label: e.currentTarget.value }); setRenaming(false); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></foreignObject>}
      <line x1={w / 2} y1={HEADER_HEIGHT} x2={w / 2} y2={h - (ethernet.length ? GRID * 2 : 8)} stroke="#eee" />
      {inputs.map(p => { const y = positionOf(p.id).y - node.position.y; return <g key={p.id}><text x={12} y={y + 4} fontSize={11} fill="#555">{label(p)}</text>{dot(p, 0, y)}</g>; })}
      {outputs.map(p => { const y = positionOf(p.id).y - node.position.y; return <g key={p.id}><text x={w - 12} y={y + 4} textAnchor="end" fontSize={11} fill="#555">{label(p)}</text>{dot(p, w, y)}</g>; })}
      {ethernet.map(port => { const point = positionOf(port.id), x = point.x - node.position.x, y = h - 14; return <g key={port.id}><text x={x} y={y} textAnchor="start" fontSize={9} fill="#555" transform={`rotate(-45 ${x} ${y})`}>{label(port)}</text>{dot(port, x, h)}</g>; })}
    </>}
  </g>;
}

export default memo(CanvasNode);
