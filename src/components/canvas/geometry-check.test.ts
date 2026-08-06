import { describe, expect, it } from 'vitest';
import type { Node, Port } from '../../types/graph';
import {
  GRID, HALF_GRID, NODE_WIDTH, cableCorridorGap, cableObstacleRect, ethernetLabelDepth,
  ethernetPortPitch, isEthernetSwitch, isSinglePortNode, nodeHeight, nodeWidth,
  portDirection, portPosition, portSide, shortestNodeY, switchNameStripeY,
} from './geometry';

const port = (id: string, side: Port['side'], signalType: Port['signalType'] = 'analog_audio', position?: Port['position']): Port => ({ id, label: id, side, signalType, position });
const node = (id: string, x = 0, y = 0): Node => ({ id, label: id, category: 'Custom', headerColor: '#000', position: { x, y }, ports: [] });

describe('component geometry', () => {
  it('places compact input and output ports on opposite title bars', () => {
    const output: Node = { ...node('output'), ports: [port('out', 'output')] };
    const input: Node = { ...node('input'), ports: [port('in', 'input')] };

    expect(isSinglePortNode(output)).toBe(true);
    expect(nodeHeight(output)).toBe(GRID * 2);
    expect(portPosition(output, 'out')).toEqual({ x: NODE_WIDTH, y: GRID });
    expect(portPosition(input, 'in')).toEqual({ x: 0, y: GRID });
    expect(cableObstacleRect(output).x).toBe(-GRID - HALF_GRID);
    expect(cableObstacleRect(input).x + cableObstacleRect(input).w).toBe(NODE_WIDTH + GRID + HALF_GRID);
  });

  it('keeps Ethernet switch rails symmetric and title bars away from occupied rails', () => {
    const ports = Array.from({ length: 24 }, (_, i) => port(`eth-${i}`, 'bidirectional', 'ethernet', 'top'));
    const ethernetSwitch: Node = { ...node('switch'), layout: 'ethernet-switch', ports };
    const first = portPosition(ethernetSwitch, ports[0].id), last = portPosition(ethernetSwitch, ports.at(-1)!.id);

    expect(isEthernetSwitch(ethernetSwitch)).toBe(true);
    expect(ethernetPortPitch(ethernetSwitch)).toBe(GRID);
    expect(first.x + last.x).toBe(nodeWidth(ethernetSwitch));
    expect(nodeHeight(ethernetSwitch)).toBe(100);
    expect(switchNameStripeY(ethernetSwitch)).toBe(60);
    expect(cableObstacleRect(ethernetSwitch).y + cableObstacleRect(ethernetSwitch).h).toBe(nodeHeight(ethernetSwitch) + GRID + HALF_GRID);
  });

  it('supports top and bottom switch rails', () => {
    const ports = [port('top', 'bidirectional', 'ethernet', 'top'), port('bottom', 'bidirectional', 'ethernet', 'bottom')];
    const ethernetSwitch: Node = { ...node('switch'), layout: 'ethernet-switch', ports };

    expect(portDirection(ethernetSwitch, ports[0])).toBe('north');
    expect(portDirection(ethernetSwitch, ports[1])).toBe('south');
    expect(portPosition(ethernetSwitch, 'top').y).toBe(0);
    expect(portPosition(ethernetSwitch, 'bottom').y).toBe(nodeHeight(ethernetSwitch));
    expect(nodeHeight(ethernetSwitch)).toBe(ethernetLabelDepth(ethernetSwitch) * 2 + 40);
  });

  it('places non-switch Ethernet ports on a centered bottom rail', () => {
    const ethernet = port('network', 'input', 'ethernet');
    const device: Node = { ...node('device', 120, 240), ports: [ethernet, port('audio', 'output')] };

    expect(portSide(ethernet)).toBe('input');
    expect(portDirection(device, ethernet)).toBe('south');
    expect(portPosition(device, ethernet.id)).toEqual({ x: device.position.x + nodeWidth(device) / 2, y: device.position.y + nodeHeight(device) });
  });

  it('uses median port alignment and scalable cable corridors', () => {
    const source: Node = { ...node('source'), ports: [port('out', 'output')] };
    const targets = [0, 120, 240].map((y, i): Node => ({ ...node(`target-${i}`, 400, y), ports: [port('in', 'input')] }));

    expect(shortestNodeY(source, targets.map(target => ({ node: target, ownPortId: 'out', otherPortId: 'in' })))).toBe(120);
    expect(cableCorridorGap(0)).toBe(GRID * 3);
    expect(cableCorridorGap(100)).toBe(101 * GRID);
  });
});
