import { nodeHeight, nodeRect, nodeWidth, portDirection, portPosition } from '../components/canvas/geometry';
import type { PortFace, Rect } from '../components/canvas/geometry';
import type { Edge, Node, Port, XY } from '../types/graph';

export type GraphIndex = {
  nodeById: Map<string, Node>;
  portByNodeId: Map<string, Map<string, Port>>;
  nodesBySpace: Map<string, Node[]>;
};

export type ResolvedEdge = {
  edge: Edge;
  sourceNode: Node;
  sourcePort: Port;
  targetNode: Node;
  targetPort: Port;
};

export const createGraphIndex = (nodes: Node[]): GraphIndex => {
  const nodeById = new Map<string, Node>();
  const portByNodeId = new Map<string, Map<string, Port>>();
  const nodesBySpace = new Map<string, Node[]>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
    portByNodeId.set(node.id, new Map(node.ports.map(port => [port.id, port])));
    const space = node.space ?? '';
    const group = nodesBySpace.get(space) ?? [];
    group.push(node);
    nodesBySpace.set(space, group);
  }
  return { nodeById, portByNodeId, nodesBySpace };
};

export const resolveEdge = (edge: Edge, index: GraphIndex): ResolvedEdge | null => {
  const sourceNode = index.nodeById.get(edge.sourceNodeId), targetNode = index.nodeById.get(edge.targetNodeId);
  const sourcePort = index.portByNodeId.get(edge.sourceNodeId)?.get(edge.sourcePortId);
  const targetPort = index.portByNodeId.get(edge.targetNodeId)?.get(edge.targetPortId);
  return sourceNode && targetNode && sourcePort && targetPort ? { edge, sourceNode, sourcePort, targetNode, targetPort } : null;
};

export const resolveEdges = (edges: Edge[], index: GraphIndex) => edges.flatMap(edge => {
  const resolved = resolveEdge(edge, index);
  return resolved ? [resolved] : [];
});

export type NodeGeometry = {
  node: Node;
  width: number;
  height: number;
  rect: Rect;
  ports: Map<string, { position: XY; direction: PortFace }>;
};

export type GeometryIndex = { byNodeId: Map<string, NodeGeometry> };

export const createGeometryIndex = (nodes: Node[], previous?: GeometryIndex): GeometryIndex => {
  const byNodeId = new Map<string, NodeGeometry>();
  for (const node of nodes) {
    const cached = previous?.byNodeId.get(node.id);
    if (cached && (cached.node === node || cached.node.position === node.position && cached.node.ports === node.ports && cached.node.layout === node.layout)) {
      byNodeId.set(node.id, cached);
      continue;
    }
    byNodeId.set(node.id, {
      node,
      width: nodeWidth(node),
      height: nodeHeight(node),
      rect: nodeRect(node),
      ports: new Map(node.ports.map(port => [port.id, { position: portPosition(node, port.id), direction: portDirection(node, port) }])),
    });
  }
  return { byNodeId };
};
