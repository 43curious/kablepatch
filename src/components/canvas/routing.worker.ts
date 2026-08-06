import { processRoutingRequest } from './routingWorkerCore';
import type { RoutingWorkerRequest } from './routingWorkerProtocol';

self.onmessage = (event: MessageEvent<RoutingWorkerRequest>) => {
  self.postMessage(processRoutingRequest(event.data));
};
