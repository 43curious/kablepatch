import { routeEdges } from './geometry';
import type { RoutingWorkerRequest, RoutingWorkerResponse } from './routingWorkerProtocol';

export const processRoutingRequest = (request: RoutingWorkerRequest): RoutingWorkerResponse => {
  try {
    return { requestId: request.requestId, routes: routeEdges(request.edges, request.nodes, request.options) };
  } catch (error) {
    return { requestId: request.requestId, error: error instanceof Error ? error.message : 'Routing failed' };
  }
};
