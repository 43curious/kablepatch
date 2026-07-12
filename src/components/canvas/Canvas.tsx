import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import type { Node, Port, XY } from '../../types/graph';
import CanvasEdge from './CanvasEdge';
import CanvasNode from './CanvasNode';
import { NODE_WIDTH, nodeHeight, portPosition, routeEdges, snapXY, straightPath, toWorld } from './geometry';
import FloatingToolbar from '../panels/FloatingToolbar';

type Draft = { node: Node; port: Port; to: XY } | null;

export default function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const s = useCanvasStore();
  const [draft, setDraft] = useState<Draft>(null);
  const [space, setSpace] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { s.loadFromStorage(); setLoaded(true); }, []);
  useEffect(() => {
    if (!loaded) return;
    const save = window.setTimeout(s.saveToStorage, 250);
    return () => window.clearTimeout(save);
  }, [loaded, s.nodes, s.edges, s.viewport, s.spaces]);
  useEffect(() => {
    if (!draft) return;
    const cancel = () => setDraft(null);
    window.addEventListener('pointerup', cancel);
    return () => window.removeEventListener('pointerup', cancel);
  }, [draft]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
      if (typing) return;
      if (e.code === 'Space') setSpace(true);
      if (e.key === 'Escape') { setDraft(null); s.selectNode(null); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (s.selectedNodeId) s.deleteNode(s.selectedNodeId); if (s.selectedEdgeId) s.deleteEdge(s.selectedEdgeId); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') e.shiftKey ? s.redo() : s.undo();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') s.redo();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); s.selectAll(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') s.setViewport({ ...s.viewport, zoom: 1 });
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') fit();
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [s.selectedNodeId, s.selectedEdgeId, s.viewport, s.nodes]);

  const world = (e: React.PointerEvent | React.WheelEvent) => toWorld({ x: e.clientX, y: e.clientY }, svgRef.current!, s.viewport);
  const panStart = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.button !== 1 && !space) || (e.target as Element).closest('g')) {
      if (e.button === 0 && !(e.target as Element).closest('g')) s.selectNode(null);
      return;
    }
    e.preventDefault();
    s.selectNode(null);
    const start = { x: e.clientX, y: e.clientY, vx: s.viewport.x, vy: s.viewport.y };
    const svg = e.currentTarget;
    const buttonMask = e.button === 1 ? 4 : 1;
    const stop = (ev: PointerEvent) => { svg.releasePointerCapture(ev.pointerId); svg.onpointermove = null; svg.onpointerup = null; svg.onpointercancel = null; };
    svg.setPointerCapture(e.pointerId);
    svg.onpointermove = ev => {
      if ((ev.buttons & buttonMask) === 0) return stop(ev);
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
      s.setViewport({ ...s.viewport, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y });
    };
    svg.onpointerup = stop;
    svg.onpointercancel = stop;
  };
  const wheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!e.ctrlKey && !e.metaKey) return s.setViewport({ ...s.viewport, x: s.viewport.x - (e.shiftKey ? e.deltaY : e.deltaX), y: s.viewport.y - (e.shiftKey ? 0 : e.deltaY) });
    const before = world(e);
    const zoom = Math.min(3, Math.max(0.2, s.viewport.zoom * Math.exp(-e.deltaY * 0.001)));
    const r = svgRef.current!.getBoundingClientRect();
    s.setViewport({ x: e.clientX - r.left - before.x * zoom, y: e.clientY - r.top - before.y * zoom, zoom });
  };
  const fit = () => {
    if (!svgRef.current || !s.nodes.length) return;
    const r = svgRef.current.getBoundingClientRect(), pad = 64;
    const minX = Math.min(...s.nodes.map(n => n.position.x)), minY = Math.min(...s.nodes.map(n => n.position.y));
    const maxX = Math.max(...s.nodes.map(n => n.position.x + NODE_WIDTH)), maxY = Math.max(...s.nodes.map(n => n.position.y + nodeHeight(n)));
    const zoom = Math.min(3, Math.max(.2, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))));
    s.setViewport({ x: (r.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (r.height - (maxY - minY) * zoom) / 2 - minY * zoom, zoom });
  };
  const dragSpace = (name: string, e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let last = start;
    const g = e.currentTarget;
    const stop = (ev: PointerEvent) => { g.releasePointerCapture(ev.pointerId); g.onpointermove = null; g.onpointerup = null; g.onpointercancel = null; };
    g.setPointerCapture(e.pointerId);
    g.onpointermove = ev => {
      if ((ev.buttons & 1) === 0) return stop(ev);
      s.moveSpace(name, (ev.clientX - last.x) / s.viewport.zoom, (ev.clientY - last.y) / s.viewport.zoom);
      last = { x: ev.clientX, y: ev.clientY };
    };
    g.onpointerup = stop;
    g.onpointercancel = stop;
  }; 
  const edgePaths = useMemo(() => {
    const byId = new Map(s.nodes.map(n => [n.id, n]));
    return new Map(routeEdges(s.edges.flatMap(e => {
      const a = byId.get(e.sourceNodeId), b = byId.get(e.targetNodeId);
      const source = a?.ports.find(p => p.id === e.sourcePortId), target = b?.ports.find(p => p.id === e.targetPortId);
      return a && b && source && target ? [{ id: e.id, source: portPosition(a, source.id), target: portPosition(b, target.id), sourceNodeId: a.id, targetNodeId: b.id }] : [];
    }), s.nodes).map(e => [e.id, e.path]));
  }, [s.edges, s.nodes]);

  const spaceBoxes = s.spaces.map(space => {
    const ns = s.nodes.filter(n => n.space === space.name);
    if (!ns.length) return null;
    const pad = 32, minX = Math.min(...ns.map(n => n.position.x)) - pad, minY = Math.min(...ns.map(n => n.position.y)) - pad;
    const maxX = Math.max(...ns.map(n => n.position.x + NODE_WIDTH)) + pad, maxY = Math.max(...ns.map(n => n.position.y + nodeHeight(n))) + pad;
    return { ...space, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }).filter(Boolean) as { name: string; color: string; x: number; y: number; w: number; h: number }[];

  return <div className="app">
    <svg ref={svgRef} className="canvas" onPointerDown={panStart} onPointerMove={e => draft && setDraft({ ...draft, to: snapXY(world(e)) })} onPointerUp={() => draft && setDraft(null)} onWheel={wheel}>
      <defs>
        <filter id="nodeShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" /></filter>
      </defs>
      <rect width="100%" height="100%" fill="#f8fafc" />
      <g transform={`translate(${s.viewport.x} ${s.viewport.y}) scale(${s.viewport.zoom})`}>
        {spaceBoxes.map(b => <g className="space-box" key={b.name} onPointerDown={e => dragSpace(b.name, e)}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} stroke={b.color} /><text x={b.x + 10} y={b.y + 20}>{b.name}</text></g>)}
        {s.edges.map(e => <CanvasEdge key={e.id} edge={e} nodes={s.nodes} selected={s.selectedEdgeId === e.id} dimmed={!!s.selectedEdgeId && s.selectedEdgeId !== e.id} path={edgePaths.get(e.id)} />)}
        {s.nodes.map(n => <CanvasNode key={n.id} node={n} selected={s.selectedNodeId === n.id || s.selectedNodeIds.includes(n.id)} onPortDown={(node, port, e) => { e.stopPropagation(); setDraft({ node, port, to: portPosition(node, port.id) }); }} onPortUp={(node, port, e) => { e.stopPropagation(); if (draft) s.addEdge(draft.node.id, draft.port.id, node.id, port.id); setDraft(null); }} />)}
        {draft && <path d={straightPath(portPosition(draft.node, draft.port.id), draft.to, s.nodes)} fill="none" stroke="#0f172a" strokeWidth={2} strokeDasharray="6 4" />}
      </g>
    </svg>
    <div className="zoom-controls"><button onClick={() => s.setViewport({ ...s.viewport, zoom: Math.min(3, s.viewport.zoom * 1.2) })}>+</button><button onClick={() => s.setViewport({ ...s.viewport, zoom: Math.max(.2, s.viewport.zoom / 1.2) })}>−</button><button onClick={fit}>Fit</button><button onClick={() => s.setViewport({ x: 0, y: 0, zoom: 1 })}>100%</button></div>
    <FloatingToolbar svgRef={svgRef} />
  </div>;
}
