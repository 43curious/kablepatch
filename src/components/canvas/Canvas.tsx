import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../../store/canvasStore';
import type { Edge, Node, Port, XY } from '../../types/graph';
import CanvasEdge from './CanvasEdge';
import CanvasNode from './CanvasNode';
import { CABLE_LANE_SPACING, GRID, HALF_GRID, PORT_MARGIN, nodeHeight, nodeWidth, pointsToSvgPath, portDirection, portPosition, routeOrthogonalConnection, snapXY, straightPath, toWorld } from './geometry';
import type { EdgeRouteInput, RoutedEdge } from './geometry';
import { RoutingWorkerClient } from './routingWorkerClient';
import FloatingToolbar from '../panels/FloatingToolbar';
import type { CanvasDocument } from './share';
import { createGeometryIndex, createGraphIndex, resolveEdges } from '../../graph/indexes';
import type { GeometryIndex } from '../../graph/indexes';
import { historyShortcut, shouldStartCanvasPan } from './canvasInteractions';
import { SIGNAL_TYPES } from '../../nodes/NodeTypes';

type Endpoint = { node: Node; port: Port };
type Draft = (Endpoint & { to: XY }) | null;
type Clipboard = { nodes: Node[]; edges: Edge[] };

const samePoint = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const sameRouteInput = (a: EdgeRouteInput | undefined, b: EdgeRouteInput) => !!a
  && a.sourceNodeId === b.sourceNodeId && a.targetNodeId === b.targetNodeId
  && samePoint(a.source, b.source) && samePoint(a.target, b.target)
  && a.sourceSide === b.sourceSide && a.targetSide === b.targetSide
  && JSON.stringify(a.waypoints ?? []) === JSON.stringify(b.waypoints ?? []);

