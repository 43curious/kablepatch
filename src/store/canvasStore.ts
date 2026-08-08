import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { CATEGORY_COLORS, NODE_TYPES, templateSignal } from '../nodes/NodeTypes';
import { hasEthernetPort } from '../types/graph';
import type { Edge, Node, Port, SignalType, Viewport, Vlan, XY } from '../types/graph';
import { cableCorridorGap, GRID, nodeHeight, nodeWidth, shortestNodeY, snapXY } from '../components/canvas/geometry';
import { canvasDataFromState, normalizeCanvasData, uniqueSpaceName } from './canvasDocument';

type Space = { name: string; color: string };
type Snapshot = Pick<CanvasState, 'nodes' | 'edges' | 'spaces' | 'vlans'>;

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  spaces: Space[];
  vlans: Vlan[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedVlanId: string | null;
  selectedNodeIds: string[];
  draggingNodeId: string | null;
  portLayer: number;
  /** Monotonic invalidation key for routing-relevant document changes. */
  geometryRevision: number;
  /** Original document captured for an in-progress UI transaction. */
  transaction: Snapshot | null;
  past: Snapshot[];
  future: Snapshot[];
  addNode: (type: string, position: XY) => void;
  addCustomNode: (label: string, inputs: (string | Pick<Port, 'label' | 'signalType' | 'position'>)[], outputs: (string | Pick<Port, 'label' | 'signalType' | 'position'>)[], position: XY, category?: string, catalogId?: string, bidirectional?: (string | Pick<Port, 'label' | 'signalType' | 'position'>)[]) => void;
  pasteNodes: (nodes: Node[], edges: Edge[], offset: XY) => void;
  importCanvas: (data: Snapshot & { viewport: Viewport }) => void;
  updateCatalogCategory: (catalogId: string, category: string, label?: string) => void;
  reassignCategory: (from: string, to: string) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  addEdge: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => void;
  setEdgeWaypoints: (id: string, waypoints: XY[]) => void;
  resetEdgeRoute: (id: string) => void;
  deleteEdge: (id: string) => void;
  setViewport: (viewport: Viewport) => void;
  selectNode: (id: string | null, additive?: boolean) => void;
  selectEdge: (id: string | null) => void;
  selectVlan: (id: string | null) => void;
  selectAll: () => void;
  setDraggingNode: (id: string | null) => void;
  moveNodeTransient: (id: string, position: XY) => void;
  finishNodeDrag: (id: string, pending?: XY) => void;
  setPortLayer: (layer: number) => void;
  beginTransaction: () => void;
  commitTransaction: () => void;
  addSpace: (name: string) => void;
  updateSpace: (name: string, updates: Partial<Space>) => void;
  moveSpace: (name: string, dx: number, dy: number) => void;
  deleteSpace: (name: string) => void;
  addVlan: (tag: number, name: string, color?: string) => void;
  updateVlan: (id: string, updates: Partial<Pick<Vlan, 'tag' | 'name' | 'color'>>) => void;
  deleteVlan: (id: string) => void;
  setNodeVlanAssignment: (nodeId: string, vlanId: string, assigned: boolean) => void;
  autoAlign: () => void;
  undo: () => void;
  redo: () => void;
  loadFromStorage: () => void;
  loadShared: (data: Snapshot & { viewport: Viewport }) => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'audiopatch-graph';
const snap = (s: CanvasState): Snapshot => ({ nodes: s.nodes, edges: s.edges, spaces: s.spaces, vlans: s.vlans });
const withHistory = (s: CanvasState) => s.transaction ? {} : ({ past: [...s.past.slice(-49), snap(s)], future: [] });
const snapshotChanged = (a: Snapshot, b: Snapshot) => JSON.stringify(a) !== JSON.stringify(b);
const samePosition = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const geometryChanged = (a: Pick<Snapshot, 'nodes' | 'edges'>, b: Pick<Snapshot, 'nodes' | 'edges'>) => {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return true;
  const nodes = new Map(b.nodes.map(node => [node.id, node]));
  for (const node of a.nodes) {
    const other = nodes.get(node.id);
    if (!other || !samePosition(node.position, other.position) || node.layout !== other.layout || node.ports.length !== other.ports.length) return true;
    for (let i = 0; i < node.ports.length; i++) {
      const x = node.ports[i], y = other.ports[i];
      if (x.id !== y.id || x.label !== y.label || x.side !== y.side || x.position !== y.position || x.signalType !== y.signalType
        || x.groupId !== y.groupId || (x.aliases ?? []).join('\0') !== (y.aliases ?? []).join('\0')) return true;
    }
  }
  return a.edges.some((edge, i) => {
    const other = b.edges[i];
    return !other || edge.id !== other.id || edge.sourceNodeId !== other.sourceNodeId || edge.sourcePortId !== other.sourcePortId
      || edge.targetNodeId !== other.targetNodeId || edge.targetPortId !== other.targetPortId
      || JSON.stringify(edge.waypoints ?? []) !== JSON.stringify(other.waypoints ?? []);
  });
};
const expandLabels = (labels: string[]) => labels.flatMap(label => {
  const m = label.match(/^(.*?)(\d+)-(\d+)(.*)$/);
  if (!m) return [label];
  const [, before, a, b, after] = m;
  const start = Number(a), end = Number(b);
  return Array.from({ length: end - start + 1 }, (_, i) => `${before}${start + i}${after}`);
});
const port = (label: string, side: Port['side'], position?: Port['position']): Port => ({ id: nanoid(8), label: label.trim(), side, position, signalType: templateSignal(label) });
const customPort = (x: string | Pick<Port, 'label' | 'signalType' | 'position'>, side: Port['side']): Port => typeof x === 'string' ? port(x, side) : { id: nanoid(8), label: x.label.trim(), side, position: x.position, signalType: x.signalType };
const canConnect = (source: Port, target: Port) => ['output', 'bidirectional'].includes(source.side) && ['input', 'bidirectional'].includes(target.side);
export const portsAreCompatible = (a: Port, b: Port) => a.signalType === b.signalType && (canConnect(a, b) || canConnect(b, a));
export const NODE_GAP = GRID * 2;
const AUTO_ALIGN_GAP = GRID * 2;
const overlaps = (a: Node, b: Node, gap = NODE_GAP) => a.position.x < b.position.x + nodeWidth(b) + gap && a.position.x + nodeWidth(a) + gap > b.position.x && a.position.y < b.position.y + nodeHeight(b) + gap && a.position.y + nodeHeight(a) + gap > b.position.y;
const firstFree = (node: Node, nodes: Node[]) => {
  const step = NODE_GAP;
  for (let i = 0, n = node; i < 200; i++, n = { ...node, position: snapXY({ x: node.position.x + i * step, y: node.position.y + i * step }) }) if (!nodes.some(x => overlaps(n, x))) return n;
  return node;
};
const alignGroup = (group: Node[], edges: Edge[], references: Node[] = group) => {
  const ids = new Set(group.map(n => n.id));
  const groupEdges = edges.filter(e => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
  const incoming = new Map<string, Edge[]>(), incident = new Map<string, Edge[]>();
  for (const edge of groupEdges) (incoming.get(edge.targetNodeId) ?? incoming.set(edge.targetNodeId, []).get(edge.targetNodeId)!).push(edge);
  for (const edge of edges.filter(edge => ids.has(edge.sourceNodeId) || ids.has(edge.targetNodeId))) {
    (incident.get(edge.sourceNodeId) ?? incident.set(edge.sourceNodeId, []).get(edge.sourceNodeId)!).push(edge);
    (incident.get(edge.targetNodeId) ?? incident.set(edge.targetNodeId, []).get(edge.targetNodeId)!).push(edge);
  }
  const rank: Record<string, number> = {};
  const stack = new Set<string>();
  const rankOf = (id: string): number => {
    if (rank[id] != null) return rank[id];
    if (stack.has(id)) return 0;
    stack.add(id);
    rank[id] = Math.max(0, ...(incoming.get(id) ?? []).map(e => rankOf(e.sourceNodeId) + 1));
    stack.delete(id);
    return rank[id];
  };
  group.forEach(n => rankOf(n.id));

  const x0 = Math.min(...group.map(n => n.position.x));
  const cols = Object.entries(group.reduce<Record<number, Node[]>>((a, n) => ((a[rank[n.id]] ??= []).push(n), a), {})).sort(([a], [b]) => Number(a) - Number(b)).map(([r, ns]) => ({ r: Number(r), ns: ns.sort((a, b) => a.position.y - b.position.y) }));
  const channels = new Map<number, number>();
  for (const edge of groupEdges) {
    const from = rank[edge.sourceNodeId], to = rank[edge.targetNodeId];
    for (let boundary = Math.min(from, to); boundary < Math.max(from, to); boundary++) channels.set(boundary, (channels.get(boundary) ?? 0) + 1);
  }
  const columnX = new Map<number, number>();
  let x = x0;
  cols.forEach((column, i) => {
    columnX.set(column.r, x);
    const next = cols[i + 1];
    if (!next) return;
    const lanes = Math.max(0, ...Array.from({ length: next.r - column.r }, (_, offset) => channels.get(column.r + offset) ?? 0));
    x += Math.max(...column.ns.map(nodeWidth)) + cableCorridorGap(lanes);
  });
  const order = new Map(group.map(n => [n.id, n.position.y]));
  const neighbors = (n: Node) => (incident.get(n.id) ?? []).map(edge => edge.sourceNodeId === n.id ? edge.targetNodeId : edge.sourceNodeId);

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

  const placed = new Map(references.map(node => [node.id, node]));
  group.forEach(node => placed.set(node.id, { ...node, position: snapXY({ x: columnX.get(rank[node.id])!, y: node.position.y }) }));
  const connections = (node: Node) => (incident.get(node.id) ?? []).flatMap(edge => {
    const source = edge.sourceNodeId === node.id, other = placed.get(source ? edge.targetNodeId : edge.sourceNodeId);
    return other ? [{ node: other, ownPortId: source ? edge.sourcePortId : edge.targetPortId, otherPortId: source ? edge.targetPortId : edge.sourcePortId }] : [];
  });
  const gapAfter = (_node: Node, _next?: Node) => AUTO_ALIGN_GAP;
  const placeColumn = (col: typeof cols[number]) => {
    const desired = col.ns.map(node => {
      const current = placed.get(node.id)!;
      return connections(current).length ? shortestNodeY(current, connections(current)) : current.position.y;
    });
    const ys: number[] = [];
    col.ns.forEach((node, i) => ys.push(i ? Math.max(desired[i], ys[i - 1] + nodeHeight(col.ns[i - 1]) + gapAfter(col.ns[i - 1], node)) : desired[i]));
    const shifts = ys.map((y, i) => desired[i] - y).sort((a, b) => a - b);
    const middle = Math.floor(shifts.length / 2);
    const shift = shifts.length % 2 ? shifts[middle] : (shifts[middle - 1] + shifts[middle]) / 2;
    col.ns.forEach((node, i) => placed.set(node.id, { ...node, position: snapXY({ x: columnX.get(col.r)!, y: ys[i] + shift }) }));
  };
  // Repeated cable-driven sweeps align connected ports while preserving clear component gaps.
  for (let pass = 0; pass < 6; pass++) for (const col of pass % 2 ? [...cols].reverse() : cols) placeColumn(col);
  return cols.flatMap(col => col.ns.map(node => placed.get(node.id)!));
};
const packSpaces = (nodes: Node[], names: string[]): Node[] => {
  let cursor = Math.min(...nodes.map(node => node.position.x));
  return names.flatMap(name => {
    const group = nodes.filter(node => (node.space || 'No space') === name);
    if (!group.length) return [];
    const left = Math.min(...group.map(node => node.position.x)), right = Math.max(...group.map(node => node.position.x + nodeWidth(node)));
    const moved = group.map(node => ({ ...node, position: { ...node.position, x: node.position.x + cursor - left } }));
    cursor += right - left + GRID * 3;
    return moved;
  });
};

/** Places components from cable topology while keeping each space contiguous. */
export const alignNodesForCables = (nodes: Node[], edges: Edge[], spaces: Space[] = []): Node[] => {
  if (!nodes.length) return [];
  const names = [...spaces.map(space => space.name), ...nodes.map(node => node.space || 'No space').filter((name, i, all) => !spaces.some(space => space.name === name) && all.indexOf(name) === i)];
  let aligned = nodes.map(node => ({ ...node, position: snapXY(node.position) }));
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map(aligned.map(node => [node.id, node]));
    for (const name of names) {
      const current = [...next.values()];
      const group = current.filter(node => (node.space || 'No space') === name);
      if (group.length) alignGroup(group, edges, current).forEach(node => next.set(node.id, node));
    }
    aligned = packSpaces([...next.values()], names);
  }
  return aligned;
};

const makeNode = (typeId: string, position: XY): Node => {
  const t = NODE_TYPES.find(n => n.id === typeId) ?? NODE_TYPES.find(n => n.id === 'generic-mixer')!;
  const bidirectional = t.defaultBidirectional?.flatMap(label => expandLabels([label])).map(label => ({ id: nanoid(8), label, side: 'bidirectional' as const, position: t.layout === 'ethernet-switch' ? 'top' as const : 'left' as const, signalType: templateSignal(label) })) ?? [];
  return {
    id: nanoid(8),
    label: t.label,
    category: t.category,
    headerColor: CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.Custom,
    catalogId: typeId,
    layout: t.layout,
    position: snapXY(position),
    ports: [...expandLabels(t.defaultInputs).map(x => port(x, 'input')), ...expandLabels(t.defaultOutputs).map(x => port(x, 'output')), ...bidirectional],
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
  return { nodes: [tf1, atem, oria], edges: [edge(tf1, 'DANTE OUT 1', oria, 'DANTE IN 1'), edge(oria, 'LINE OUT 1', tf1, 'CH 1 XLR'), edge(atem, 'SDI PGM', tf1, 'ST IN 1')], spaces: [], vlans: [] };
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  ...exampleGraph(),
  viewport: { x: 0, y: 0, zoom: 1 },
  spaces: [{ name: 'TV set', color: '#c7d2fe' }, { name: 'Control room', color: '#bbf7d0' }],
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedVlanId: null,
  selectedNodeIds: [],
  draggingNodeId: null,
  portLayer: 0,
  geometryRevision: 0,
  transaction: null,
  past: [],
  future: [],
  addNode: (type, position) => set(s => ({ ...withHistory(s), nodes: [...s.nodes, firstFree(makeNode(type, position), s.nodes)], geometryRevision: s.geometryRevision + 1 })),
  addCustomNode: (label, inputs, outputs, position, category = 'Custom', catalogId, bidirectional = []) => set(s => {
    const layout = catalogId === 'ethernet-switch' ? 'ethernet-switch' as const : undefined;
    const switchLabels = bidirectional.filter(Boolean).flatMap(x => typeof x === 'string' ? expandLabels([x]).map(label => ({ label, signalType: 'ethernet' as const, position: 'top' as const })) : [{ label: x.label, signalType: 'ethernet' as const, position: x.position === 'bottom' ? 'bottom' as const : 'top' as const }]);
    const switchPorts = layout === 'ethernet-switch' ? switchLabels.map(({ label, signalType, position }) => ({ id: nanoid(8), label, side: 'bidirectional' as const, position, signalType })) : [];
    const node = { id: nanoid(8), label: label || 'Custom Device', category, headerColor: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Custom, catalogId, layout, position: snapXY(position), ports: [...inputs.filter(Boolean).flatMap(x => typeof x === 'string' ? expandLabels([x]).map(y => port(y, 'input')) : [customPort(x, 'input')]), ...outputs.filter(Boolean).flatMap(x => typeof x === 'string' ? expandLabels([x]).map(y => port(y, 'output')) : [customPort(x, 'output')]), ...(switchPorts.length ? switchPorts : bidirectional.filter(Boolean).flatMap(x => typeof x === 'string' ? expandLabels([x]).map(y => port(y, 'bidirectional', 'left')) : [customPort(x, 'bidirectional')]))], notes: '' };
    return { ...withHistory(s), nodes: [...s.nodes, firstFree(node, s.nodes)], geometryRevision: s.geometryRevision + 1 };
  }),
  pasteNodes: (copies, copiedEdges, offset) => set(s => {
    if (!copies.length) return s;
    const nodeIds = new Map<string, string>(), portIds = new Map<string, string>();
    let occupied = s.nodes;
    const nodes = copies.map(copy => {
      const ports = copy.ports.map(port => ({ ...port, id: nanoid(8) }));
      copy.ports.forEach((port, i) => portIds.set(port.id, ports[i].id));
      const node = firstFree({ ...copy, id: nanoid(8), position: snapXY({ x: copy.position.x + offset.x, y: copy.position.y + offset.y }), ports }, occupied);
      nodeIds.set(copy.id, node.id); occupied = [...occupied, node];
      return node;
    });
    const edges = copiedEdges.flatMap(edge => {
      const sourceNodeId = nodeIds.get(edge.sourceNodeId), targetNodeId = nodeIds.get(edge.targetNodeId), sourcePortId = portIds.get(edge.sourcePortId), targetPortId = portIds.get(edge.targetPortId);
      return sourceNodeId && targetNodeId && sourcePortId && targetPortId ? [{ ...edge, id: nanoid(8), sourceNodeId, targetNodeId, sourcePortId, targetPortId }] : [];
    });
    return { ...withHistory(s), nodes: occupied, edges: [...s.edges, ...edges], selectedNodeId: nodes[0].id, selectedNodeIds: nodes.map(node => node.id), selectedEdgeId: null, selectedVlanId: null, geometryRevision: s.geometryRevision + 1 };
  }),
  importCanvas: data => set(s => {
    if (!data.nodes.length) return s;
    const usedNames = new Set(s.spaces.map(space => space.name)), spaceNames = new Map<string, string>();
    const importedNames = [...new Set([...data.spaces.map(space => space.name), ...data.nodes.map(node => node.space).filter(Boolean) as string[]])];
    importedNames.forEach(name => spaceNames.set(name, uniqueSpaceName(name, usedNames)));
    const vlanIds = new Map<string, string>(), newVlans: Vlan[] = [];
    const existingByTag = new Map(s.vlans.map(vlan => [vlan.tag, vlan]));
    for (const vlan of data.vlans) {
      const existing = existingByTag.get(vlan.tag);
      const id = existing?.id ?? nanoid(8);
      vlanIds.set(vlan.id, id);
      if (!existing) { const imported = { ...vlan, id }; newVlans.push(imported); existingByTag.set(vlan.tag, imported); }
    }
    const nodeIds = new Map<string, string>(), portIds = new Map<string, string>();
    const minX = Math.min(...data.nodes.map(node => node.position.x)), minY = Math.min(...data.nodes.map(node => node.position.y));
    const dx = s.nodes.length ? Math.max(...s.nodes.map(node => node.position.x + nodeWidth(node))) + AUTO_ALIGN_GAP - minX : 0;
    const dy = s.nodes.length ? Math.min(...s.nodes.map(node => node.position.y)) - minY : 0;
    const nodes = data.nodes.map(copy => {
      const ports = copy.ports.map(item => ({ ...item, id: nanoid(8) }));
      copy.ports.forEach((item, i) => portIds.set(item.id, ports[i].id));
      const assignments = [...new Set((copy.vlanIds ?? []).flatMap(id => vlanIds.get(id) ?? []))];
      const node = { ...copy, id: nanoid(8), space: copy.space ? spaceNames.get(copy.space) : copy.space, vlanIds: assignments.length ? assignments : undefined, position: snapXY({ x: copy.position.x + dx, y: copy.position.y + dy }), ports };
      nodeIds.set(copy.id, node.id);
      return node;
    });
    const edges = data.edges.flatMap(edge => {
      const sourceNodeId = nodeIds.get(edge.sourceNodeId), targetNodeId = nodeIds.get(edge.targetNodeId), sourcePortId = portIds.get(edge.sourcePortId), targetPortId = portIds.get(edge.targetPortId);
      return sourceNodeId && targetNodeId && sourcePortId && targetPortId ? [{ ...edge, id: nanoid(8), sourceNodeId, targetNodeId, sourcePortId, targetPortId }] : [];
    });
    const colors = new Map(data.spaces.map(space => [space.name, space.color]));
    const spaces = importedNames.map(name => ({ name: spaceNames.get(name)!, color: colors.get(name) ?? '#c7d2fe' }));
    return { ...withHistory(s), nodes: [...s.nodes, ...nodes], edges: [...s.edges, ...edges], spaces: [...s.spaces, ...spaces], vlans: [...s.vlans, ...newVlans], selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: nodes.map(node => node.id), geometryRevision: s.geometryRevision + 1 };
  }),
  updateCatalogCategory: (catalogId, category, label) => set(s => {
    const templateLabel = NODE_TYPES.find(template => template.id === catalogId)?.label;
    let changed = false;
    const nodes = s.nodes.map(node => node.catalogId === catalogId || (!node.catalogId && (node.label === label || node.label === templateLabel)) ? (changed = true, { ...node, catalogId, category, headerColor: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Custom }) : node);
    return changed ? { ...withHistory(s), nodes } : s;
  }),
  reassignCategory: (from, to) => set(s => {
    const nodes = s.nodes.map(node => node.category === from ? { ...node, category: to, headerColor: CATEGORY_COLORS[to] ?? CATEGORY_COLORS.Custom } : node);
    return nodes.some((node, i) => node !== s.nodes[i]) ? { ...withHistory(s), nodes } : s;
  }),
  updateNode: (id, updates) => set(s => {
    const current = s.nodes.find(node => node.id === id);
    if (!current) return s;
    const candidate = { ...current, ...updates, position: updates.position ? snapXY(updates.position) : current.position };
    const knownVlans = new Set(s.vlans.map(vlan => vlan.id));
    const assignments = hasEthernetPort(candidate) ? [...new Set((candidate.vlanIds ?? []).filter(vlanId => knownVlans.has(vlanId)))] : [];
    const next = { ...candidate, vlanIds: assignments.length ? assignments : undefined };
    const nodes = s.nodes.map(node => node.id === id ? next : node);
    if (JSON.stringify(current) === JSON.stringify(next)) return s;
    const geometryUpdate = !samePosition(current.position, next.position) || current.layout !== next.layout || current.ports !== next.ports;
    if (!updates.ports) return { ...withHistory(s), nodes, geometryRevision: s.geometryRevision + Number(geometryUpdate) };
    const portIds = new Set(next.ports.map(item => item.id));
    const edges = s.edges.filter(edge => (edge.sourceNodeId !== id || portIds.has(edge.sourcePortId)) && (edge.targetNodeId !== id || portIds.has(edge.targetPortId)));
    return { ...withHistory(s), nodes, edges, geometryRevision: s.geometryRevision + Number(geometryUpdate || edges.length !== s.edges.length) };
  }),
  deleteNode: id => set(s => s.nodes.some(node => node.id === id) ? ({ ...withHistory(s), nodes: s.nodes.filter(n => n.id !== id), edges: s.edges.filter(e => e.sourceNodeId !== id && e.targetNodeId !== id), selectedNodeId: null, selectedNodeIds: [], selectedVlanId: null, geometryRevision: s.geometryRevision + 1 }) : s),
  addEdge: (firstNodeId, firstPortId, secondNodeId, secondPortId) => set(s => {
    if (firstNodeId === secondNodeId && firstPortId === secondPortId) return s;
    const first = s.nodes.find(node => node.id === firstNodeId)?.ports.find(item => item.id === firstPortId);
    const second = s.nodes.find(node => node.id === secondNodeId)?.ports.find(item => item.id === secondPortId);
    if (!first || !second || !portsAreCompatible(first, second)) return s;
    const forward = canConnect(first, second);
    const sourceNodeId = forward ? firstNodeId : secondNodeId, sourcePortId = forward ? firstPortId : secondPortId;
    const targetNodeId = forward ? secondNodeId : firstNodeId, targetPortId = forward ? secondPortId : firstPortId;
    const source = forward ? first : second, target = forward ? second : first;
    if (s.edges.some(edge => edge.sourceNodeId === sourceNodeId && edge.sourcePortId === sourcePortId && edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId)) return s;
    const usesBidirectionalPort = (edge: Edge) => (source.side === 'bidirectional' && ((edge.sourceNodeId === sourceNodeId && edge.sourcePortId === sourcePortId) || (edge.targetNodeId === sourceNodeId && edge.targetPortId === sourcePortId))) || (target.side === 'bidirectional' && ((edge.sourceNodeId === targetNodeId && edge.sourcePortId === targetPortId) || (edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId)));
    return { ...withHistory(s), edges: [...s.edges.filter(edge => (edge.targetNodeId !== targetNodeId || edge.targetPortId !== targetPortId) && !usesBidirectionalPort(edge)), { id: nanoid(8), sourceNodeId, sourcePortId, targetNodeId, targetPortId }], geometryRevision: s.geometryRevision + 1 };
  }),
  setEdgeWaypoints: (id, waypoints) => set(s => {
    const edge = s.edges.find(item => item.id === id);
    if (!edge) return s;
    const next = waypoints.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)).map(snapXY);
    if (JSON.stringify(edge.waypoints ?? []) === JSON.stringify(next)) return s;
    return { ...withHistory(s), edges: s.edges.map(item => item.id === id ? { ...item, waypoints: next } : item), geometryRevision: s.geometryRevision + 1 };
  }),
  resetEdgeRoute: id => set(s => {
    const edge = s.edges.find(item => item.id === id);
    return edge?.waypoints ? { ...withHistory(s), edges: s.edges.map(item => item.id === id ? { ...item, waypoints: undefined } : item), geometryRevision: s.geometryRevision + 1 } : s;
  }),
  deleteEdge: id => set(s => s.edges.some(edge => edge.id === id) ? ({ ...withHistory(s), edges: s.edges.filter(e => e.id !== id), selectedEdgeId: null, geometryRevision: s.geometryRevision + 1 }) : s),
  setViewport: viewport => set({ viewport }),
  selectNode: (id, additive = false) => set(s => {
    if (!id) return { selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [] };
    if (!additive) return { selectedNodeId: id, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [id] };
    const selectedNodeIds = s.selectedNodeIds.includes(id) ? s.selectedNodeIds.filter(nodeId => nodeId !== id) : [...s.selectedNodeIds, id];
    return { selectedNodeId: selectedNodeIds.length === 1 ? selectedNodeIds[0] : null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds };
  }),
  selectEdge: id => set({ selectedEdgeId: id, selectedNodeId: null, selectedVlanId: null, selectedNodeIds: [] }),
  selectVlan: id => set(s => id && !s.vlans.some(vlan => vlan.id === id) ? s : { selectedVlanId: id, selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] }),
  selectAll: () => set(s => ({ selectedNodeIds: s.nodes.map(n => n.id), selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null })),
  setDraggingNode: draggingNodeId => set({ draggingNodeId }),
  moveNodeTransient: (id, position) => set(s => {
    const snapped = snapXY(position), current = s.nodes.find(node => node.id === id);
    if (!current || samePosition(current.position, snapped)) return s;
    return { nodes: s.nodes.map(node => node.id === id ? { ...node, position: snapped } : node), geometryRevision: s.geometryRevision + 1 };
  }),
  finishNodeDrag: (id, pending) => set(s => {
    const current = s.nodes.find(node => node.id === id);
    if (!current) return { draggingNodeId: null, transaction: null };
    const desired = pending ? { ...current, position: snapXY(pending) } : current;
    const placed = firstFree(desired, s.nodes.filter(node => node.id !== id));
    const positionChanged = !samePosition(current.position, placed.position);
    const nodes = positionChanged ? s.nodes.map(node => node.id === id ? placed : node) : s.nodes;
    const document = { nodes, edges: s.edges, spaces: s.spaces, vlans: s.vlans };
    const committed = s.transaction && snapshotChanged(s.transaction, document);
    return {
      nodes, draggingNodeId: null, transaction: null,
      geometryRevision: s.geometryRevision + Number(positionChanged),
      ...(committed ? { past: [...s.past.slice(-49), s.transaction!], future: [] } : {}),
    };
  }),
  setPortLayer: portLayer => set({ portLayer }),
  beginTransaction: () => set(s => s.transaction ? s : { transaction: snap(s) }),
  commitTransaction: () => set(s => {
    if (!s.transaction) return s;
    const changed = snapshotChanged(s.transaction, snap(s));
    return changed ? { transaction: null, past: [...s.past.slice(-49), s.transaction], future: [] } : { transaction: null };
  }),
  addSpace: name => set(s => name.trim() && !s.spaces.some(x => x.name === name.trim()) ? { ...withHistory(s), spaces: [...s.spaces, { name: name.trim(), color: '#c7d2fe' }] } : s),
  updateSpace: (name, updates) => set(s => {
    const current = s.spaces.find(space => space.name === name);
    if (!current || Object.entries(updates).every(([key, value]) => current[key as keyof Space] === value)) return s;
    return { ...withHistory(s), spaces: s.spaces.map(space => space.name === name ? { ...space, ...updates } : space), nodes: updates.name ? s.nodes.map(node => node.space === name ? { ...node, space: updates.name } : node) : s.nodes };
  }),
  moveSpace: (name, dx, dy) => set(s => {
    let changed = false;
    const nodes = s.nodes.map(node => {
      if (node.space !== name) return node;
      const position = snapXY({ x: node.position.x + dx, y: node.position.y + dy });
      if (samePosition(position, node.position)) return node;
      changed = true;
      return { ...node, position };
    });
    return changed ? { nodes, geometryRevision: s.geometryRevision + 1 } : s;
  }),
  deleteSpace: name => set(s => s.spaces.some(space => space.name === name) ? ({ ...withHistory(s), spaces: s.spaces.filter(space => space.name !== name), nodes: s.nodes.map(node => node.space === name ? { ...node, space: '' } : node) }) : s),
  addVlan: (tag, name, color = '#22c55e') => set(s => {
    const cleanName = name.trim();
    return Number.isInteger(tag) && tag >= 1 && tag <= 4094 && cleanName && !s.vlans.some(vlan => vlan.tag === tag)
      ? { ...withHistory(s), vlans: [...s.vlans, { id: nanoid(8), tag, name: cleanName, color }] }
      : s;
  }),
  updateVlan: (id, updates) => set(s => {
    const current = s.vlans.find(vlan => vlan.id === id);
    if (!current) return s;
    const tag = updates.tag ?? current.tag, name = updates.name?.trim() ?? current.name, color = updates.color ?? current.color;
    if (!Number.isInteger(tag) || tag < 1 || tag > 4094 || !name || s.vlans.some(vlan => vlan.id !== id && vlan.tag === tag)) return s;
    const next = { ...current, tag, name, color };
    return JSON.stringify(current) === JSON.stringify(next) ? s : { ...withHistory(s), vlans: s.vlans.map(vlan => vlan.id === id ? next : vlan) };
  }),
  deleteVlan: id => set(s => s.vlans.some(vlan => vlan.id === id) ? ({
    ...withHistory(s),
    vlans: s.vlans.filter(vlan => vlan.id !== id),
    nodes: s.nodes.map(node => {
      if (!node.vlanIds?.includes(id)) return node;
      const vlanIds = node.vlanIds.filter(vlanId => vlanId !== id);
      return { ...node, vlanIds: vlanIds.length ? vlanIds : undefined };
    }),
    selectedVlanId: s.selectedVlanId === id ? null : s.selectedVlanId,
  }) : s),
  setNodeVlanAssignment: (nodeId, vlanId, assigned) => set(s => {
    const node = s.nodes.find(item => item.id === nodeId);
    if (!node || !hasEthernetPort(node) || !s.vlans.some(vlan => vlan.id === vlanId)) return s;
    const current = node.vlanIds ?? [], vlanIds = assigned ? [...new Set([...current, vlanId])] : current.filter(id => id !== vlanId);
    if (current.length === vlanIds.length && current.every((id, i) => id === vlanIds[i])) return s;
    return { ...withHistory(s), nodes: s.nodes.map(item => item.id === nodeId ? { ...item, vlanIds: vlanIds.length ? vlanIds : undefined } : item) };
  }),
  autoAlign: () => set(s => {
    const nodes = alignNodesForCables(s.nodes, s.edges, s.spaces).map(node => ({ ...node, position: snapXY(node.position) }));
    const changed = nodes.some((node, i) => !samePosition(node.position, s.nodes[i].position));
    return changed
      ? { ...withHistory(s), nodes, selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [], geometryRevision: s.geometryRevision + 1 }
      : { selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [] };
  }),
  undo: () => set(s => {
    const prev = s.past.at(-1);
    return prev ? { ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future], transaction: null, selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [], geometryRevision: s.geometryRevision + Number(geometryChanged(s, prev)) } : s;
  }),
  redo: () => set(s => {
    const next = s.future[0];
    return next ? { ...next, past: [...s.past, snap(s)].slice(-50), future: s.future.slice(1), transaction: null, selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [], geometryRevision: s.geometryRevision + Number(geometryChanged(s, next)) } : s;
  }),
  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { spaces?: unknown };
      const data = normalizeCanvasData(parsed, get().viewport);
      if (!data) return;
      const spaces = data.spaces.length ? data.spaces : [{ name: 'TV set', color: '#c7d2fe' }, { name: 'Control room', color: '#bbf7d0' }];
      set(s => ({ nodes: data.nodes.map(n => ({ ...n, position: snapXY(n.position), ports: n.ports.flatMap(p => expandLabels([p.label]).map((label, i) => ({ ...p, id: i ? nanoid(8) : p.id, label, signalType: p.signalType ?? templateSignal(label) }))) })), edges: data.edges, viewport: data.viewport, spaces, vlans: data.vlans, selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [], past: [], future: [], transaction: null, geometryRevision: s.geometryRevision + 1 }));
    } catch { /* Ignore corrupt or unavailable browser storage. */ }
  },
  loadShared: input => {
    const data = normalizeCanvasData(input, get().viewport);
    if (!data) return;
    const nodes = data.nodes.map(node => ({ ...node, position: snapXY(node.position) }));
    set(s => ({ nodes, edges: data.edges, spaces: data.spaces, vlans: data.vlans, viewport: data.viewport, selectedNodeId: null, selectedEdgeId: null, selectedVlanId: null, selectedNodeIds: [], past: [], future: [], transaction: null, geometryRevision: s.geometryRevision + 1 }));
  },
  saveToStorage: () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(canvasDataFromState(get())));
    } catch { /* Keep editing usable when browser storage is unavailable. */ }
  },
}));

export const addPort = (node: Node, side: Port['side']): Node => ({ ...node, ports: [...node.ports, { id: nanoid(8), label: side === 'input' ? 'NEW IN' : 'NEW OUT', side, signalType: 'analog_audio' as SignalType }] });
