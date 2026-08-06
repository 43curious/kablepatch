import { createGraphIndex } from '../graph/indexes';
import type { Edge, Node, Viewport } from '../types/graph';

export type Space = { name: string; color: string };
export type CanvasData = { nodes: Node[]; edges: Edge[]; viewport: Viewport; spaces: Space[] };

const finitePoint = (value: unknown): value is { x: number; y: number } => {
  const point = value as { x?: number; y?: number } | null;
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
};

export const normalizeCanvasData = (input: unknown, fallbackViewport: Viewport = { x: 0, y: 0, zoom: 1 }): CanvasData | null => {
  const data = input as Partial<CanvasData> & { spaces?: unknown[] };
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;
  const nodes = data.nodes.filter((node): node is Node => !!node && typeof node.id === 'string' && finitePoint(node.position) && Array.isArray(node.ports))
    .map(node => ({ ...node, ports: node.ports.filter(port => port && typeof port.id === 'string' && typeof port.label === 'string') }));
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
  return { nodes, edges, viewport, spaces };
};

export const canvasDataFromState = (state: Pick<CanvasData, 'nodes' | 'edges' | 'viewport' | 'spaces'>): CanvasData => ({
  nodes: state.nodes, edges: state.edges, viewport: state.viewport, spaces: state.spaces,
});

export const uniqueSpaceName = (name: string, used: Set<string>) => {
  if (!used.has(name)) { used.add(name); return name; }
  let suffix = 1;
  while (used.has(`${name}-${suffix}`)) suffix++;
  const unique = `${name}-${suffix}`;
  used.add(unique);
  return unique;
};
