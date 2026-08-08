import { createGraphIndex } from '../graph/indexes';
import { SIGNAL_TYPES, templateSignal } from '../nodes/NodeTypes';
import { hasEthernetPort } from '../types/graph';
import type { Edge, Node, Viewport, Vlan } from '../types/graph';

export type Space = { name: string; color: string };
export type CanvasData = { nodes: Node[]; edges: Edge[]; viewport: Viewport; spaces: Space[]; vlans: Vlan[] };

const finitePoint = (value: unknown): value is { x: number; y: number } => {
  const point = value as { x?: number; y?: number } | null;
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
};

export const normalizeCanvasData = (input: unknown, fallbackViewport: Viewport = { x: 0, y: 0, zoom: 1 }): CanvasData | null => {
  const data = input as Partial<CanvasData> & { spaces?: unknown[]; vlans?: unknown[] };
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
  const rawVlans = (Array.isArray(data.vlans) ? data.vlans : []) as unknown[];
  const usedVlanIds = new Set<string>(), usedTags = new Set<number>();
  const vlans = rawVlans.flatMap((value): Vlan[] => {
    const item = value as Partial<Vlan> | null;
    const tag = Number(item?.tag), id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!item || !id || usedVlanIds.has(id) || !Number.isInteger(tag) || tag < 1 || tag > 4094 || usedTags.has(tag) || typeof item.name !== 'string' || !item.name.trim() || typeof item.color !== 'string') return [];
    usedVlanIds.add(id); usedTags.add(tag);
    return [{ id, tag, name: item.name.trim(), color: item.color }];
  });
  const vlanIds = new Set(vlans.map(vlan => vlan.id));
  const nodes = data.nodes.filter((node): node is Node => !!node && typeof node.id === 'string' && finitePoint(node.position) && Array.isArray(node.ports))
    .map(node => {
      const ports = node.ports.filter(port => port && typeof port.id === 'string' && typeof port.label === 'string').map(port => ({
        ...port,
        signalType: node.layout === 'ethernet-switch' && /^eth(?:ernet)?\b/i.test(port.label)
          ? 'ethernet' as const
          : port.signalType in SIGNAL_TYPES ? port.signalType : templateSignal(port.label),
      }));
      const assignments = hasEthernetPort({ ports }) ? [...new Set((Array.isArray(node.vlanIds) ? node.vlanIds : []).filter(id => typeof id === 'string' && vlanIds.has(id)))] : [];
      return { ...node, ports, vlanIds: assignments.length ? assignments : undefined };
    });
  const graph = createGraphIndex(nodes);
  const edges = data.edges.filter((edge): edge is Edge => !!edge && typeof edge.id === 'string'
    && !!graph.portByNodeId.get(edge.sourceNodeId)?.has(edge.sourcePortId)
    && !!graph.portByNodeId.get(edge.targetNodeId)?.has(edge.targetPortId))
    .map(edge => ({ ...edge, waypoints: edge.waypoints?.filter(finitePoint) }));
  const rawSpaces = (Array.isArray(data.spaces) ? data.spaces : []) as unknown[];
  const spaces = rawSpaces.flatMap((space, i): Space[] => {
    if (typeof space === 'string' && space.trim()) return [{ name: space.trim(), color: i ? '#bbf7d0' : '#c7d2fe' }];
    const item = space as Partial<Space> | null;
    return item && typeof item.name === 'string' && item.name.trim() && typeof item.color === 'string' ? [{ name: item.name.trim(), color: item.color }] : [];
  });
  const viewport = data.viewport && Number.isFinite(data.viewport.x) && Number.isFinite(data.viewport.y) && Number.isFinite(data.viewport.zoom) && data.viewport.zoom > 0
    ? data.viewport : fallbackViewport;
  return { nodes, edges, viewport, spaces, vlans };
};

export const canvasDataFromState = (state: Pick<CanvasData, 'nodes' | 'edges' | 'viewport' | 'spaces' | 'vlans'>): CanvasData => ({
  nodes: state.nodes, edges: state.edges, viewport: state.viewport, spaces: state.spaces, vlans: state.vlans,
});

export const uniqueSpaceName = (name: string, used: Set<string>) => {
  if (!used.has(name)) { used.add(name); return name; }
  let suffix = 1;
  while (used.has(`${name}-${suffix}`)) suffix++;
  const unique = `${name}-${suffix}`;
  used.add(unique);
  return unique;
};
