import { describe, expect, it } from 'vitest';
import type { Edge, Node, Port, XY } from '../types/graph';
import { NODE_TYPES } from '../nodes/NodeTypes';
import { GRID, NODE_WIDTH, ethernetLabelDepth, ethernetPortPitch, isEthernetSwitch, nodeHeight, nodeWidth, portDirection, portPosition, routeEdges, switchNameStripeY } from '../components/canvas/geometry';
import { alignNodesForCables, NODE_GAP, portsAreCompatible, useCanvasStore } from './canvasStore';

const port = (id: string, side: Port['side']): Port => ({ id, label: id, side, signalType: 'analog_audio' });
const node = (id: string, position: XY, side: Port['side']): Node => ({ id, label: id, category: 'Custom', headerColor: '#000', position, ports: [port(`${id}-port`, side)] });
const edge = (id: string, source: Node, target: Node): Edge => ({ id, sourceNodeId: source.id, sourcePortId: source.ports[0].id, targetNodeId: target.id, targetPortId: target.ports[0].id });
const byId = (nodes: Node[]) => new Map(nodes.map(item => [item.id, item]));
const overlap = (a: number, b: number, c: number, d: number) => Math.max(Math.min(a, b), Math.min(c, d)) < Math.min(Math.max(a, b), Math.max(c, d));
const routesOverlap = (a: XY[], b: XY[]) => a.slice(1).some((endA, i) => b.slice(1).some((endB, j) => {
  const startA = a[i], startB = b[j];
  return startA.x === endA.x && startB.x === endB.x
    ? startA.x === startB.x && overlap(startA.y, endA.y, startB.y, endB.y)
    : startA.y === endA.y && startB.y === endB.y && startA.y === startB.y && overlap(startA.x, endA.x, startB.x, endB.x);
}));

