import type { Node } from '../../types/graph';
import type { EdgeRouteInput, RoutedEdge } from './geometry';

export type WorkerRouteOptions = {
  portMargin: number;
  laneSpacing: number;
  obstacleClearance: number;
  ripUpIterations?: number;
};

export type RoutingWorkerRequest = {
  requestId: number;
  edges: EdgeRouteInput[];
  nodes: Node[];
  options: WorkerRouteOptions;
};

export type RoutingWorkerTelemetry = {
  edgeCount: number;
  nodeCount: number;
  sceneCacheHit: boolean;
  sceneKeyMs: number;
  sceneBuildMs: number;
  routingMs: number;
  workerTotalMs: number;
};

export type RoutingWorkerResponse = {
  requestId: number;
  routes?: RoutedEdge[];
  error?: string;
  telemetry: RoutingWorkerTelemetry;
};
