import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutingWorkerClient } from './routingWorkerClient';
import type { RoutingWorkerRequest, RoutingWorkerResponse } from './routingWorkerProtocol';

const telemetry = { edgeCount: 1, nodeCount: 0, sceneCacheHit: false, sceneKeyMs: 1, sceneBuildMs: 1, routingMs: 2, workerTotalMs: 4 };
const job = {
  edges: [{ id: 'edge', source: { x: 0, y: 0 }, target: { x: 100, y: 0 }, sourceNodeId: 'a', targetNodeId: 'b' }],
  nodes: [],
  options: { portMargin: 28, laneSpacing: 8, obstacleClearance: 12 },
};

class FakeWorker {
  onmessage: ((event: MessageEvent<RoutingWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: RoutingWorkerRequest[] = [];
  terminated = 0;
  postMessage(message: RoutingWorkerRequest) { this.messages.push(message); }
  terminate() { this.terminated++; }
  respond(response: RoutingWorkerResponse) { this.onmessage?.({ data: response } as MessageEvent<RoutingWorkerResponse>); }
  fail(message = 'worker failed') { this.onerror?.({ message } as ErrorEvent); }
}

const success = (requestId: number): RoutingWorkerResponse => ({
  requestId,
  routes: [{ id: 'edge', status: 'routed', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], path: 'M0,0 H100', crossings: [] }],
  telemetry,
});

describe('RoutingWorkerClient', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const workers: FakeWorker[] = [], routes = vi.fn(), errors = vi.fn(), states = vi.fn(), metrics = vi.fn();
    const client = new RoutingWorkerClient({
      createWorker: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
      onRoutes: routes,
      onError: errors,
      onStateChange: states,
      onTelemetry: metrics,
      now: () => Date.now(),
    });
    return { client, workers, routes, errors, states, metrics };
  };

  it('coalesces a burst and reuses one persistent worker', () => {
    const { client, workers, routes, metrics } = setup();
    client.schedule(job); client.schedule(job); const latest = client.schedule(job);
    vi.advanceTimersByTime(15);
    expect(workers).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages.map(message => message.requestId)).toEqual([latest]);
    workers[0].respond(success(latest));
    expect(routes).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ requestId: latest, queueMs: 16, roundTripMs: 0, coalescedRequests: 2, stale: false }));

    const next = client.schedule(job);
    vi.advanceTimersByTime(16);
    expect(workers).toHaveLength(1);
    expect(workers[0].messages.at(-1)?.requestId).toBe(next);
  });

  it('keeps only the newest pending request while another route is running', () => {
    const { client, workers, routes, metrics } = setup();
    const first = client.schedule(job);
    vi.advanceTimersByTime(16);
    client.schedule(job); const latest = client.schedule(job);
    workers[0].respond(success(first));
    expect(routes).not.toHaveBeenCalled();
    expect(metrics).toHaveBeenLastCalledWith(expect.objectContaining({ requestId: first, stale: true }));
    vi.advanceTimersByTime(16);
    expect(workers[0].messages.map(message => message.requestId)).toEqual([first, latest]);
    workers[0].respond(success(latest));
    expect(routes).toHaveBeenCalledTimes(1);
  });

  it('aborts active work on cancellation and starts the next job immediately on a fresh worker', () => {
    const { client, workers, routes, states } = setup();
    const requestId = client.schedule(job);
    vi.advanceTimersByTime(16);
    client.cancel();
    expect(workers[0].terminated).toBe(1);
    workers[0].respond(success(requestId));
    expect(routes).not.toHaveBeenCalled();
    expect(states).toHaveBeenLastCalledWith(false);

    const next = client.schedule(job);
    vi.advanceTimersByTime(16);
    expect(workers).toHaveLength(2);
    workers[1].respond(success(next));
    expect(routes).toHaveBeenCalledTimes(1);
    client.dispose(); client.dispose();
    expect(workers[1].terminated).toBe(1);
  });

  it('does not surface a stale response error over a newer request', () => {
    const { client, workers, errors, routes } = setup();
    const first = client.schedule(job);
    vi.advanceTimersByTime(16);
    const latest = client.schedule(job);
    workers[0].respond({ requestId: first, error: 'stale failure', telemetry });
    expect(errors).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    workers[0].respond(success(latest));
    expect(routes).toHaveBeenCalledTimes(1);
  });

  it('recovers with a fresh worker after a fatal worker error', () => {
    const { client, workers, errors, routes } = setup();
    client.schedule(job);
    vi.advanceTimersByTime(16);
    workers[0].fail();
    expect(errors).toHaveBeenCalledWith('worker failed', job);
    const next = client.schedule(job);
    vi.advanceTimersByTime(16);
    expect(workers).toHaveLength(2);
    workers[1].respond(success(next));
    expect(routes).toHaveBeenCalledTimes(1);
  });
});