export default function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipboard = useRef<Clipboard | null>(null);
  const pasteCount = useRef(0);
  const routeCache = useRef(new Map<string, RoutedEdge>());
  const routeInputCache = useRef(new Map<string, EdgeRouteInput>());
  const routingClient = useRef<RoutingWorkerClient | null>(null);
  const geometryCache = useRef<GeometryIndex | undefined>(undefined);
  const readOnlyRef = useRef(false);
  const wheelFrame = useRef(0);
  const wheelPending = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const draftFrame = useRef(0);
  const draftPending = useRef<XY | null>(null);
  const draftRef = useRef<Draft>(null);
  const s = useCanvasStore(useShallow(state => ({
    nodes: state.nodes, edges: state.edges, viewport: state.viewport, spaces: state.spaces, vlans: state.vlans,
    selectedNodeId: state.selectedNodeId, selectedEdgeId: state.selectedEdgeId, selectedVlanId: state.selectedVlanId, selectedNodeIds: state.selectedNodeIds,
    draggingNodeId: state.draggingNodeId, geometryRevision: state.geometryRevision,
    setViewport: state.setViewport, selectNode: state.selectNode, selectEdge: state.selectEdge,
    deleteNode: state.deleteNode, deleteEdge: state.deleteEdge, undo: state.undo, redo: state.redo,
    pasteNodes: state.pasteNodes, selectAll: state.selectAll, moveSpace: state.moveSpace,
    importCanvas: state.importCanvas, loadShared: state.loadShared, autoAlign: state.autoAlign,
  })));
  const [draft, setDraft] = useState<Draft>(null);
  const [connection, setConnection] = useState<Endpoint | null>(null);
  const [space, setSpace] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [routeVersion, setRouteVersion] = useState(0);
  const [routing, setRouting] = useState(false);
  const graphIndex = useMemo(() => createGraphIndex(s.nodes), [s.nodes]);
  const geometryIndex = useMemo(() => {
    const next = createGeometryIndex(s.nodes, geometryCache.current);
    geometryCache.current = next;
    return next;
  }, [s.nodes]);
  const resolvedEdges = useMemo(() => resolveEdges(s.edges, graphIndex).flatMap(resolved => {
    const source = geometryIndex.byNodeId.get(resolved.sourceNode.id)?.ports.get(resolved.sourcePort.id);
    const target = geometryIndex.byNodeId.get(resolved.targetNode.id)?.ports.get(resolved.targetPort.id);
    return source && target ? [{ ...resolved, source: source.position, target: target.position, sourceDirection: source.direction, targetDirection: target.direction }] : [];
  }), [s.edges, graphIndex, geometryIndex]);
  const routeInputs = useMemo<EdgeRouteInput[]>(() => resolvedEdges.map(resolved => ({
    id: resolved.edge.id, source: resolved.source, target: resolved.target,
    sourceNodeId: resolved.sourceNode.id, targetNodeId: resolved.targetNode.id,
    sourceSide: resolved.sourceDirection, targetSide: resolved.targetDirection, waypoints: resolved.edge.waypoints,
  })), [resolvedEdges]);

  const clearDraft = useCallback(() => {
    if (draftFrame.current) cancelAnimationFrame(draftFrame.current);
    draftFrame.current = 0; draftPending.current = null; draftRef.current = null; setDraft(null);
  }, []);

  useEffect(() => {
    const client = new RoutingWorkerClient({
      createWorker: () => new Worker(new URL('./routing.worker.ts', import.meta.url), { type: 'module' }),
      onRoutes: (response, job) => {
        routeCache.current = new Map(response.routes.map(route => [route.id, route]));
        routeInputCache.current = new Map(job.edges.map(input => [input.id, input]));
        setRouteVersion(version => version + 1);
      },
      onError: message => console.error(`Cable routing failed: ${message}`),
      onStateChange: setRouting,
      onTelemetry: telemetry => {
        if (typeof performance !== 'undefined') {
          performance.clearMeasures('iko-connect:cable-routing');
          performance.measure('iko-connect:cable-routing', {
            start: Math.max(0, performance.now() - telemetry.roundTripMs),
            duration: telemetry.roundTripMs,
            detail: telemetry,
          });
        }
        if (import.meta.env.DEV) console.debug('Cable routing telemetry', telemetry);
      },
    });
    routingClient.current = client;
    return () => { client.dispose(); routingClient.current = null; };
  }, []);

  useEffect(() => {
    const store = useCanvasStore.getState();
    store.loadFromStorage();
    let previous = useCanvasStore.getState(), saveTimer = 0;
    const save = () => { saveTimer = 0; if (!readOnlyRef.current) useCanvasStore.getState().saveToStorage(); };
    const schedule = () => { if (saveTimer) window.clearTimeout(saveTimer); saveTimer = window.setTimeout(save, 250); };
    const unsubscribe = useCanvasStore.subscribe(next => {
      const documentChanged = next.nodes !== previous.nodes || next.edges !== previous.edges || next.spaces !== previous.spaces || next.vlans !== previous.vlans;
      const interactionCommitted = (!!previous.transaction && !next.transaction) || (!!previous.draggingNodeId && !next.draggingNodeId);
      if (next.viewport !== previous.viewport || interactionCommitted || documentChanged && !next.transaction && !next.draggingNodeId) schedule();
      previous = next;
    });
    const pageHide = () => { if (saveTimer) window.clearTimeout(saveTimer); save(); };
    schedule();
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pointerup', clearDraft);
    return () => {
      unsubscribe();
      if (saveTimer) window.clearTimeout(saveTimer);
      if (wheelFrame.current) cancelAnimationFrame(wheelFrame.current);
      if (draftFrame.current) cancelAnimationFrame(draftFrame.current);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pointerup', clearDraft);
    };
  }, [clearDraft]);

  const panStart = (e: React.PointerEvent<SVGSVGElement>) => {
    const insideGroup = !!(e.target as Element).closest('g');
    if (!shouldStartCanvasPan(e.button, space, insideGroup)) {
      if (e.button === 0 && !insideGroup) { setConnection(null); useCanvasStore.getState().selectNode(null); }
      return;
    }
    e.preventDefault();
    setConnection(null);
    const store = useCanvasStore.getState();
    store.selectNode(null);
    const start = { x: e.clientX, y: e.clientY, viewport: store.viewport };
    const svg = e.currentTarget, buttonMask = e.button === 1 ? 4 : 1;
    let frame = 0, pending: { x: number; y: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!pending || Math.hypot(pending.x - start.x, pending.y - start.y) < 3) return;
      store.setViewport({ ...start.viewport, x: start.viewport.x + pending.x - start.x, y: start.viewport.y + pending.y - start.y });
    };
    const stop = (ev: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      apply();
      svg.releasePointerCapture(ev.pointerId); svg.onpointermove = null; svg.onpointerup = null; svg.onpointercancel = null;
    };
    svg.setPointerCapture(e.pointerId);
    svg.onpointermove = ev => {
      if ((ev.buttons & buttonMask) === 0) return stop(ev);
      pending = { x: ev.clientX, y: ev.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    svg.onpointerup = stop; svg.onpointercancel = stop;
  };
  const wheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const viewport = wheelPending.current ?? useCanvasStore.getState().viewport;
    if (!e.ctrlKey && !e.metaKey) {
      wheelPending.current = { ...viewport, x: viewport.x - (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX), y: viewport.y - (e.shiftKey ? 0 : e.deltaY) };
    } else {
      const r = e.currentTarget.getBoundingClientRect();
      const world = { x: (e.clientX - r.left - viewport.x) / viewport.zoom, y: (e.clientY - r.top - viewport.y) / viewport.zoom };
      const zoom = Math.min(3, Math.max(0.2, viewport.zoom * Math.exp(-e.deltaY * 0.001)));
      wheelPending.current = { x: e.clientX - r.left - world.x * zoom, y: e.clientY - r.top - world.y * zoom, zoom };
    }
    if (!wheelFrame.current) wheelFrame.current = requestAnimationFrame(() => {
      wheelFrame.current = 0;
      if (wheelPending.current) useCanvasStore.getState().setViewport(wheelPending.current);
      wheelPending.current = null;
    });
  };
  const fit = useCallback(() => {
    const { nodes, setViewport } = useCanvasStore.getState();
    if (!svgRef.current || !nodes.length) return;
    const r = svgRef.current.getBoundingClientRect(), pad = 64;
    const panelWidth = document.querySelector('.side-stack')?.getBoundingClientRect().width ?? 0;
    const width = Math.max(200, r.width - panelWidth - (panelWidth ? 32 : 0));
    const minX = Math.min(...nodes.map(n => n.position.x)), minY = Math.min(...nodes.map(n => n.position.y));
    const maxX = Math.max(...nodes.map(n => n.position.x + nodeWidth(n))), maxY = Math.max(...nodes.map(n => n.position.y + nodeHeight(n)));
    const zoom = Math.min(3, Math.max(.2, Math.min((width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))));
    setViewport({ x: (width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (r.height - (maxY - minY) * zoom) / 2 - minY * zoom, zoom });
  }, []);
  const dragSpace = (name: string, e: React.PointerEvent<SVGGElement>) => {
    // Only primary-button gestures move a space. Middle-button gestures bubble
    // to the SVG canvas so panning works exactly as it does over blank areas.
    if (e.button !== 0) return;
    e.stopPropagation();
    const state = useCanvasStore.getState();
    state.beginTransaction();
    const start = { x: e.clientX, y: e.clientY }, zoom = state.viewport.zoom;
    const g = e.currentTarget;
    let frame = 0, pending: { x: number; y: number } | null = null, applied = { x: 0, y: 0 };
    const apply = () => {
      frame = 0;
      if (!pending) return;
      const total = snapXY({ x: (pending.x - start.x) / zoom, y: (pending.y - start.y) / zoom });
      const delta = { x: total.x - applied.x, y: total.y - applied.y };
      if (delta.x || delta.y) { useCanvasStore.getState().moveSpace(name, delta.x, delta.y); applied = total; }
    };
    const stop = (ev: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      apply();
      useCanvasStore.getState().commitTransaction();
      g.releasePointerCapture(ev.pointerId); g.onpointermove = null; g.onpointerup = null; g.onpointercancel = null;
    };
    g.setPointerCapture(e.pointerId);
    g.onpointermove = ev => {
      if ((ev.buttons & 1) === 0) return stop(ev);
      pending = { x: ev.clientX, y: ev.clientY };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    g.onpointerup = stop; g.onpointercancel = stop;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const state = useCanvasStore.getState();
      if (readOnlyRef.current) {
        if (e.key === 'Escape') { clearDraft(); setConnection(null); state.selectEdge(null); }
        if ((e.ctrlKey || e.metaKey) && e.key === '0') state.setViewport({ ...state.viewport, zoom: 1 });
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') fit();
        return;
      }
      if (e.code === 'Space') setSpace(true);
      if (e.key === 'Escape') { clearDraft(); setConnection(null); state.selectNode(null); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (state.selectedNodeId) state.deleteNode(state.selectedNodeId); if (state.selectedEdgeId) state.deleteEdge(state.selectedEdgeId); }
      const historyAction = historyShortcut(e.key, e.ctrlKey, e.metaKey, e.shiftKey);
      if (historyAction) { e.preventDefault(); historyAction === 'redo' ? state.redo() : state.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const ids = state.selectedNodeIds.length ? state.selectedNodeIds : state.selectedNodeId ? [state.selectedNodeId] : [];
        if (ids.length) {
          const selected = new Set(ids);
          clipboard.current = { nodes: state.nodes.filter(node => selected.has(node.id)), edges: state.edges.filter(edge => selected.has(edge.sourceNodeId) && selected.has(edge.targetNodeId)) };
          pasteCount.current = 0; e.preventDefault();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboard.current) {
        pasteCount.current++;
        state.pasteNodes(clipboard.current.nodes, clipboard.current.edges, { x: GRID * 2 * pasteCount.current, y: GRID * 2 * pasteCount.current });
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); state.selectAll(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') state.setViewport({ ...state.viewport, zoom: 1 });
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') fit();
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [clearDraft, fit]);

  useEffect(() => {
    const client = routingClient.current;
    if (!client) return;
    if (s.draggingNodeId) { client.cancel(); return; }
    if (!routeInputs.length) {
      client.cancel();
      routeCache.current.clear(); routeInputCache.current.clear(); setRouteVersion(version => version + 1);
      return;
    }
    client.schedule({
      edges: routeInputs,
      nodes: s.nodes,
      options: { portMargin: PORT_MARGIN, laneSpacing: CABLE_LANE_SPACING, obstacleClearance: HALF_GRID },
    });
    // routeInputs/nodes are intentionally invalidated by geometryRevision.
  }, [s.geometryRevision, s.draggingNodeId]);

  const edgePaths = useMemo(() => {
    const draggedNode = s.draggingNodeId ? graphIndex.nodeById.get(s.draggingNodeId) : undefined;
    return new Map(routeInputs.map(input => {
      const cached = sameRouteInput(routeInputCache.current.get(input.id), input) ? routeCache.current.get(input.id) : undefined;
      const attached = draggedNode && (input.sourceNodeId === draggedNode.id || input.targetNodeId === draggedNode.id);
      if (cached && !attached) return [input.id, cached.path];
      const points = routeOrthogonalConnection(input.source, input.target, {
        sourceSide: input.sourceSide, targetSide: input.targetSide,
        portMargin: PORT_MARGIN, waypoints: input.waypoints,
      });
      return [input.id, pointsToSvgPath(points)];
    }));
  }, [routeInputs, routeVersion, s.draggingNodeId, graphIndex]);
  const portDown = useCallback((node: Node, port: Port, e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    const next = { node, port, to: portPosition(node, port.id) };
    draftRef.current = next; setDraft(next);
  }, []);
  const portUp = useCallback((node: Node, port: Port, e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    const current = draftRef.current;
    if (current) useCanvasStore.getState().addEdge(current.node.id, current.port.id, node.id, port.id);
    clearDraft();
  }, [clearDraft]);
  const moveDraft = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!draftRef.current || !svgRef.current) return;
    draftPending.current = snapXY(toWorld({ x: e.clientX, y: e.clientY }, svgRef.current, useCanvasStore.getState().viewport));
    if (!draftFrame.current) draftFrame.current = requestAnimationFrame(() => {
      draftFrame.current = 0;
      const point = draftPending.current;
      if (!point) return;
      setDraft(current => {
        const next = current ? { ...current, to: point } : null;
        draftRef.current = next;
        return next;
      });
      draftPending.current = null;
    });
  }, []);
  const portClick = useCallback((node: Node, port: Port) => {
    if (!connection) return setConnection({ node, port });
    if (connection.node.id === node.id && connection.port.id === port.id) return setConnection(null);
    const clicked = { node, port };
    const forward = ['output', 'bidirectional'].includes(connection.port.side) && ['input', 'bidirectional'].includes(port.side);
    const source = forward ? connection : clicked, target = forward ? clicked : connection;
    if (['output', 'bidirectional'].includes(source.port.side) && ['input', 'bidirectional'].includes(target.port.side)) {
      useCanvasStore.getState().addEdge(source.node.id, source.port.id, target.node.id, target.port.id);
      setConnection(null);
    } else setConnection({ node, port });
  }, [connection]);

  const openDocument = (document: CanvasDocument, merge = false) => {
    if (merge && !document.readOnly) return useCanvasStore.getState().importCanvas(document.canvas);
    readOnlyRef.current = document.readOnly;
    setReadOnly(document.readOnly);
    useCanvasStore.getState().loadShared(document.canvas);
  };
  const selectedResolvedEdge = resolvedEdges.find(item => item.edge.id === s.selectedEdgeId);
  const selectedNodes = useMemo(() => new Set(s.selectedNodeIds), [s.selectedNodeIds]);
  const selectedVlan = s.vlans.find(vlan => vlan.id === s.selectedVlanId);
  const highlightedNodes = useMemo(() => new Set(selectedVlan ? (graphIndex.nodesByVlanId.get(selectedVlan.id) ?? []).map(node => node.id) : []), [selectedVlan, graphIndex]);
  const spaceBoxes = useMemo(() => s.spaces.map(space => {
    const ns = graphIndex.nodesBySpace.get(space.name) ?? [];
    if (!ns.length) return null;
    const pad = 32, minX = Math.min(...ns.map(node => node.position.x)) - pad, minY = Math.min(...ns.map(node => node.position.y)) - pad;
    const maxX = Math.max(...ns.map(node => node.position.x + geometryIndex.byNodeId.get(node.id)!.width)) + pad;
    const maxY = Math.max(...ns.map(node => node.position.y + geometryIndex.byNodeId.get(node.id)!.height)) + pad;
    return { ...space, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }).filter(Boolean) as { name: string; color: string; x: number; y: number; w: number; h: number }[], [s.spaces, graphIndex, geometryIndex]);

  return <div className="app">
    <svg ref={svgRef} className="canvas" onPointerDown={panStart} onPointerMove={moveDraft} onPointerUp={clearDraft} onWheel={wheel}>
      <defs>
        <filter id="nodeShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" /></filter>
      </defs>
      <rect width="100%" height="100%" fill="#f8fafc" />
      <g transform={`translate(${s.viewport.x} ${s.viewport.y}) scale(${s.viewport.zoom})`}>
        {spaceBoxes.map(b => <g className="space-box" key={b.name} onPointerDown={readOnly ? undefined : e => dragSpace(b.name, e)}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} stroke={b.color} /><text x={b.x + 10} y={b.y + 20}>{b.name}</text></g>)}
        <g className="cable-layer">{resolvedEdges.map(item => <CanvasEdge key={item.edge.id} edge={item.edge} sourcePort={item.sourcePort} source={item.source} target={item.target} selected={s.selectedEdgeId === item.edge.id} dimmed={!!s.selectedEdgeId && s.selectedEdgeId !== item.edge.id} path={edgePaths.get(item.edge.id)} />)}</g>
        <g className="device-layer">{s.nodes.map(n => <CanvasNode key={n.id} node={n} geometry={geometryIndex.byNodeId.get(n.id)!} selected={s.selectedNodeId === n.id || selectedNodes.has(n.id)} highlightColor={highlightedNodes.has(n.id) ? selectedVlan?.color : undefined} readOnly={readOnly} connection={connection ? { nodeId: connection.node.id, port: connection.port } : undefined} onPortDown={portDown} onPortUp={portUp} onPortClick={portClick} />)}</g>
        {!readOnly && draft && <path d={straightPath(portPosition(draft.node, draft.port.id), draft.to, s.nodes, 0, portDirection(draft.node, draft.port))} fill="none" stroke="#0f172a" strokeWidth={2} strokeDasharray="6 4" />}
      </g>
    </svg>
    <div className="zoom-controls"><button onClick={() => s.setViewport({ ...s.viewport, zoom: Math.min(3, s.viewport.zoom * 1.2) })}>+</button><button onClick={() => s.setViewport({ ...s.viewport, zoom: Math.max(.2, s.viewport.zoom / 1.2) })}>−</button><button onClick={fit}>Fit</button><button onClick={() => s.setViewport({ x: 0, y: 0, zoom: 1 })}>100%</button></div>
    {!readOnly && <FloatingToolbar svgRef={svgRef} onOpenCanvas={openDocument} onAutoAlign={() => { s.autoAlign(); requestAnimationFrame(fit); }} />}
    {selectedResolvedEdge && <aside className="connection-info" aria-label="Selected cable connection"><header><div><b>Connection</b><span>{SIGNAL_TYPES[selectedResolvedEdge.sourcePort.signalType].label}</span></div>{!readOnly && <button aria-label="Close connection details" title="Close" onClick={() => s.selectEdge(null)}>×</button>}</header><div className="connection-route"><section><small>From</small><strong>{selectedResolvedEdge.sourceNode.label}</strong><span>{selectedResolvedEdge.sourcePort.label}</span></section><span className="connection-arrow" aria-hidden="true">→</span><section><small>To</small><strong>{selectedResolvedEdge.targetNode.label}</strong><span>{selectedResolvedEdge.targetPort.label}</span></section></div></aside>}
    {routing && !s.draggingNodeId && <div className="routing-badge">Routing cables…</div>}
    {readOnly && <div className="read-only-badge">Read-only view</div>}
  </div>;
}
