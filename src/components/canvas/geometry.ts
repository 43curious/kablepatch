import type { Node, XY } from '../../types/graph';

export const GRID = 24;
export const HALF_GRID = GRID / 2;
export const NODE_WIDTH = 216;
export const HEADER_HEIGHT = 30;
export const ROW_HEIGHT = GRID;
export const MIN_ROWS = 2;
export const GROUP_GAP = GRID;

export const snapToGrid = (n: number) => Math.round(n / GRID) * GRID;
export const snapToHalfGrid = (n: number) => Math.round(n / HALF_GRID) * HALF_GRID;
export const snapXY = (p: XY): XY => ({ x: snapToGrid(p.x), y: snapToGrid(p.y) });

const groupName = (label: string) => label.replace(/\s+\d+$/, '');
const groupGapsBefore = (ports: { label: string }[], i: number) => ports.slice(1, i + 1).filter((p, n) => groupName(p.label) !== groupName(ports[n].label)).length;
const sideHeight = (ports: { label: string }[]) => Math.max(MIN_ROWS, ports.length) * ROW_HEIGHT + groupGapsBefore(ports, ports.length - 1) * GROUP_GAP;

export const nodeHeight = (node: Node) => snapToGrid(HEADER_HEIGHT + 18 + Math.max(sideHeight(node.ports.filter(p => p.side === 'input')), sideHeight(node.ports.filter(p => p.side === 'output'))));

/** Converts a browser client point into zoom-independent canvas/world coordinates. */
export const toWorld = (client: XY, svg: SVGSVGElement, viewport: { x: number; y: number; zoom: number }): XY => {
  const r = svg.getBoundingClientRect();
  return { x: (client.x - r.left - viewport.x) / viewport.zoom, y: (client.y - r.top - viewport.y) / viewport.zoom };
};

/** Returns the world-space center of a port dot without querying layout. */
export const portPosition = (node: Node, portId: string): XY => {
  const port = node.ports.find(p => p.id === portId);
  if (!port) return node.position;
  const sidePorts = node.ports.filter(p => p.side === port.side);
  const i = Math.max(0, sidePorts.findIndex(p => p.id === portId));
  return {
    x: node.position.x + (port.side === 'input' ? 0 : NODE_WIDTH),
    y: node.position.y + HEADER_HEIGHT + 18 + i * ROW_HEIGHT + groupGapsBefore(sidePorts, i) * GROUP_GAP,
  };
};

export const nodeRect = (n: Node) => ({ x: n.position.x, y: n.position.y, w: NODE_WIDTH, h: nodeHeight(n) });
export const rectsOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

type Rect = { x: number; y: number; w: number; h: number };
type PortSide = 'input' | 'output';
type Direction = 'H' | 'V' | 'N';

const sideDir = (side: PortSide) => side === 'input' ? -1 : 1;
const key = (p: XY) => `${p.x},${p.y}`;
const distance = (a: XY, b: XY) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cleanPath = (points: XY[]) => points
  .filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
  .filter((p, i, a) => !i || i === a.length - 1 || !((a[i - 1].x === p.x && p.x === a[i + 1].x) || (a[i - 1].y === p.y && p.y === a[i + 1].y)));

const segmentHitsRect = (a: XY, b: XY, r: Rect) => {
  if (a.x === b.x) return a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
  if (a.y === b.y) return a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
  return true;
};
type VerticalRun = { x: number; y1: number; y2: number };
type HorizontalRun = { y: number; x1: number; x2: number };
const overlaps = (a1: number, a2: number, b1: number, b2: number) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) > Math.max(Math.min(a1, a2), Math.min(b1, b2));
const clear = (a: XY, b: XY, obstacles: Rect[], usedVertical: VerticalRun[], usedHorizontal: HorizontalRun[]) =>
  !obstacles.some(r => segmentHitsRect(a, b, r)) &&
  !(a.x === b.x && usedVertical.some(run => run.x === a.x && overlaps(a.y, b.y, run.y1, run.y2))) &&
  !(a.y === b.y && usedHorizontal.some(run => run.y === a.y && overlaps(a.x, b.x, run.x1, run.x2)));