describe('port compatibility', () => {
  it('accepts input/output and bidirectional pairs only', () => {
    expect(portsAreCompatible(port('out', 'output'), port('in', 'input'))).toBe(true);
    expect(portsAreCompatible(port('in', 'input'), port('both', 'bidirectional'))).toBe(true);
    expect(portsAreCompatible(port('out-a', 'output'), port('out-b', 'output'))).toBe(false);
  });

  it('does not connect a bidirectional port to itself on click', () => {
    const previous = useCanvasStore.getState();
    const both = node('both', { x: 0, y: 0 }, 'bidirectional');
    try {
      useCanvasStore.setState({ nodes: [both], edges: [] });
      useCanvasStore.getState().addEdge(both.id, both.ports[0].id, both.id, both.ports[0].id);
      expect(useCanvasStore.getState().edges).toEqual([]);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });
});

describe('routing invalidation', () => {
  it('increments geometry revision only for routing-relevant node edits', () => {
    const previous = useCanvasStore.getState();
    const device = node('device', { x: 0, y: 0 }, 'output');
    try {
      useCanvasStore.setState({ nodes: [device], edges: [], past: [], future: [], geometryRevision: 10 });
      const store = useCanvasStore.getState();
      store.updateNode(device.id, { label: 'Renamed', notes: 'Notes', category: 'Audio', headerColor: '#fff', space: 'Studio' });
      expect(useCanvasStore.getState().geometryRevision).toBe(10);

      store.updateNode(device.id, { position: { x: GRID, y: 0 } });
      expect(useCanvasStore.getState().geometryRevision).toBe(11);
      store.updateNode(device.id, { ports: [{ ...device.ports[0], label: 'Long connector label' }] });
      expect(useCanvasStore.getState().geometryRevision).toBe(12);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('invalidates routes for topology, waypoints, and transient movement', () => {
    const previous = useCanvasStore.getState();
    const source = node('source', { x: 0, y: 0 }, 'output'), target = node('target', { x: 400, y: 0 }, 'input');
    try {
      useCanvasStore.setState({ nodes: [source, target], edges: [], past: [], future: [], geometryRevision: 20, draggingNodeId: source.id });
      const store = useCanvasStore.getState();
      store.addEdge(source.id, source.ports[0].id, target.id, target.ports[0].id);
      expect(useCanvasStore.getState().geometryRevision).toBe(21);
      const cableId = useCanvasStore.getState().edges[0].id;
      store.setEdgeWaypoints(cableId, [{ x: 101, y: 99 }]);
      expect(useCanvasStore.getState().geometryRevision).toBe(22);
      store.setEdgeWaypoints(cableId, [{ x: 101, y: 99 }]);
      expect(useCanvasStore.getState().geometryRevision).toBe(22);
      store.resetEdgeRoute(cableId);
      expect(useCanvasStore.getState().geometryRevision).toBe(23);
      store.moveNodeTransient(source.id, { x: GRID, y: GRID });
      expect(useCanvasStore.getState().geometryRevision).toBe(24);
      store.finishNodeDrag(source.id, { x: GRID, y: GRID });
      expect(useCanvasStore.getState().geometryRevision).toBe(24);
      expect(useCanvasStore.getState().draggingNodeId).toBeNull();
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('commits many drag frames as one undoable transaction', () => {
    const previous = useCanvasStore.getState();
    const device = node('device', { x: 0, y: 0 }, 'output');
    try {
      useCanvasStore.setState({ nodes: [device], edges: [], past: [], future: [], transaction: null, geometryRevision: 40, draggingNodeId: device.id });
      const store = useCanvasStore.getState();
      store.beginTransaction();
      for (let i = 1; i <= 20; i++) store.moveNodeTransient(device.id, { x: i * GRID, y: 0 });
      expect(useCanvasStore.getState().past).toHaveLength(0);
      store.finishNodeDrag(device.id);
      expect(useCanvasStore.getState().past).toHaveLength(1);
      const finalPosition = useCanvasStore.getState().nodes[0].position;
      store.undo();
      expect(useCanvasStore.getState().nodes[0].position).toEqual(device.position);
      store.redo();
      expect(useCanvasStore.getState().nodes[0].position).toEqual(finalPosition);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('does not create history for no-op space and alignment actions', () => {
    const previous = useCanvasStore.getState();
    try {
      useCanvasStore.setState({ nodes: [], edges: [], spaces: [{ name: 'Studio', color: '#fff' }], past: [], future: [], transaction: null });
      useCanvasStore.getState().updateSpace('Studio', { color: '#fff' });
      useCanvasStore.getState().autoAlign();
      expect(useCanvasStore.getState().past).toHaveLength(0);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('does not reroute metadata-only undo but reroutes geometry undo', () => {
    const previous = useCanvasStore.getState();
    const device = node('device', { x: 0, y: 0 }, 'output');
    try {
      useCanvasStore.setState({ nodes: [device], edges: [], past: [], future: [], geometryRevision: 30 });
      useCanvasStore.getState().updateNode(device.id, { label: 'Metadata' });
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().geometryRevision).toBe(30);

      useCanvasStore.getState().updateNode(device.id, { position: { x: GRID, y: 0 } });
      expect(useCanvasStore.getState().geometryRevision).toBe(31);
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().geometryRevision).toBe(32);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });
});

describe('canvas selection', () => {
  it('adds and removes nodes from a shift-click selection', () => {
    const previous = useCanvasStore.getState();
    try {
      useCanvasStore.setState({ selectedNodeId: null, selectedNodeIds: [] });
      useCanvasStore.getState().selectNode('a');
      useCanvasStore.getState().selectNode('b', true);
      expect(useCanvasStore.getState().selectedNodeIds).toEqual(['a', 'b']);
      expect(useCanvasStore.getState().selectedNodeId).toBeNull();
      useCanvasStore.getState().selectNode('a', true);
      expect(useCanvasStore.getState().selectedNodeIds).toEqual(['b']);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });
});

describe('VLAN management', () => {
  it('creates selectable VLANs and assigns only Ethernet components', () => {
    const previous = useCanvasStore.getState();
    const networked: Node = { ...node('networked', { x: 0, y: 0 }, 'bidirectional'), ports: [{ id: 'eth', label: 'ETH', side: 'bidirectional', signalType: 'ethernet' }] };
    const analog = node('analog', { x: 240, y: 0 }, 'input');
    try {
      useCanvasStore.setState({ nodes: [networked, analog], edges: [], spaces: [], vlans: [], selectedNodeId: networked.id, selectedNodeIds: [networked.id], selectedEdgeId: null, selectedVlanId: null, past: [], future: [], transaction: null, geometryRevision: 50 });
      const store = useCanvasStore.getState();
      store.addVlan(10, 'Control', '#22c55e');
      store.addVlan(20, 'Media', '#8b5cf6');
      store.addVlan(10, 'Duplicate');
      const [control, media] = useCanvasStore.getState().vlans;
      expect(useCanvasStore.getState().vlans).toHaveLength(2);
      expect(useCanvasStore.getState().geometryRevision).toBe(50);

      store.setNodeVlanAssignment(networked.id, control.id, true);
      store.setNodeVlanAssignment(networked.id, media.id, true);
      store.setNodeVlanAssignment(analog.id, control.id, true);
      expect(useCanvasStore.getState().nodes.find(item => item.id === networked.id)?.vlanIds).toEqual([control.id, media.id]);
      expect(useCanvasStore.getState().nodes.find(item => item.id === analog.id)?.vlanIds).toBeUndefined();
      expect(useCanvasStore.getState().geometryRevision).toBe(50);

      store.selectVlan(control.id);
      expect(useCanvasStore.getState()).toMatchObject({ selectedVlanId: control.id, selectedNodeId: null, selectedNodeIds: [], selectedEdgeId: null });
      store.selectNode(networked.id);
      expect(useCanvasStore.getState().selectedVlanId).toBeNull();

      store.deleteVlan(control.id);
      expect(useCanvasStore.getState().nodes.find(item => item.id === networked.id)?.vlanIds).toEqual([media.id]);
      store.undo();
      expect(useCanvasStore.getState().vlans.some(vlan => vlan.id === control.id)).toBe(true);
      expect(useCanvasStore.getState().nodes.find(item => item.id === networked.id)?.vlanIds).toEqual([control.id, media.id]);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('merges imported VLAN tags and remaps imported assignments', () => {
    const previous = useCanvasStore.getState();
    const imported: Node = { ...node('imported', { x: 0, y: 0 }, 'bidirectional'), ports: [{ id: 'eth', label: 'ETH', side: 'bidirectional', signalType: 'ethernet' }], vlanIds: ['incoming-control', 'incoming-media'] };
    try {
      useCanvasStore.setState({ nodes: [], edges: [], spaces: [], vlans: [{ id: 'existing-control', tag: 10, name: 'Existing control', color: '#22c55e' }], past: [], future: [], transaction: null });
      useCanvasStore.getState().importCanvas({
        nodes: [imported], edges: [], spaces: [], viewport: { x: 0, y: 0, zoom: 1 },
        vlans: [{ id: 'incoming-control', tag: 10, name: 'Imported control', color: '#000000' }, { id: 'incoming-media', tag: 20, name: 'Media', color: '#8b5cf6' }],
      });
      const state = useCanvasStore.getState(), media = state.vlans.find(vlan => vlan.tag === 20)!;
      expect(state.vlans).toHaveLength(2);
      expect(state.vlans.find(vlan => vlan.tag === 10)?.id).toBe('existing-control');
      expect(state.nodes[0].vlanIds).toEqual(['existing-control', media.id]);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('clears VLAN assignments when the last Ethernet port is removed', () => {
    const previous = useCanvasStore.getState();
    const networked: Node = { ...node('networked', { x: 0, y: 0 }, 'bidirectional'), ports: [{ id: 'eth', label: 'ETH', side: 'bidirectional', signalType: 'ethernet' }], vlanIds: ['control'] };
    try {
      useCanvasStore.setState({ nodes: [networked], edges: [], vlans: [{ id: 'control', tag: 10, name: 'Control', color: '#22c55e' }], past: [], future: [], transaction: null, geometryRevision: 60 });
      useCanvasStore.getState().updateNode(networked.id, { ports: [{ ...networked.ports[0], signalType: 'analog_audio' }] });
      expect(useCanvasStore.getState().nodes[0].vlanIds).toBeUndefined();
      expect(useCanvasStore.getState().geometryRevision).toBe(61);
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().nodes[0].vlanIds).toEqual(['control']);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });
});

describe('cable-first auto alignment', () => {
  it('keeps allocated spaces contiguous without top-aligning their components', () => {
    const isolated = { ...node('isolated', { x: 0, y: 0 }, 'output'), space: 'Studio' };
    const source = { ...node('source', { x: 0, y: 480 }, 'output'), space: 'Studio' };
    const target = { ...node('target', { x: 500, y: 0 }, 'input'), space: 'Control' };
    const aligned = alignNodesForCables([isolated, source, target], [edge('cross-space', source, target)], [{ name: 'Studio', color: '#000' }, { name: 'Control', color: '#fff' }]);
    const nodes = byId(aligned), studio = aligned.filter(item => item.space === 'Studio'), control = aligned.filter(item => item.space === 'Control');

    expect(Math.max(...studio.map(item => item.position.x + NODE_WIDTH)) + GRID * 3).toBeLessThanOrEqual(Math.min(...control.map(item => item.position.x)));
    expect(aligned.every(item => ['Studio', 'Control'].includes(item.space!))).toBe(true);
    expect(portPosition(nodes.get('source')!, source.ports[0].id).y).toBe(portPosition(nodes.get('target')!, target.ports[0].id).y);
    expect(nodes.get('target')!.position.y).toBeGreaterThan(nodes.get('isolated')!.position.y);
  });

  it('provides an ethernet switch template with bidirectional ports', () => {
    const template = NODE_TYPES.find(item => item.id === 'ethernet-switch');
    expect(template?.layout).toBe('ethernet-switch');
    expect(template?.defaultBidirectional).toEqual(['ETH 1-24']);
    expect(template?.defaultInputs).toEqual([]);
    expect(template?.defaultOutputs).toEqual([]);
  });

  it('creates ethernet switches with top ports and a bottom name stripe by default', () => {
    const previous = useCanvasStore.getState();
    try {
      useCanvasStore.setState({ nodes: [], edges: [] });
      useCanvasStore.getState().addNode('ethernet-switch', { x: 0, y: 0 });
      const switchNode = useCanvasStore.getState().nodes[0];

      expect(switchNode.layout).toBe('ethernet-switch');
      expect(switchNode.ports).toHaveLength(24);
      expect(switchNode.ports.every(item => item.side === 'bidirectional' && item.position === 'top' && item.signalType === 'ethernet')).toBe(true);
      expect(switchNode.ports.every(item => portDirection(switchNode, item) === 'north')).toBe(true);
      expect(switchNameStripeY(switchNode)).toBe(nodeHeight(switchNode) - 40);
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('lays ethernet switch ports across top and bottom rails and expands horizontally', () => {
    const ports = Array.from({ length: 24 }, (_, i): Port => ({ id: `eth-${i}`, label: `ETH ${i + 1}`, side: 'bidirectional', position: i < 12 ? 'top' : 'bottom', signalType: 'ethernet' }));
    const switchNode: Node = { ...node('switch', { x: 0, y: 0 }, 'output'), ports, layout: 'ethernet-switch' };
    const top = portPosition(switchNode, 'eth-0'), bottom = portPosition(switchNode, 'eth-23');

    expect(isEthernetSwitch(switchNode)).toBe(true);
    expect(nodeWidth(switchNode)).toBeGreaterThan(NODE_WIDTH);
    expect(nodeHeight(switchNode)).toBe(ethernetLabelDepth(switchNode) * 2 + 40);
    expect(portDirection(switchNode, ports[0])).toBe('north');
    expect(portDirection(switchNode, ports[23])).toBe('south');
    expect(top.y).toBe(switchNode.position.y);
    expect(bottom.y).toBe(switchNode.position.y + nodeHeight(switchNode));
    expect(bottom.x).toBeGreaterThan(top.x);
    expect(ethernetPortPitch(switchNode)).toBe(GRID);
    expect(bottom.x - top.x).toBe(ethernetPortPitch(switchNode) * 11);
    expect(top.x + portPosition(switchNode, 'eth-11').x).toBe(nodeWidth(switchNode));
    expect(switchNameStripeY(switchNode)).toBe(nodeHeight(switchNode) / 2 - 20);
    const target: Node = { ...node('target', { x: nodeWidth(switchNode) + GRID * 4, y: 0 }, 'input'), ports: [{ id: 'in', label: 'IN', side: 'bidirectional', position: 'top', signalType: 'ethernet' }], layout: 'ethernet-switch' };
    const route = routeEdges([{ id: 'network', source: top, target: portPosition(target, 'in'), sourceNodeId: switchNode.id, targetNodeId: target.id, sourceSide: 'north', targetSide: 'north' }], [switchNode, target])[0];
    expect(route.points[0]).toEqual(top);
    expect(route.points.at(-1)).toEqual(portPosition(target, 'in'));
    expect(route.points.slice(1).every((point, i) => point.x === route.points[i].x || point.y === route.points[i].y)).toBe(true);
  });

  it('keeps switch connector spacing consistent for long I/O labels', () => {
    const ports: Port[] = ['MANAGEMENT NETWORK A', 'MANAGEMENT NETWORK B'].map((label, i) => ({ id: `long-${i}`, label, side: 'bidirectional', position: 'top', signalType: 'ethernet' }));
    const switchNode: Node = { ...node('long-label-switch', { x: 0, y: 0 }, 'output'), layout: 'ethernet-switch', ports };
    const distance = portPosition(switchNode, ports[1].id).x - portPosition(switchNode, ports[0].id).x;

    expect(ethernetPortPitch(switchNode)).toBe(GRID);
    expect(distance).toBe(GRID);
    expect(nodeHeight(switchNode)).toBe(100);
    expect(ethernetLabelDepth(switchNode)).toBe(GRID * 2);
  });

  it('moves the switch name stripe away from a single occupied connector rail', () => {
    const topOnly: Node = { ...node('top', { x: 0, y: 0 }, 'output'), layout: 'ethernet-switch', ports: [{ id: 'top-port', label: 'ETH', side: 'bidirectional', position: 'top', signalType: 'ethernet' }] };
    const bottomOnly: Node = { ...topOnly, id: 'bottom', ports: [{ ...topOnly.ports[0], id: 'bottom-port', position: 'bottom' }] };

    expect(portPosition(topOnly, 'top-port').x).toBe(nodeWidth(topOnly) / 2);
    expect(portPosition(bottomOnly, 'bottom-port').x).toBe(nodeWidth(bottomOnly) / 2);
    expect(nodeHeight(topOnly)).toBe(100);
    expect(switchNameStripeY(topOnly)).toBe(nodeHeight(topOnly) - 40);
    expect(switchNameStripeY(bottomOnly)).toBe(0);
  });

  it('places ethernet ports on the bottom of non-switch components', () => {
    const ethernet: Port = { id: 'network', label: 'CONTROL', side: 'input', signalType: 'ethernet' };
    const device: Node = { ...node('device', { x: 120, y: 240 }, 'output'), ports: [ethernet, port('audio', 'output')] };
    const position = portPosition(device, ethernet.id);

    expect(isEthernetSwitch(device)).toBe(false);
    expect(portDirection(device, ethernet)).toBe('south');
    expect(position.y).toBe(device.position.y + nodeHeight(device));
    expect(position.x).toBe(device.position.x + nodeWidth(device) / 2);
  });

  it('keeps two snap spaces between components in the same column', () => {
    const first = node('first', { x: 0, y: 0 }, 'output'), second = node('second', { x: 0, y: 0 }, 'output');
    const aligned = alignNodesForCables([first, second], []);
    const ordered = [...aligned].sort((a, b) => a.position.y - b.position.y);

    expect(NODE_GAP).toBe(GRID * 2);
    expect(ordered[1].position.y - (ordered[0].position.y + nodeHeight(ordered[0]))).toBe(GRID * 2);
  });

  it('aligns connected ports instead of pulling every column to the top component', () => {
    const isolated = node('isolated', { x: 0, y: 0 }, 'output');
    const source = node('source', { x: 0, y: 480 }, 'output');
    const target = node('target', { x: 500, y: 480 }, 'input');
    const aligned = byId(alignNodesForCables([isolated, source, target], [edge('cable', source, target)]));
    const alignedSource = aligned.get('source')!, alignedTarget = aligned.get('target')!;

    expect(alignedTarget.position.y).toBeGreaterThan(isolated.position.y + NODE_GAP);
    expect(portPosition(alignedSource, alignedSource.ports[0].id).y).toBe(portPosition(alignedTarget, alignedTarget.ports[0].id).y);
  });

  it('orders components from their connections so independent cables become clear direct runs', () => {
    const upperSource = node('upper-source', { x: 0, y: 0 }, 'output');
    const lowerSource = node('lower-source', { x: 0, y: 480 }, 'output');
    const wrongUpperTarget = node('lower-target', { x: 500, y: 0 }, 'input');
    const wrongLowerTarget = node('upper-target', { x: 500, y: 480 }, 'input');
    const edges = [edge('upper', upperSource, wrongLowerTarget), edge('lower', lowerSource, wrongUpperTarget)];
    const aligned = alignNodesForCables([upperSource, lowerSource, wrongUpperTarget, wrongLowerTarget], edges);
    const nodes = byId(aligned);
    const routes = routeEdges(edges.map(item => ({
      id: item.id,
      source: portPosition(nodes.get(item.sourceNodeId)!, item.sourcePortId),
      target: portPosition(nodes.get(item.targetNodeId)!, item.targetPortId),
      sourceNodeId: item.sourceNodeId,
      targetNodeId: item.targetNodeId,
    })), aligned);

    expect(routes.every(route => route.points.length === 2)).toBe(true);
    for (const item of edges) expect(portPosition(nodes.get(item.sourceNodeId)!, item.sourcePortId).y).toBe(portPosition(nodes.get(item.targetNodeId)!, item.targetPortId).y);
  });

  it('widens busy cable corridors instead of compressing their lanes', () => {
    const source: Node = { ...node('source', { x: 0, y: 240 }, 'output'), ports: Array.from({ length: 10 }, (_, i) => port(`out-${i}`, 'output')) };
    const target: Node = { ...node('target', { x: 500, y: 240 }, 'input'), ports: Array.from({ length: 10 }, (_, i) => port(`in-${i}`, 'input')) };
    const edges: Edge[] = source.ports.map((item, i) => ({ id: `cable-${i}`, sourceNodeId: source.id, sourcePortId: item.id, targetNodeId: target.id, targetPortId: target.ports[i].id }));
    const alignedNodes = alignNodesForCables([source, target], edges), aligned = byId(alignedNodes);
    const routes = routeEdges(edges.map(item => ({
      id: item.id,
      source: portPosition(aligned.get('source')!, item.sourcePortId),
      target: portPosition(aligned.get('target')!, item.targetPortId),
      sourceNodeId: item.sourceNodeId,
      targetNodeId: item.targetNodeId,
    })), alignedNodes);

    expect(aligned.get('target')!.position.x - aligned.get('source')!.position.x - NODE_WIDTH).toBe(264);
    expect(routes.every(route => route.points.length > 1)).toBe(true);
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) expect(routesOverlap(routes[i].points, routes[j].points)).toBe(false);
  });
});
