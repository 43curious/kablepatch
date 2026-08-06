import { describe, expect, it } from 'vitest';
import type { Edge, Node, Port } from '../types/graph';
import { nodeHeight, nodeWidth, portDirection, portPosition } from '../components/canvas/geometry';
import { createGeometryIndex, createGraphIndex, resolveEdge } from './indexes';

const port = (id: string, side: Port['side']): Port => ({ id, label: id, side, signalType: 'analog_audio' });
const node = (id: string, x: number, side: Port['side']): Node => ({ id, label: id, category: 'Custom', headerColor: '#000', position: { x, y: 0 }, ports: [port('shared-port-id', side)] });

describe('graph indexes', () => {
  it('resolves ports within their owning node and rejects dangling edges', () => {
    const source = node('source', 0, 'output'), target = node('target', 400, 'input');
    const index = createGraphIndex([source, target]);
    const edge: Edge = { id: 'edge', sourceNodeId: source.id, sourcePortId: 'shared-port-id', targetNodeId: target.id, targetPortId: 'shared-port-id' };

    expect(resolveEdge(edge, index)).toMatchObject({ sourceNode: source, sourcePort: source.ports[0], targetNode: target, targetPort: target.ports[0] });
    expect(resolveEdge({ ...edge, targetPortId: 'missing' }, index)).toBeNull();
  });

  it('matches existing geometry and reuses unchanged entries', () => {
    const source = node('source', 0, 'output'), target = node('target', 400, 'input');
    const first = createGeometryIndex([source, target]);
    const moved = { ...source, position: { x: 24, y: 48 } };
    const second = createGeometryIndex([moved, target], first);

    expect(second.byNodeId.get(target.id)).toBe(first.byNodeId.get(target.id));
    expect(second.byNodeId.get(source.id)).not.toBe(first.byNodeId.get(source.id));
    const measured = second.byNodeId.get(source.id)!;
    expect(measured.width).toBe(nodeWidth(moved));
    expect(measured.height).toBe(nodeHeight(moved));
    expect(measured.ports.get(source.ports[0].id)).toEqual({ position: portPosition(moved, source.ports[0].id), direction: portDirection(moved, source.ports[0]) });
  });
});
