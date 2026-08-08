import { describe, expect, it } from 'vitest';
import type { Node } from '../types/graph';
import { canvasDataFromState, normalizeCanvasData, uniqueSpaceName } from './canvasDocument';

const source: Node = { id: 'source', label: 'Source', category: 'Custom', headerColor: '#000', position: { x: 0, y: 0 }, ports: [{ id: 'out', label: 'Out', side: 'output', signalType: 'analog_audio' }] };
const target: Node = { id: 'target', label: 'Target', category: 'Custom', headerColor: '#000', position: { x: 300, y: 0 }, ports: [{ id: 'in', label: 'In', side: 'input', signalType: 'analog_audio' }] };

describe('canvas document normalization', () => {
  it('normalizes legacy spaces and removes dangling edges and invalid waypoints', () => {
    const data = normalizeCanvasData({
      nodes: [source, target],
      edges: [
        { id: 'valid', sourceNodeId: source.id, sourcePortId: 'out', targetNodeId: target.id, targetPortId: 'in', waypoints: [{ x: 10, y: 20 }, { x: Infinity, y: 0 }] },
        { id: 'dangling', sourceNodeId: source.id, sourcePortId: 'missing', targetNodeId: target.id, targetPortId: 'in' },
      ],
      viewport: { x: 1, y: 2, zoom: 1 }, spaces: ['Studio'],
    });

    expect(data?.spaces).toEqual([{ name: 'Studio', color: '#c7d2fe' }]);
    expect(data?.edges).toHaveLength(1);
    expect(data?.edges[0].waypoints).toEqual([{ x: 10, y: 20 }]);
  });

  it('normalizes VLANs and keeps assignments only on Ethernet components', () => {
    const networked = { ...source, ports: [{ ...source.ports[0], label: 'ETH', signalType: 'ethernet' as const }], vlanIds: ['control', 'missing', 'control'] };
    const analog = { ...target, vlanIds: ['control'] };
    const data = normalizeCanvasData({
      nodes: [networked, analog], edges: [], spaces: [], viewport: { x: 0, y: 0, zoom: 1 },
      vlans: [
        { id: 'control', tag: 10, name: 'Control', color: '#22c55e' },
        { id: 'duplicate-tag', tag: 10, name: 'Duplicate', color: '#000000' },
        { id: 'invalid', tag: 5000, name: 'Invalid', color: '#000000' },
      ],
    })!;

    expect(data.vlans).toEqual([{ id: 'control', tag: 10, name: 'Control', color: '#22c55e' }]);
    expect(data.nodes[0].vlanIds).toEqual(['control']);
    expect(data.nodes[1].vlanIds).toBeUndefined();
  });

  it('migrates legacy Ethernet switch ports and defaults missing VLANs', () => {
    const legacySwitch = { ...source, layout: 'ethernet-switch' as const, ports: [{ ...source.ports[0], label: 'ETH 1', side: 'bidirectional' as const, signalType: 'analog_audio' as const }] };
    const data = normalizeCanvasData({ nodes: [legacySwitch], edges: [], spaces: [], viewport: { x: 0, y: 0, zoom: 1 } })!;

    expect(data.vlans).toEqual([]);
    expect(data.nodes[0].ports[0].signalType).toBe('ethernet');
  });

  it('uses a safe viewport fallback and round-trips valid state', () => {
    const fallback = { x: 5, y: 6, zoom: 2 };
    const data = normalizeCanvasData({ nodes: [source], edges: [], spaces: [], viewport: { x: 0, y: 0, zoom: 0 } }, fallback)!;
    expect(data.viewport).toEqual(fallback);
    expect(canvasDataFromState(data)).toEqual(data);
  });

  it('rejects malformed documents and creates deterministic unique space names', () => {
    expect(normalizeCanvasData({ nodes: 'invalid', edges: [] })).toBeNull();
    const used = new Set(['Room', 'Room-1']);
    expect(uniqueSpaceName('Room', used)).toBe('Room-2');
  });
});
