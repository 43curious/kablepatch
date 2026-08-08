import { createRoutingRequestProcessor } from './routingWorkerCore';
import type { RoutingWorkerRequest } from './routingWorkerProtocol';
import { formatRoutingViolations, validateRoutingResult } from './routingValidation';

const processRoutingRequest = createRoutingRequestProcessor();

self.onmessage = (event: MessageEvent<RoutingWorkerRequest>) => {
  const response = processRoutingRequest(event.data);
  if (import.meta.env.DEV && response.routes) {
    const violations = validateRoutingResult(event.data.edges, event.data.nodes, response.routes, event.data.options);
    if (violations.length) console.error(`Routing invariant violations for request ${event.data.requestId}:\n${formatRoutingViolations(violations)}`, violations);
  }
  self.postMessage(response);
};
