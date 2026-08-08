import { describe, expect, it } from 'vitest';
import { routeEdges } from './geometry';
import { createRoutingRequestProcessor, processRoutingRequest } from './routingWorkerCore';

const request = {
  requestId: 7,
  edges: [{ id: 'edge', source: { x: 0, y: 40 }, target: { x: 300, y: 160 }, sourceNodeId: 'source', targetNodeId: 'target' }],
  nodes: [],
  options: { portMargin: 28, laneSpacing: 8, obstacleClearance: 12 },
};

describe('routing worker core', () => {
  it('preserves request identity and deterministic router output', () => {
    const response = processRoutingRequest(request);
    expect(response).toMatchObject({ requestId: request.requestId, routes: routeEdges(request.edges, request.nodes, request.options) });
    expect(response.telemetry).toMatchObject({ edgeCount: 1, nodeCount: 0, sceneCacheHit: false });
  });

  it('reuses an unchanged obstacle scene without changing route output', () => {
    let time = 0;
    const process = createRoutingRequestProcessor(() => time++);
    const first = process(request), second = process({ ...request, requestId: 8 });

    expect(first.routes).toEqual(second.routes);
    expect(first.telemetry).toEqual({ edgeCount: 1, nodeCount: 0, sceneCacheHit: false, sceneKeyMs: 1, sceneBuildMs: 1, routingMs: 1, workerTotalMs: 6 });
    expect(second.telemetry.sceneCacheHit).toBe(true);
    expect(second.telemetry.sceneBuildMs).toBe(0);
  });

  it('returns protocol errors when malformed runtime geometry breaks scene-key creation', () => {
    const malformed = { ...request, nodes: [{ id: 'bad', position: { x: 0, y: 0 }, ports: null }] } as unknown as typeof request;
    const response = processRoutingRequest(malformed);
    expect(response.requestId).toBe(request.requestId);
    expect(response.error).toBeTruthy();
    expect(response.routes).toBeUndefined();
    expect(response.telemetry).toMatchObject({ edgeCount: 1, nodeCount: 1 });
  });

  it('keys the scene by obstacle geometry rather than irrelevant metadata', () => {
    const process = createRoutingRequestProcessor();
    const node = { id: 'block', label: 'Before', category: 'Custom', headerColor: '#000', position: { x: 100, y: 100 }, ports: [] };
    const first = process({ ...request, nodes: [node] });
    const metadataOnly = process({ ...request, requestId: 8, nodes: [{ ...node, label: 'After', headerColor: '#fff' }] });
    const moved = process({ ...request, requestId: 9, nodes: [{ ...node, position: { x: 124, y: 100 } }] });
    const clearanceChanged = process({ ...request, requestId: 10, nodes: [{ ...node, position: { x: 124, y: 100 } }], options: { ...request.options, obstacleClearance: 24 } });

    expect(first.telemetry.sceneCacheHit).toBe(false);
    expect(metadataOnly.telemetry.sceneCacheHit).toBe(true);
    expect(moved.telemetry.sceneCacheHit).toBe(false);
    expect(clearanceChanged.telemetry.sceneCacheHit).toBe(false);
  });
});
