import type { RoutingWorkerRequest, RoutingWorkerResponse, RoutingWorkerTelemetry, WorkerRouteOptions } from './routingWorkerProtocol';
import type { EdgeRouteInput } from './geometry';
import type { Node } from '../../types/graph';

export type RoutingJob = { edges: EdgeRouteInput[]; nodes: Node[]; options: WorkerRouteOptions };
export type RoutingClientTelemetry = RoutingWorkerTelemetry & {
  requestId: number;
  queueMs: number;
  roundTripMs: number;
  coalescedRequests: number;
  stale: boolean;
};

type WorkerLike = {
  onmessage: ((event: MessageEvent<RoutingWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: RoutingWorkerRequest): void;
  terminate(): void;
};

type Pending = { requestId: number; job: RoutingJob; scheduledAt: number; coalescedRequests: number };
type InFlight = Pending & { sentAt: number };

type RoutingWorkerClientOptions = {
  createWorker: () => WorkerLike;
  onRoutes: (response: RoutingWorkerResponse & { routes: NonNullable<RoutingWorkerResponse['routes']> }, job: RoutingJob) => void;
  onError: (message: string, job?: RoutingJob) => void;
  onStateChange: (routing: boolean) => void;
  onTelemetry?: (telemetry: RoutingClientTelemetry) => void;
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  coalesceMs?: number;
};

export class RoutingWorkerClient {
  private worker: WorkerLike | undefined;
  private pending: Pending | undefined;
  private inFlight: InFlight | undefined;
  private timer: unknown;
  private nextRequestId = 0;
  private latestRequestId = 0;
  private disposed = false;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delay: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private readonly coalesceMs: number;

  constructor(private readonly options: RoutingWorkerClientOptions) {
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimer ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.coalesceMs = options.coalesceMs ?? 16;
  }

  schedule(job: RoutingJob) {
    if (this.disposed) return -1;
    const requestId = ++this.nextRequestId;
    this.latestRequestId = requestId;
    const coalescedRequests = this.pending ? this.pending.coalescedRequests + 1 : 0;
    this.pending = { requestId, job, scheduledAt: this.now(), coalescedRequests };
    this.options.onStateChange(true);
    if (!this.inFlight) this.armTimer();
    return requestId;
  }

  cancel() {
    if (this.disposed) return;
    this.latestRequestId = ++this.nextRequestId;
    this.pending = undefined;
    this.clearScheduledTimer();
    // Explicit cancellation (not ordinary superseding) should stop expensive
    // obsolete A* work so a post-drag request is never queued behind it.
    if (this.inFlight) {
      this.inFlight = undefined;
      this.worker?.terminate();
      this.worker = undefined;
    }
    this.options.onStateChange(false);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = undefined;
    this.inFlight = undefined;
    this.clearScheduledTimer();
    this.worker?.terminate();
    this.worker = undefined;
  }

  private armTimer() {
    this.clearScheduledTimer();
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      this.dispatchPending();
    }, this.coalesceMs);
  }

  private clearScheduledTimer() {
    if (this.timer !== undefined) this.clearTimer(this.timer);
    this.timer = undefined;
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.options.createWorker();
    worker.onmessage = event => this.handleMessage(event.data);
    worker.onerror = event => this.handleWorkerError(event.message || 'Cable routing worker failed');
    this.worker = worker;
    return worker;
  }

  private dispatchPending() {
    if (this.disposed || this.inFlight || !this.pending) return;
    const pending = this.pending;
    this.pending = undefined;
    const sentAt = this.now();
    this.inFlight = { ...pending, sentAt };
    try {
      this.ensureWorker().postMessage({ requestId: pending.requestId, ...pending.job });
    } catch (error) {
      this.handleWorkerError(error instanceof Error ? error.message : 'Cable routing worker failed');
    }
  }

  private handleMessage(response: RoutingWorkerResponse) {
    if (this.disposed || response.requestId !== this.inFlight?.requestId) return;
    const completedAt = this.now();
    const completed = this.inFlight;
    this.inFlight = undefined;
    const stale = response.requestId !== this.latestRequestId;
    this.options.onTelemetry?.({
      ...response.telemetry,
      requestId: response.requestId,
      queueMs: completed.sentAt - completed.scheduledAt,
      roundTripMs: completedAt - completed.sentAt,
      coalescedRequests: completed.coalescedRequests,
      stale,
    });
    if (!stale) {
      if (response.routes) this.options.onRoutes(response as RoutingWorkerResponse & { routes: NonNullable<RoutingWorkerResponse['routes']> }, completed.job);
      else this.options.onError(response.error ?? 'Cable routing failed', completed.job);
    }
    if (this.pending) this.armTimer();
    else this.options.onStateChange(false);
  }

  private handleWorkerError(message: string) {
    if (this.disposed) return;
    const failed = this.inFlight;
    this.inFlight = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    if (failed?.requestId === this.latestRequestId) this.options.onError(message, failed.job);
    if (this.pending) this.armTimer();
    else this.options.onStateChange(false);
  }
}
