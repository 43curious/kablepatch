import { describe, expect, it } from 'vitest';
import { routeEdges } from './geometry';
import { processRoutingRequest } from './routingWorkerCore';

const request = {
  requestId: 7,
  edges: [{ id: 'edge', source: { x: 0, y: 40 }, target: { x: 300, y: 160 }, sourceNodeId: 'source', targetNodeId: 'target' }],
  nodes: [],
  options: { portMargin: 28, laneSpacing: 8, obstacleClearance: 12 },
};

describe('routing worker core', () => {
  it('preserves request identity and deterministic router output', () => {
    expect(processRoutingRequest(request)).toEqual({ requestId: request.requestId, routes: routeEdges(request.edges, request.nodes, request.options) });
  });
});