/** Builds LEGO-like cable runs: half-grid, square only, never through components. */
export const pathToSvg = (points: XY[]) => `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
export const pointsToHV = (points: XY[]) => points.map((p, i) => i ? (p.x === points[i - 1].x ? `V${p.y}` : `H${p.x}`) : `M${p.x},${p.y}`).join(' ');

/* A visibility graph only needs component borders, not every grid cell. It stays small
   as cables grow and its clear segments cannot pass through a component. */
const findRoute = (start: XY, end: XY, obstacles: Rect[], usedVertical: VerticalRun[], usedHorizontal: HorizontalRun[], laneGap: number): XY[] | null => {
  const pad = GRID * 4;
  const xLanes = usedVertical.flatMap(run => [run.x - laneGap, run.x + laneGap]);
  const yLanes = usedHorizontal.flatMap(run => [run.y - laneGap, run.y + laneGap]);
  const xs = [...new Set([start.x, end.x, snapToHalfGrid((start.x + end.x) / 2), ...xLanes, ...obstacles.flatMap(r => [r.x, r.x + r.w]), Math.min(start.x, end.x, ...obstacles.map(r => r.x)) - pad, Math.max(start.x, end.x, ...obstacles.map(r => r.x + r.w)) + pad].map(snapToHalfGrid))].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, snapToHalfGrid((start.y + end.y) / 2), ...yLanes, ...obstacles.flatMap(r => [r.y, r.y + r.h]), Math.min(start.y, end.y, ...obstacles.map(r => r.y)) - pad, Math.max(start.y, end.y, ...obstacles.map(r => r.y + r.h)) + pad].map(snapToHalfGrid))].sort((a, b) => a - b);
  const points = new Map<string, XY>();
  const rows = new Map<number, XY[]>(), columns = new Map<number, XY[]>();
  for (const x of xs) for (const y of ys) {
    const p = { x, y };
    points.set(key(p), p);
    (rows.get(y) ?? rows.set(y, []).get(y)!).push(p);
    (columns.get(x) ?? columns.set(x, []).get(x)!).push(p);
  }
  rows.forEach(row => row.sort((a, b) => a.x - b.x));
  columns.forEach(column => column.sort((a, b) => a.y - b.y));
  const neighbors = (p: XY) => [rows.get(p.y), columns.get(p.x)].flatMap(line => {
    const i = line?.findIndex(q => q.x === p.x && q.y === p.y) ?? -1;
    return i < 0 ? [] : [line![i - 1], line![i + 1]].filter(Boolean) as XY[];
  });

  type Step = { point: XY; direction: Direction; cost: number; estimate: number; state: string };
  const heap: Step[] = [];
  const push = (step: Step) => {
    heap.push(step);
    let i = heap.length - 1;
    while (i) {
      const parent = (i - 1) >> 1;
      if (heap[parent].estimate <= step.estimate) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = step;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (!heap.length) return first;
    let i = 0;
    while (i * 2 + 1 < heap.length) {
      let child = i * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1].estimate < heap[child].estimate) child++;
      if (heap[child].estimate >= last.estimate) break;
      heap[i] = heap[child]; i = child;
    }
    heap[i] = last;
    return first;
  };

  const stateKey = (p: XY, direction: Direction) => `${key(p)}:${direction}`;
  const best = new Map<string, number>();
  const previous = new Map<string, string>();
  const startState = stateKey(start, 'N');
  best.set(startState, 0);
  push({ point: start, direction: 'N', cost: 0, estimate: distance(start, end), state: startState });

  while (heap.length) {
    const current = pop();
    if (current.cost !== best.get(current.state)) continue;
    if (current.point.x === end.x && current.point.y === end.y) {
      const route: XY[] = [];
      for (let state = current.state; state; state = previous.get(state) ?? '') route.unshift(points.get(state.slice(0, state.lastIndexOf(':'))) ?? start);
      return route;
    }
    for (const next of neighbors(current.point)) {
      if (!clear(current.point, next, obstacles, usedVertical, usedHorizontal)) continue;
      const direction: Direction = current.point.x === next.x ? 'V' : 'H';
      const cost = current.cost + distance(current.point, next) + (current.direction !== 'N' && current.direction !== direction ? GRID * 3 : 0);
      const state = stateKey(next, direction);
      if (cost >= (best.get(state) ?? Infinity)) continue;
      best.set(state, cost); previous.set(state, current.state);
      push({ point: next, direction, cost, estimate: cost + distance(next, end), state });
    }
  }
  return null;
};

const routedPoints = (source: XY, target: XY, nodes: Node[], from: PortSide, to: PortSide, offset = 0, stub = 28, margin = 18, usedVertical: VerticalRun[] = [], usedHorizontal: HorizontalRun[] = [], laneGap = HALF_GRID) => {
  const start = { x: snapToHalfGrid(source.x + sideDir(from) * (stub + offset)), y: source.y };
  const end = { x: snapToHalfGrid(target.x + sideDir(to) * (stub + offset)), y: target.y };
  const obstacles = nodes.map(n => {
    const r = nodeRect(n);
    return { x: r.x - margin, y: r.y - margin, w: r.w + margin * 2, h: r.h + margin * 2 };
  });
  const middle = findRoute(start, end, obstacles, usedVertical, usedHorizontal, laneGap);
  // Overlapping nodes make any route physically impossible. Do not draw a cable through them.
  return middle ? cleanPath([source, ...middle, target]) : [source];
};

export type EdgeRouteInput = { id: string; source: XY; target: XY; sourceNodeId: string; targetNodeId: string };
export type RoutedEdge = { id: string; path: string; channelX: number; kind: 'forward' | 'back' };

/** Routes each cable by its shortest clear orthogonal path and reserves every run for later cables. */
export const routeEdges = (edges: EdgeRouteInput[], nodes: Node[], options: { stub?: number; laneGap?: number; margin?: number } = {}): RoutedEdge[] => {
  const usedVertical: VerticalRun[] = [], usedHorizontal: HorizontalRun[] = [];
  const laneGap = snapToHalfGrid(options.laneGap ?? HALF_GRID);
  return edges.map(edge => {
    const points = routedPoints(edge.source, edge.target, nodes, 'output', 'input', 0, options.stub, options.margin, usedVertical, usedHorizontal, laneGap);
    points.slice(1).forEach((point, i) => {
      const previous = points[i];
      if (previous.x === point.x && previous.y !== point.y) usedVertical.push({ x: point.x, y1: previous.y, y2: point.y });
      if (previous.y === point.y && previous.x !== point.x) usedHorizontal.push({ y: point.y, x1: previous.x, x2: point.x });
    });
    return { id: edge.id, path: pointsToHV(points), channelX: points[1]?.x ?? edge.source.x, kind: edge.source.x < edge.target.x ? 'forward' : 'back' };
  });
};

export const cablePoints = (a: XY, b: XY, nodes: Node[] = [], offset = 0, from: PortSide = 'output', to: PortSide = 'input'): XY[] => routedPoints(a, b, nodes, from, to, offset);

/** Builds a clear temporary cable while the user is dragging from a port. */
export const straightPath = (a: XY, b: XY, nodes: Node[] = [], offset = 0, from: PortSide = 'output', to: PortSide = 'input'): string => pointsToHV(cablePoints(a, b, nodes, offset, from, to));
