import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { CATEGORY_COLORS, NODE_TYPES, templateSignal } from '../nodes/NodeTypes';
import type { Edge, Node, Port, SignalType, Viewport, XY } from '../types/graph';
import { GRID, NODE_WIDTH, nodeHeight, snapXY } from '../components/canvas/geometry';

type Space = { name: string; color: string };
type Snapshot = Pick<CanvasState, 'nodes' | 'edges' | 'spaces'>;

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  spaces: Space[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeIds: string[];
  portLayer: number;
  past: Snapshot[];
  future: Snapshot[];
  addNode: (type: string, position: XY) => void;
  addCustomNode: (label: string, inputs: (string | Pick<Port, 'label' | 'signalType'>)[], outputs: (string | Pick<Port, 'label' | 'signalType'>)[], position: XY, category?: string) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  addEdge: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => void;
  deleteEdge: (id: string) => void;
  setViewport: (viewport: Viewport) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectAll: () => void;
  setPortLayer: (layer: number) => void;
  addSpace: (name: string) => void;
  updateSpace: (name: string, updates: Partial<Space>) => void;
  moveSpace: (name: string, dx: number, dy: number) => void;
  deleteSpace: (name: string) => void;
  autoAlign: () => void;
  undo: () => void;
  redo: () => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'audiopatch-graph';
const snap = (s: CanvasState): Snapshot => ({ nodes: s.nodes, edges: s.edges, spaces: s.spaces });
const withHistory = (s: CanvasState) => ({ past: [...s.past.slice(-49), snap(s)], future: [] });
const expandLabels = (labels: string[]) => labels.flatMap(label => {
  const m = label.match(/^(.*?)(\d+)-(\d+)(.*)$/);
  if (!m) return [label];
  const [, before, a, b, after] = m;
  const start = Number(a), end = Number(b);
  return Array.from({ length: end - start + 1 }, (_, i) => `${before}${start + i}${after}`);
});
const port = (label: string, side: 'input' | 'output'): Port => ({ id: nanoid(8), label: label.trim(), side, signalType: templateSignal(label) });
const customPort = (x: string | Pick<Port, 'label' | 'signalType'>, side: 'input' | 'output'): Port => typeof x === 'string' ? port(x, side) : { id: nanoid(8), label: x.label.trim(), side, signalType: x.signalType };
export const NODE_GAP = GRID * 2;
const overlaps = (a: Node, b: Node, gap = NODE_GAP) => a.position.x < b.position.x + NODE_WIDTH + gap && a.position.x + NODE_WIDTH + gap > b.position.x && a.position.y < b.position.y + nodeHeight(b) + gap && a.position.y + nodeHeight(a) + gap > b.position.y;
const firstFree = (node: Node, nodes: Node[]) => {
  for (let i = 0, n = node; i < 200; i++, n = { ...node, position: snapXY({ x: node.position.x + i * NODE_GAP, y: node.position.y + i * NODE_GAP }) }) if (!nodes.some(x => overlaps(n, x))) return n;
  return node;
};
const aligned = (nodes: Node[], edges: Edge[]) => Object.values(nodes.reduce<Record<string, Node[]>>((a, n) => ((a[n.space || 'No space'] ??= []).push(n), a), {})).flatMap(group => {
  const ids = new Set(group.map(n => n.id));
  const groupEdges = edges.filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
  const rank: Record<string, number> = {};
  const stack = new Set<string>();
  const rankOf = (id: string): number => {
    if (rank[id] != null) return rank[id];
    if (stack.has(id)) return 0;
    stack.add(id);
    rank[id] = Math.max(0, ...groupEdges.filter(e => e.targetNodeId === id).map(e => rankOf(e.sourceNodeId) + 1));
    stack.delete(id);
    return rank[id];
  };
  group.forEach(n => rankOf(n.id));

  const x0 = Math.min(...group.map(n => n.position.x)), y0 = Math.min(...group.map(n => n.position.y));
  const cols = Object.entries(group.reduce<Record<number, Node[]>>((a, n) => ((a[rank[n.id]] ??= []).push(n), a), {})).sort(([a], [b]) => Number(a) - Number(b)).map(([r, ns]) => ({ r: Number(r), ns: ns.sort((a, b) => a.position.y - b.position.y) }));
  const order = new Map(group.map(n => [n.id, n.position.y]));
  const neighbors = (n: Node) => groupEdges.flatMap(e => [e.sourceNodeId === n.id ? e.targetNodeId : undefined, e.targetNodeId === n.id ? e.sourceNodeId : undefined]).filter(Boolean) as string[];

  for (let pass = 0; pass < 4; pass++) for (const col of pass % 2 ? [...cols].reverse() : cols) {
    col.ns.sort((a, b) => {
      const score = (n: Node) => {
        const ns = neighbors(n);
        return ns.length ? ns.reduce((s, id) => s + (order.get(id) ?? n.position.y), 0) / ns.length : n.position.y;
      };
      return score(a) - score(b);
    });
    col.ns.forEach((n, i) => order.set(n.id, i));
  }

  const placed = new Map<string, Node>();
  return cols.flatMap(col => col.ns.reduce<{ y: number; nodes: Node[] }>((a, n) => {
    const near = neighbors(n).map(id => placed.get(id)).filter(Boolean) as Node[];
    const wanted = near.length ? Math.min(...near.map(x => x.position.y)) : a.y;
    const moved = { ...n, position: snapXY({ x: x0 + col.r * (NODE_WIDTH + NODE_GAP), y: Math.max(a.y, wanted) }) };
    placed.set(n.id, moved);
    return { y: moved.position.y + nodeHeight(moved) + NODE_GAP, nodes: [...a.nodes, moved] };
  }, { y: y0, nodes: [] }).nodes);
});

const makeNode = (typeId: string, position: XY): Node => {
  const t = NODE_TYPES.find(n => n.id === typeId) ?? NODE_TYPES.find(n => n.id === 'generic-mixer')!;
  return {
    id: nanoid(8),
    label: t.label,
    category: t.category,
    headerColor: CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.Custom,
    position: snapXY(position),
    ports: [...expandLabels(t.defaultInputs).map(x => port(x, 'input')), ...expandLabels(t.defaultOutputs).map(x => port(x, 'output'))],
    notes: '',
  };
};

const exampleGraph = (): Snapshot => {
  const tf1 = makeNode('yamaha-tf1', { x: 80, y: 120 });
  const atem = makeNode('atem-4k8', { x: 430, y: 80 });
  const oria = makeNode('audient-oria', { x: 430, y: 300 });
  const edge = (a: Node, outLabel: string, b: Node, inLabel: string): Edge => ({
    id: nanoid(8),
    sourceNodeId: a.id,
    sourcePortId: a.ports.find(p => p.side === 'output' && p.label === outLabel)!.id,
    targetNodeId: b.id,
    targetPortId: b.ports.find(p => p.side === 'input' && p.label === inLabel)!.id,
  });
  return { nodes: [tf1, atem, oria], edges: [edge(tf1, 'DANTE OUT 1', oria, 'DANTE IN 1'), edge(oria, 'LINE OUT 1', tf1, 'CH 1 XLR'), edge(atem, 'SDI PGM', tf1, 'ST IN 1')] };
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  ...exampleGraph(),
  viewport: { x: 0, y: 0, zoom: 1 },
  spaces: [{ name: 'TV set', color: '#c7d2fe' }, { name: 'Control room', color: '#bbf7d0' }],
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNodeIds: [],
  portLayer: 0,
  past: [],
  future: [],
  addNode: (type, position) => set(s => ({ ...withHistory(s), nodes: [...s.nodes, firstFree(makeNode(type, position), s.nodes)] })),
  addCustomNode: (label, inputs, outputs, position, category = 'Custom') => set(s => {
    const node = { id: nanoid(8), label: label || 'Custom Device', category, headerColor: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Custom, position: snapXY(position), ports: [...inputs.filter(Boolean).flatMap(x => typeof x === 'string' ? expandLabels([x]).map(y => port(y, 'input')) : [customPort(x, 'input')]), ...outputs.filter(Boolean).flatMap(x => typeof x === 'string' ? expandLabels([x]).map(y => port(y, 'output')) : [customPort(x, 'output')])], notes: '' };
    return { ...withHistory(s), nodes: [...s.nodes, firstFree(node, s.nodes)] };
  }),
  updateNode: (id, updates) => set(s => {
    const nodes = s.nodes.map(n => n.id === id ? { ...n, ...updates, position: updates.position ? snapXY(updates.position) : n.position } : n);
    if (!updates.ports) return { ...withHistory(s), nodes };
    const portIds = new Set(nodes.find(n => n.id === id)?.ports.map(p => p.id));
    return { ...withHistory(s), nodes, edges: s.edges.filter(e => (e.sourceNodeId !== id || portIds.has(e.sourcePortId)) && (e.targetNodeId !== id || portIds.has(e.targetPortId))) };
  }),
  deleteNode: id => set(s => ({ ...withHistory(s), nodes: s.nodes.filter(n => n.id !== id), edges: s.edges.filter(e => e.sourceNodeId !== id && e.targetNodeId !== id), selectedNodeId: null, selectedNodeIds: [] })),
  addEdge: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => set(s => {
    const source = s.nodes.find(n => n.id === sourceNodeId)?.ports.find(p => p.id === sourcePortId);
    const target = s.nodes.find(n => n.id === targetNodeId)?.ports.find(p => p.id === targetPortId);
    if (!source || !target || source.side !== 'output' || target.side !== 'input') return s;
    const existing = s.edges.find(e => e.sourceNodeId === sourceNodeId && e.sourcePortId === sourcePortId && e.targetNodeId === targetNodeId && e.targetPortId === targetPortId);
    if (existing) return s;
    return { ...withHistory(s), edges: [...s.edges.filter(e => e.targetNodeId !== targetNodeId || e.targetPortId !== targetPortId), { id: nanoid(8), sourceNodeId, sourcePortId, targetNodeId, targetPortId }] };
  }),
  deleteEdge: id => set(s => ({ ...withHistory(s), edges: s.edges.filter(e => e.id !== id), selectedEdgeId: null })),
  setViewport: viewport => set({ viewport }),
  selectNode: id => set({ selectedNodeId: id, selectedEdgeId: null, selectedNodeIds: id ? [id] : [] }),
  selectEdge: id => set({ selectedEdgeId: id, selectedNodeId: null, selectedNodeIds: [] }),
  selectAll: () => set(s => ({ selectedNodeIds: s.nodes.map(n => n.id), selectedNodeId: null, selectedEdgeId: null })),
  setPortLayer: portLayer => set({ portLayer }),
  addSpace: name => set(s => name.trim() && !s.spaces.some(x => x.name === name.trim()) ? { ...withHistory(s), spaces: [...s.spaces, { name: name.trim(), color: '#c7d2fe' }] } : s),
  updateSpace: (name, updates) => set(s => ({ ...withHistory(s), spaces: s.spaces.map(x => x.name === name ? { ...x, ...updates } : x), nodes: updates.name ? s.nodes.map(n => n.space === name ? { ...n, space: updates.name } : n) : s.nodes })),
  moveSpace: (name, dx, dy) => set(s => ({ nodes: s.nodes.map(n => n.space === name ? { ...n, position: snapXY({ x: n.position.x + dx, y: n.position.y + dy }) } : n) })),
  deleteSpace: name => set(s => ({ ...withHistory(s), spaces: s.spaces.filter(x => x.name !== name), nodes: s.nodes.map(n => n.space === name ? { ...n, space: '' } : n) })),
  autoAlign: () => set(s => ({ ...withHistory(s), nodes: aligned(s.nodes, s.edges).map(n => ({ ...n, position: snapXY(n.position) })), selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] })), 
  undo: () => set(s => {
    const prev = s.past.at(-1);
    return prev ? { ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future], selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] } : s;
  }),
  redo: () => set(s => {
    const next = s.future[0];
    return next ? { ...next, past: [...s.past, snap(s)].slice(-50), future: s.future.slice(1), selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] } : s;
  }),
  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Pick<CanvasState, 'nodes' | 'edges' | 'viewport'>> & { spaces?: (string | Space)[] };
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return;
      const spaces = (Array.isArray(data.spaces) ? data.spaces : ['TV set', 'Control room']).filter((x): x is string | Space => typeof x === 'string' || !!x?.name).map((x, i) => typeof x === 'string' ? { name: x, color: i ? '#bbf7d0' : '#c7d2fe' } : x);
      const viewport = data.viewport && Number.isFinite(data.viewport.x) && Number.isFinite(data.viewport.y) && Number.isFinite(data.viewport.zoom) ? data.viewport : get().viewport;
      set({ nodes: data.nodes.map(n => ({ ...n, position: snapXY(n.position), ports: Array.isArray(n.ports) ? n.ports.flatMap(p => expandLabels([p.label]).map((label, i) => ({ ...p, id: i ? nanoid(8) : p.id, label, signalType: p.signalType ?? templateSignal(label) }))) : [] })), edges: data.edges, viewport, spaces, past: [], future: [] });
    } catch { /* Ignore corrupt or unavailable browser storage. */ }
  },
  saveToStorage: () => {
    try {
      const { nodes, edges, viewport, spaces } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, viewport, spaces }));
    } catch { /* Keep editing usable when browser storage is unavailable. */ }
  },
}));

export const addPort = (node: Node, side: 'input' | 'output'): Node => ({ ...node, ports: [...node.ports, { id: nanoid(8), label: side === 'input' ? 'NEW IN' : 'NEW OUT', side, signalType: 'analog_audio' as SignalType }] });
