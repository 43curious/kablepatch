import { HALF_GRID, cableObstacleRect, createRoutingScene, routeEdgesInScene } from './geometry';
import type { RoutingScene } from './geometry';
import type { RoutingWorkerRequest, RoutingWorkerResponse, RoutingWorkerTelemetry } from './routingWorkerProtocol';

type Clock = () => number;
const systemClock: Clock = () => performance.now();

const effectiveClearance = (value: number) => Math.max(HALF_GRID, Number.isFinite(value) ? value : 0);
const sceneKey = (request: RoutingWorkerRequest) => {
  const clearance = effectiveClearance(request.options.obstacleClearance);
  return JSON.stringify([clearance, request.nodes.map(node => [node.id, cableObstacleRect(node, clearance)])]);
};

export const createRoutingRequestProcessor = (now: Clock = systemClock) => {
  let cachedKey: string | undefined;
  let cachedScene: RoutingScene | undefined;

  return (request: RoutingWorkerRequest): RoutingWorkerResponse => {
    const totalStart = now();
    const edgeCount = Array.isArray(request.edges) ? request.edges.length : 0;
    const nodeCount = Array.isArray(request.nodes) ? request.nodes.length : 0;
    let cacheHit = false, sceneKeyMs = 0, sceneBuildMs = 0, routingMs = 0;
    try {
      const keyStart = now();
      const key = sceneKey(request);
      const keyEnd = now();
      sceneKeyMs = keyEnd - keyStart;
      cacheHit = key === cachedKey && !!cachedScene;
      if (!cacheHit) {
        const buildStart = now();
        cachedScene = createRoutingScene(request.nodes, request.options.obstacleClearance);
        cachedKey = key;
        sceneBuildMs = now() - buildStart;
      }
      const routingStart = now();
      const routes = routeEdgesInScene(request.edges, cachedScene!, request.options);
      const routingEnd = now();
      routingMs = routingEnd - routingStart;
      const telemetry: RoutingWorkerTelemetry = {
        edgeCount, nodeCount, sceneCacheHit: cacheHit, sceneKeyMs, sceneBuildMs, routingMs,
        workerTotalMs: routingEnd - totalStart,
      };
      return { requestId: request.requestId, routes, telemetry };
    } catch (error) {
      const end = now();
      return {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : 'Routing failed',
        telemetry: {
          edgeCount, nodeCount, sceneCacheHit: cacheHit, sceneKeyMs, sceneBuildMs, routingMs,
          workerTotalMs: end - totalStart,
        },
      };
    }
  };
};

/** Stateless compatibility entry point used by unit tests and non-Worker callers. */
export const processRoutingRequest = (request: RoutingWorkerRequest): RoutingWorkerResponse => createRoutingRequestProcessor()(request);
