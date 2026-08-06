import type { Node, Port, XY } from '../../types/graph';

export const GRID = 24;
export const HALF_GRID = GRID / 2;
export const NODE_WIDTH = 216;
export const HEADER_HEIGHT = 30;
export const ROW_HEIGHT = GRID;
export const MIN_ROWS = 2;
export const GROUP_GAP = GRID;
export const PORT_MARGIN = 28;
export const CABLE_LANE_SPACING = 8;
/** Routing uses its own fine grid; component placement remains on the 24px GRID. */
export const ROUTING_PITCH = 8;

export const snapToGrid = (n: number) => Math.round(n / GRID) * GRID;
export const snapToHalfGrid = (n: number) => Math.round(n / HALF_GRID) * HALF_GRID;
/** Space for this many independent fan-out lanes on both sides of a corridor. */
export const cableCorridorGap = (lanes: number) => Math.max(GRID * 3, (lanes + 1) * GRID);
export const snapXY = (p: XY): XY => ({ x: snapToGrid(p.x), y: snapToGrid(p.y) });

const groupName = (label: string) => label.replace(/\s+\d+$/, '');
const groupGapsBefore = (ports: { label: string }[], i: number) => ports.slice(1, i + 1).filter((p, n) => groupName(p.label) !== groupName(ports[n].label)).length;
const sideHeight = (ports: { label: string }[]) => Math.max(MIN_ROWS, ports.length) * ROW_HEIGHT + groupGapsBefore(ports, ports.length - 1) * GROUP_GAP;

export const isSinglePortNode = (node: Node) => node.ports.length === 1;
export const isEthernetSwitch = (node: Node) => node.layout === 'ethernet-switch';
export const SWITCH_PORT_PITCH = GRID;
const longestEthernetLabel = (node: Node) => Math.max(1, ...node.ports.filter(port => port.signalType === 'ethernet').flatMap(port => [port.label, ...(port.aliases ?? [])]).map(label => label.length));
export const ethernetPortPitch = (node: Node) => isEthernetSwitch(node) ? SWITCH_PORT_PITCH : Math.max(SWITCH_PORT_PITCH, Math.ceil((longestEthernetLabel(node) * 3 + 6) / HALF_GRID) * HALF_GRID);
export const ethernetLabelDepth = (node: Node) => isEthernetSwitch(node) ? GRID * 2 : Math.max(GRID * 2, Math.ceil((longestEthernetLabel(node) * 4.25 + 18) / GRID) * GRID);
export const portSide = (port: Pick<Port, 'side' | 'position'>): 'input' | 'output' => port.side === 'bidirectional' ? (port.position === 'right' || port.position === 'bottom' ? 'output' : 'input') : port.side;
export type PortFace = 'north' | 'east' | 'south' | 'west';
const switchFace = (port: Port): PortFace => port.position === 'bottom' ? 'south' : 'north';
const switchRailSize = (node: Node) => Math.max(1, ...(['north', 'south'] as const).map(face => node.ports.filter(port => switchFace(port) === face).length));
const railNodeWidth = (ports: number, pitch: number) => {
  const span = Math.max(0, ports - 1) * pitch, minimum = Math.max(NODE_WIDTH, (ports + 1) * pitch);
  return span + Math.ceil((minimum - span) / GRID) * GRID;
};
export const nodeWidth = (node: Node) => {
  const ethernet = node.ports.filter(port => port.signalType === 'ethernet').length, pitch = ethernetPortPitch(node);
  return isEthernetSwitch(node) ? railNodeWidth(switchRailSize(node), pitch) : ethernet ? railNodeWidth(ethernet, pitch) : NODE_WIDTH;
};
export const portDirection = (node: Node, port: Port): PortFace => isEthernetSwitch(node) ? switchFace(port) : port.signalType === 'ethernet' ? 'south' : port.side === 'input' ? 'west' : port.side === 'output' ? 'east' : port.position === 'right' ? 'east' : 'west';
export const nodeHeight = (node: Node) => {
  const ethernet = node.ports.some(port => port.signalType === 'ethernet'), sidePorts = node.ports.filter(port => port.signalType !== 'ethernet');
  if (isEthernetSwitch(node)) {
    const rails = Number(node.ports.some(port => switchFace(port) === 'north')) + Number(node.ports.some(port => switchFace(port) === 'south'));
    return Math.max(100, ethernetLabelDepth(node) * Math.max(1, rails) + 40);
  }
  if (isSinglePortNode(node) && !ethernet) return GRID * 2;
  return snapToGrid(HEADER_HEIGHT + 18 + Math.max(sideHeight(sidePorts.filter(port => portSide(port) === 'input')), sideHeight(sidePorts.filter(port => portSide(port) === 'output')))) + (ethernet ? ethernetLabelDepth(node) : 0);
};
export const switchNameStripeY = (node: Node): number => {
  const top = node.ports.some(port => switchFace(port) === 'north'), bottom = node.ports.some(port => switchFace(port) === 'south');
  return top && !bottom ? nodeHeight(node) - 40 : bottom && !top ? 0 : nodeHeight(node) / 2 - 20;
};

export const toWorld = (client: XY, svg: SVGSVGElement, viewport: { x: number; y: number; zoom: number }): XY => {
  const r = svg.getBoundingClientRect();
  return { x: (client.x - r.left - viewport.x) / viewport.zoom, y: (client.y - r.top - viewport.y) / viewport.zoom };
};

export const portPosition = (node: Node, portId: string): XY => {
  const port = node.ports.find(p => p.id === portId);
  if (!port) return node.position;
  if (isEthernetSwitch(node)) {
    const face = portDirection(node, port), top = face === 'north', rail = node.ports.filter(item => portDirection(node, item) === face), i = Math.max(0, rail.findIndex(item => item.id === portId));
    const pitch = ethernetPortPitch(node), railWidth = (rail.length - 1) * pitch, start = (nodeWidth(node) - railWidth) / 2;
    return { x: node.position.x + start + i * pitch, y: node.position.y + (top ? 0 : nodeHeight(node)) };
  }
  if (port.signalType === 'ethernet') {
    const rail = node.ports.filter(item => item.signalType === 'ethernet'), i = Math.max(0, rail.findIndex(item => item.id === portId)), pitch = ethernetPortPitch(node);
    return { x: node.position.x + (nodeWidth(node) - pitch * (rail.length - 1)) / 2 + i * pitch, y: node.position.y + nodeHeight(node) };
  }
  const side = portSide(port);
  if (isSinglePortNode(node)) return { x: node.position.x + (side === 'input' ? 0 : nodeWidth(node)), y: node.position.y + GRID };
  const sidePorts = node.ports.filter(p => p.signalType !== 'ethernet' && portSide(p) === side);
  const i = Math.max(0, sidePorts.findIndex(p => p.id === portId));
  return { x: node.position.x + (side === 'input' ? 0 : nodeWidth(node)), y: node.position.y + HEADER_HEIGHT + 18 + i * ROW_HEIGHT + groupGapsBefore(sidePorts, i) * GROUP_GAP };
};

export const shortestNodeY = (node: Node, connections: { node: Node; ownPortId: string; otherPortId: string }[]) => {
  if (!connections.length) return node.position.y;
  const ownY = (portId: string) => portPosition(node, portId).y - node.position.y;
  const candidates = connections.map(connection => portPosition(connection.node, connection.otherPortId).y - ownY(connection.ownPortId)).sort((a, b) => a - b);
  return snapToGrid(candidates[Math.floor(candidates.length / 2)]);
};

export type Rect = { x: number; y: number; w: number; h: number };
export const nodeRect = (node: Node): Rect => ({ x: node.position.x, y: node.position.y, w: nodeWidth(node), h: nodeHeight(node) });
/** Extra clearance on the exterior face occupied by a title bar. */
export const cableObstacleRect = (node: Node, margin = HALF_GRID): Rect => {
  let top = margin, right = margin, bottom = margin, left = margin;
  if (isEthernetSwitch(node)) {
    const stripe = switchNameStripeY(node);
    if (stripe === 0) top += GRID;
    else if (stripe + 40 === nodeHeight(node)) bottom += GRID;
  } else if (isSinglePortNode(node) && !node.ports.some(port => port.signalType === 'ethernet')) {
    if (portSide(node.ports[0]) === 'input') right += GRID;
    else left += GRID;
  } else top += GRID;
  return { x: node.position.x - left, y: node.position.y - top, w: nodeWidth(node) + left + right, h: nodeHeight(node) + top + bottom };
};

export type PortSide = 'input' | 'output' | PortFace;
export type OrthogonalRouteOptions = {
  sourceSide?: PortSide;
  targetSide?: PortSide;
  portMargin?: number;
  gridSize?: number;
  laneOffset?: number;
  backRouteClearance?: number;
  forceBackRoute?: boolean;
  detourY?: number;
  sourceBounds?: Rect;
  targetBounds?: Rect;
  waypoints?: XY[];
};

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const validPoint = (point: XY): XY => ({ x: finite(point.x), y: finite(point.y) });
const samePoint = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const axis = (side: PortSide) => side === 'north' || side === 'south' ? 'V' : 'H';
const leadPoint = (point: XY, side: PortSide, margin: number): XY => {
  if (side === 'north') return { x: point.x, y: point.y - margin };
  if (side === 'south') return { x: point.x, y: point.y + margin };
  return { x: point.x + (side === 'input' || side === 'west' ? -margin : margin), y: point.y };
};
const snapValue = (value: number, gridSize?: number) => gridSize && gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
const addOrthogonal = (points: XY[], target: XY) => {
  const from = points.at(-1)!;
  if (samePoint(from, target)) return;
  if (from.x !== target.x && from.y !== target.y) points.push({ x: target.x, y: from.y });
  points.push(target);
};

/** Removes duplicates/collinear points and repairs diagonal input with deterministic elbows. */
export const simplifyOrthogonalPoints = (input: XY[]): XY[] => {
  const orthogonal: XY[] = [];
  for (const raw of input.map(validPoint)) {
    if (!orthogonal.length) { orthogonal.push(raw); continue; }
    addOrthogonal(orthogonal, raw);
  }
  const simplified: XY[] = [];
  for (const point of orthogonal) {
    if (simplified.length && samePoint(point, simplified.at(-1)!)) continue;
    while (simplified.length >= 2) {
      const a = simplified.at(-2)!, b = simplified.at(-1)!;
      if (!((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) break;
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified;
};

export const isOrthogonalPath = (points: XY[]) => points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)) && points.slice(1).every((point, i) => point.x === points[i].x || point.y === points[i].y);
export const pointsToSvgPath = (input: XY[]) => simplifyOrthogonalPoints(input).map((point, i, points) => i ? (point.x === points[i - 1].x ? `V${point.y}` : `H${point.x}`) : `M${point.x},${point.y}`).join(' ');
export const pointsToHV = pointsToSvgPath;

const routeCost = (sourceLead: XY, targetLead: XY, laneY: number) => Math.abs(sourceLead.y - laneY) + Math.abs(sourceLead.x - targetLead.x) + Math.abs(targetLead.y - laneY);
const pathLength = (points: XY[]) => points.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y), 0);
const bendCount = (points: XY[]) => points.slice(1, -1).filter((point, i) => (points[i].x === point.x) !== (point.x === points[i + 2].x)).length;

/** Deterministic ConnectCAD-style schematic routing. It intentionally does not inspect unrelated devices. */
export const routeOrthogonalConnection = (rawSource: XY, rawTarget: XY, options: OrthogonalRouteOptions = {}): XY[] => {
  const source = validPoint(rawSource), target = validPoint(rawTarget);
  if (samePoint(source, target)) return [source];
  const sourceSide = options.sourceSide ?? 'output', targetSide = options.targetSide ?? 'input';
  const margin = Math.max(0, finite(options.portMargin ?? PORT_MARGIN));
  const laneOffset = finite(options.laneOffset ?? 0);
  const sourceLead = leadPoint(source, sourceSide, margin), targetLead = leadPoint(target, targetSide, margin);
  if (axis(sourceSide) === 'H') sourceLead.x = snapValue(sourceLead.x, options.gridSize);
  else sourceLead.y = snapValue(sourceLead.y, options.gridSize);
  if (axis(targetSide) === 'H') targetLead.x = snapValue(targetLead.x, options.gridSize);
  else targetLead.y = snapValue(targetLead.y, options.gridSize);

  if (options.waypoints?.length) {
    const points = [source, sourceLead];
    for (const waypoint of options.waypoints) addOrthogonal(points, { x: snapValue(finite(waypoint.x), options.gridSize), y: snapValue(finite(waypoint.y), options.gridSize) });
    addOrthogonal(points, targetLead); addOrthogonal(points, target);
    return simplifyOrthogonalPoints(points);
  }

  const horizontalTerminals = axis(sourceSide) === 'H' && axis(targetSide) === 'H';
  if (!options.forceBackRoute && horizontalTerminals && sourceLead.x <= targetLead.x) {
    if (source.y === target.y && laneOffset) return simplifyOrthogonalPoints([source, sourceLead, { x: sourceLead.x, y: source.y + laneOffset }, { x: targetLead.x, y: target.y + laneOffset }, targetLead, target]);
    const midX = snapValue((sourceLead.x + targetLead.x) / 2 + laneOffset, options.gridSize);
    return simplifyOrthogonalPoints([source, sourceLead, { x: midX, y: source.y }, { x: midX, y: target.y }, targetLead, target]);
  }

  let laneY = Number.isFinite(options.detourY) ? options.detourY! : (sourceLead.y + targetLead.y) / 2;
  if (!Number.isFinite(options.detourY) && options.sourceBounds && options.targetBounds) {
    const clearance = Math.max(0, finite(options.backRouteClearance ?? PORT_MARGIN));
    const above = Math.min(options.sourceBounds.y, options.targetBounds.y) - clearance;
    const below = Math.max(options.sourceBounds.y + options.sourceBounds.h, options.targetBounds.y + options.targetBounds.h) + clearance;
    laneY = [above, below].sort((a, b) => routeCost(sourceLead, targetLead, a) - routeCost(sourceLead, targetLead, b) || a - b)[0];
  }
  laneY = snapValue(laneY + laneOffset, options.gridSize);
  const sourceLaneX = snapValue(sourceLead.x + laneOffset, options.gridSize), targetLaneX = snapValue(targetLead.x + laneOffset, options.gridSize);
  return simplifyOrthogonalPoints([source, sourceLead, { x: sourceLaneX, y: sourceLead.y }, { x: sourceLaneX, y: laneY }, { x: targetLaneX, y: laneY }, { x: targetLaneX, y: targetLead.y }, targetLead, target]);
};

export type EdgeRouteInput = { id: string; source: XY; target: XY; sourceNodeId: string; targetNodeId: string; sourceSide?: PortSide; targetSide?: PortSide; waypoints?: XY[] };
export type CableCrossing = { point: XY; withEdgeId: string; segmentIndex: number };
export type RoutedEdge = { id: string; status: 'routed' | 'unroutable'; points: XY[]; path: string; crossings: CableCrossing[] };
export type OccupiedRoute = { edge: EdgeRouteInput; points: XY[] };
export type RouteEdgesOptions = {
  portMargin?: number;
  laneSpacing?: number;
  /** @deprecated routeEdges always uses ROUTING_PITCH. */
  gridSize?: number;
  backRouteClearance?: number;
  stub?: number;
  laneGap?: number;
  obstacleClearance?: number;
  ripUpIterations?: number;
  /** Already-routed cables that participate in occupancy but are not rerouted. */
  occupiedRoutes?: OccupiedRoute[];
};

export type OrthogonalSegment = { a: XY; b: XY };
export type SegmentRelation = 'none' | 'touch' | 'crossing' | 'overlap' | 'too-close';
type CableSegment = OrthogonalSegment & { edge: EdgeRouteInput; index: number };

const orderedInterval = (a: number, b: number): [number, number] => a <= b ? [a, b] : [b, a];
const inClosedInterval = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
const intervalOverlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));
const pointOnSegment = (segment: OrthogonalSegment, point: XY) => segment.a.x === segment.b.x
  ? point.x === segment.a.x && inClosedInterval(point.y, segment.a.y, segment.b.y)
  : point.y === segment.a.y && inClosedInterval(point.x, segment.a.x, segment.b.x);

/** Complete relation for two finite orthogonal segments. */
export const segmentRelation = (first: OrthogonalSegment, second: OrthogonalSegment, spacing = CABLE_LANE_SPACING): SegmentRelation => {
  const aVertical = first.a.x === first.b.x, bVertical = second.a.x === second.b.x;
  if (aVertical !== bVertical) {
    const vertical = aVertical ? first : second, horizontal = aVertical ? second : first;
    const point = { x: vertical.a.x, y: horizontal.a.y };
    if (!pointOnSegment(vertical, point) || !pointOnSegment(horizontal, point)) return 'none';
    const atEndpoint = samePoint(point, vertical.a) || samePoint(point, vertical.b) || samePoint(point, horizontal.a) || samePoint(point, horizontal.b);
    return atEndpoint ? 'touch' : 'crossing';
  }

  const firstTrack = aVertical ? first.a.x : first.a.y, secondTrack = bVertical ? second.a.x : second.a.y;
  const [a1, a2] = orderedInterval(aVertical ? first.a.y : first.a.x, aVertical ? first.b.y : first.b.x);
  const [b1, b2] = orderedInterval(bVertical ? second.a.y : second.a.x, bVertical ? second.b.y : second.b.x);
  const overlap = intervalOverlap(a1, a2, b1, b2);
  if (firstTrack === secondTrack) {
    if (overlap > 0) return 'overlap';
    if (overlap === 0) return 'touch';
    return Math.min(Math.abs(a1 - b2), Math.abs(b1 - a2)) < spacing ? 'too-close' : 'none';
  }
  return overlap > 0 && Math.abs(firstTrack - secondTrack) < spacing ? 'too-close' : 'none';
};

const cableSegments = (points: XY[], edge: EdgeRouteInput): CableSegment[] => points.slice(1).flatMap((b, i) => samePoint(points[i], b) ? [] : [{ a: points[i], b, edge, index: i }]);
const segmentHitsRect = ({ a, b }: OrthogonalSegment, rect: Rect) => a.x === b.x
  ? a.x > rect.x && a.x < rect.x + rect.w && Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.y + rect.h
  : a.y > rect.y && a.y < rect.y + rect.h && Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.x + rect.w;
export const orthogonalPathHitsRect = (points: XY[], rect: Rect) => points.slice(1).some((point, i) => segmentHitsRect({ a: points[i], b: point }, rect));
const pointInsideRect = (point: XY, rect: Rect) => point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.h;
const sharedAttachment = (a: CableSegment, b: CableSegment, margin: number) => {
  const overlap = a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x
    ? Math.max(0, intervalOverlap(a.a.y, a.b.y, b.a.y, b.b.y))
    : a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y ? Math.max(0, intervalOverlap(a.a.x, a.b.x, b.a.x, b.b.x)) : 0;
  return overlap <= margin + ROUTING_PITCH && (samePoint(a.edge.source, b.edge.source) && pointOnSegment(a, a.edge.source) && pointOnSegment(b, b.edge.source)
    || samePoint(a.edge.target, b.edge.target) && pointOnSegment(a, a.edge.target) && pointOnSegment(b, b.edge.target));
};

/** Track-indexed occupancy used by A* and rebuilt during deterministic rip-up passes. */
const OCCUPANCY_BUCKET = ROUTING_PITCH * 8;
const bucketRange = (minimum: number, maximum: number) => {
  const values: number[] = [];
  for (let value = Math.floor(minimum / OCCUPANCY_BUCKET); value <= Math.floor(maximum / OCCUPANCY_BUCKET); value++) values.push(value);
  return values;
};
class TrackOccupancy {
  readonly horizontal = new Map<number, CableSegment[]>();
  readonly vertical = new Map<number, CableSegment[]>();
  readonly segments: CableSegment[] = [];
  readonly xCoordinates: number[] = [];
  readonly yCoordinates: number[] = [];
  private readonly buckets = new Map<string, CableSegment[]>();

  addAll(segments: CableSegment[]) {
    for (const segment of segments) {
      this.segments.push(segment);
      this.xCoordinates.push(segment.a.x, segment.b.x);
      this.yCoordinates.push(segment.a.y, segment.b.y);
      const tracks = segment.a.x === segment.b.x ? this.vertical : this.horizontal;
      const coordinate = segment.a.x === segment.b.x ? segment.a.x : segment.a.y;
      const entries = tracks.get(coordinate) ?? [];
      entries.push(segment);
      tracks.set(coordinate, entries);
      for (const x of bucketRange(Math.min(segment.a.x, segment.b.x), Math.max(segment.a.x, segment.b.x))) for (const y of bucketRange(Math.min(segment.a.y, segment.b.y), Math.max(segment.a.y, segment.b.y))) {
        const key = `${x},${y}`, bucket = this.buckets.get(key) ?? [];
        bucket.push(segment);
        this.buckets.set(key, bucket);
      }
    }
  }

  nearby(segment: OrthogonalSegment, spacing: number): CableSegment[] {
    if (!this.segments.length) return [];
    const found = new Set<CableSegment>();
    for (const x of bucketRange(Math.min(segment.a.x, segment.b.x) - spacing, Math.max(segment.a.x, segment.b.x) + spacing)) for (const y of bucketRange(Math.min(segment.a.y, segment.b.y) - spacing, Math.max(segment.a.y, segment.b.y) + spacing)) {
      for (const occupied of this.buckets.get(`${x},${y}`) ?? []) found.add(occupied);
    }
    return [...found];
  }
}

class RectIndex {
  private readonly buckets = new Map<string, Rect[]>();
  constructor(rects: Rect[]) {
    for (const rect of rects) for (const x of bucketRange(rect.x, rect.x + rect.w)) for (const y of bucketRange(rect.y, rect.y + rect.h)) {
      const key = `${x},${y}`, bucket = this.buckets.get(key) ?? [];
      bucket.push(rect);
      this.buckets.set(key, bucket);
    }
  }
  nearby(segment: OrthogonalSegment) {
    if (!this.buckets.size) return [];
    const found = new Set<Rect>();
    for (const x of bucketRange(Math.min(segment.a.x, segment.b.x), Math.max(segment.a.x, segment.b.x))) for (const y of bucketRange(Math.min(segment.a.y, segment.b.y), Math.max(segment.a.y, segment.b.y))) {
      for (const rect of this.buckets.get(`${x},${y}`) ?? []) found.add(rect);
    }
    return [...found];
  }
  hits(segment: OrthogonalSegment) {
    return this.nearby(segment).some(rect => segmentHitsRect(segment, rect));
  }
}

type Direction = 'H' | 'V' | 'N';
type SearchState = {
  x: number;
  y: number;
  direction: Direction;
  length: number;
  bends: number;
  crossings: number;
  estimate: number;
  /** Forces a route to clear a crossed cable before it may turn. */
  crossingClearance: number;
  previous?: SearchState;
};
class MinHeap {
  private values: SearchState[] = [];
  constructor(private readonly compare: (a: SearchState, b: SearchState) => number) {}
  get size() { return this.values.length; }
  push(value: SearchState) {
    const values = this.values;
    values.push(value);
    for (let i = values.length - 1; i > 0;) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(values[parent], values[i]) <= 0) break;
      [values[parent], values[i]] = [values[i], values[parent]];
      i = parent;
    }
  }
  pop(): SearchState {
    const first = this.values[0], last = this.values.pop()!;
    if (this.values.length) {
      this.values[0] = last;
      for (let i = 0;;) {
        const left = i * 2 + 1, right = left + 1;
        let smallest = i;
        if (left < this.values.length && this.compare(this.values[left], this.values[smallest]) < 0) smallest = left;
        if (right < this.values.length && this.compare(this.values[right], this.values[smallest]) < 0) smallest = right;
        if (smallest === i) break;
        [this.values[i], this.values[smallest]] = [this.values[smallest], this.values[i]];
        i = smallest;
      }
    }
    return first;
  }
}

const outwardLead = (point: XY, side: PortSide, margin: number, obstacle?: Rect): XY => {
  if (side === 'north') return { x: point.x, y: Math.floor(Math.min(point.y - margin, obstacle?.y ?? Infinity) / ROUTING_PITCH) * ROUTING_PITCH };
  if (side === 'south') return { x: point.x, y: Math.ceil(Math.max(point.y + margin, obstacle ? obstacle.y + obstacle.h : -Infinity) / ROUTING_PITCH) * ROUTING_PITCH };
  if (side === 'input' || side === 'west') return { x: Math.floor(Math.min(point.x - margin, obstacle?.x ?? Infinity) / ROUTING_PITCH) * ROUTING_PITCH, y: point.y };
  return { x: Math.ceil(Math.max(point.x + margin, obstacle ? obstacle.x + obstacle.w : -Infinity) / ROUTING_PITCH) * ROUTING_PITCH, y: point.y };
};
const crossingPoint = (a: OrthogonalSegment, b: OrthogonalSegment): XY => a.a.x === a.b.x ? { x: a.a.x, y: b.a.y } : { x: b.a.x, y: a.a.y };
const routingRelation = (candidate: CableSegment, occupied: CableSegment, spacing: number): SegmentRelation => {
  const relation = segmentRelation(candidate, occupied, spacing);
  if (relation !== 'touch' || (candidate.a.x === candidate.b.x) === (occupied.a.x === occupied.b.x)) return relation;
  const point = crossingPoint(candidate, occupied);
  return !samePoint(point, occupied.a) && !samePoint(point, occupied.b) ? 'crossing' : relation;
};
const distanceToSegment = (point: XY, segment: OrthogonalSegment) => Math.min(
  Math.abs(point.x - segment.a.x) + Math.abs(point.y - segment.a.y),
  Math.abs(point.x - segment.b.x) + Math.abs(point.y - segment.b.y),
);
const nearSharedTerminal = (candidate: CableSegment, occupied: CableSegment, margin: number, extra = ROUTING_PITCH * 2) => {
  const sourceDistance = distanceToSegment(candidate.edge.source, candidate), targetDistance = distanceToSegment(candidate.edge.target, candidate);
  const nearEscape = (distance: number) => distance === 0 || distance >= margin && distance <= margin + extra;
  return samePoint(candidate.edge.source, occupied.edge.source) && nearEscape(sourceDistance)
    || samePoint(candidate.edge.target, occupied.edge.target) && nearEscape(targetDistance);
};
const relationBlocked = (relation: SegmentRelation, candidate: CableSegment, occupied: CableSegment, margin: number, allowCrossings: boolean) => {
  if (relation === 'none') return false;
  if (relation === 'crossing') return !allowCrossings;
  if (relation === 'touch') return candidate.edge.id !== occupied.edge.id && !nearSharedTerminal(candidate, occupied, margin, ROUTING_PITCH);
  if (relation === 'too-close' && nearSharedTerminal(candidate, occupied, margin)) {
    const candidateVertical = candidate.a.x === candidate.b.x, occupiedVertical = occupied.a.x === occupied.b.x;
    const sameTrack = candidateVertical === occupiedVertical && (candidateVertical ? candidate.a.x === occupied.a.x : candidate.a.y === occupied.a.y);
    if (sameTrack) return false; // permits fan-out immediately after a shared escape, never parallel lane crowding
  }
  if (sharedAttachment(candidate, occupied, margin)) return false;
  return true;
};

const coordinates = (minimum: number, maximum: number, extras: number[]) => {
  const values = new Set(extras.filter(value => value >= minimum && value <= maximum));
  for (let value = Math.floor(minimum / ROUTING_PITCH) * ROUTING_PITCH; value <= maximum; value += ROUTING_PITCH) values.add(value);
  return [...values].sort((a, b) => a - b);
};

const findGridPath = (
  start: XY,
  target: XY,
  edge: EdgeRouteInput,
  scene: RoutingScene,
  occupancy: TrackOccupancy,
  localSegments: CableSegment[],
  spacing: number,
  margin: number,
  allowCrossings: boolean,
): XY[] | undefined => {
  if (samePoint(start, target)) return [start];
  const occupiedCoordinateCount = occupancy.xCoordinates.length + occupancy.yCoordinates.length;
  const obstacleCoordinateCount = scene.obstacleXCoordinates.length + scene.obstacleYCoordinates.length;
  const allX = [start.x, target.x, ...scene.obstacleXCoordinates, ...occupancy.xCoordinates];
  const allY = [start.y, target.y, ...scene.obstacleYCoordinates, ...occupancy.yCoordinates];
  const basePadding = Math.max(PORT_MARGIN * 2, ROUTING_PITCH * (8 + Math.ceil(Math.sqrt(occupiedCoordinateCount + obstacleCoordinateCount))));

  // A single generous search envelope is enough for the preferred no-crossing
  // pass. Only the crossing fallback explores wider envelopes; exhausting all
  // three twice was the main cost of congested and impossible routes.
  const expansions = allowCrossings ? 3 : 1;
  for (let expansion = 1; expansion <= expansions; expansion++) {
    const padding = basePadding * expansion;
    const minX = Math.min(...allX) - padding, maxX = Math.max(...allX) + padding;
    const minY = Math.min(...allY) - padding, maxY = Math.max(...allY) + padding;
    const xs = coordinates(minX, maxX, [start.x, target.x]), ys = coordinates(minY, maxY, [start.y, target.y]);
    const xIndex = new Map(xs.map((value, i) => [value, i])), yIndex = new Map(ys.map((value, i) => [value, i]));
    const startX = xIndex.get(start.x)!, startY = yIndex.get(start.y)!;
    const targetX = xIndex.get(target.x)!, targetY = yIndex.get(target.y)!;
    const insideObstacle = (point: XY) => scene.obstacleIndex.nearby({ a: point, b: point }).some(rect => pointInsideRect(point, rect));
    if (insideObstacle(start) || insideObstacle(target)) return undefined;
    const endpointBlocked = (point: XY) => occupancy.nearby({ a: point, b: point }, spacing).some(occupied => pointOnSegment(occupied, point)
      && !samePoint(edge.source, occupied.edge.source) && !samePoint(edge.target, occupied.edge.target));
    // A waypoint or lead sitting on another cable can never be reached with the
    // required post-crossing clearance, so avoid searching the whole grid.
    if (endpointBlocked(start) || endpointBlocked(target)) return undefined;

    // On equal f-cost, prefer the state furthest along the route. Using smaller g here
    // floods the entire Manhattan rectangle before reaching the target.
    const heap = new MinHeap((a, b) => (allowCrossings ? a.crossings - b.crossings : 0) || a.estimate - b.estimate || a.bends - b.bends || b.length - a.length || a.y - b.y || a.x - b.x || a.direction.localeCompare(b.direction));
    const initial: SearchState = { x: startX, y: startY, direction: 'N', length: 0, bends: 0, crossings: 0, estimate: Math.abs(start.x - target.x) + Math.abs(start.y - target.y), crossingClearance: 0 };
    heap.push(initial);
    const stateKey = (x: number, y: number, direction: Direction, crossingClearance: number) => `${x},${y},${direction},${crossingClearance}`;
    const best = new Map<string, { length: number; bends: number; crossings: number }>([[stateKey(startX, startY, 'N', 0), { length: 0, bends: 0, crossings: 0 }]]);

    while (heap.size) {
      const current = heap.pop(), currentPoint = { x: xs[current.x], y: ys[current.y] };
      const known = best.get(stateKey(current.x, current.y, current.direction, current.crossingClearance));
      if (!known || known.length !== current.length || known.bends !== current.bends || known.crossings !== current.crossings) continue;
      if (current.x === targetX && current.y === targetY && current.crossingClearance === 0) {
        const path: XY[] = [];
        for (let item: SearchState | undefined = current; item; item = item.previous) path.push({ x: xs[item.x], y: ys[item.y] });
        return simplifyOrthogonalPoints(path.reverse());
      }
      const neighbours: [number, number, Direction][] = [[current.x + 1, current.y, 'H'], [current.x, current.y + 1, 'V'], [current.x - 1, current.y, 'H'], [current.x, current.y - 1, 'V']];
      for (const [nextX, nextY, direction] of neighbours) {
        if (nextX < 0 || nextX >= xs.length || nextY < 0 || nextY >= ys.length) continue;
        // A crossing must remain a straight run until it has cleared the other
        // cable. Without this constraint A* can turn on the intersection and
        // create a visually merged T-junction.
        if (current.crossingClearance > 0 && direction !== current.direction) continue;
        const nextPoint = { x: xs[nextX], y: ys[nextY] }, rawSegment = { a: currentPoint, b: nextPoint };
        if (scene.obstacleIndex.hits(rawSegment)) continue;
        const candidate: CableSegment = { ...rawSegment, edge, index: -1 };
        let blocked = false, addedCrossings = 0, crossingAtEnd = false;
        const checkBlocker = (occupied: CableSegment) => {
          const relation = routingRelation(candidate, occupied, spacing);
          const point = relation === 'crossing' ? crossingPoint(candidate, occupied) : undefined;
          const leavingCrossing = current.crossingClearance > 0 && point && samePoint(point, candidate.a) && direction === current.direction;
          if (!leavingCrossing && relationBlocked(relation, candidate, occupied, margin, allowCrossings)) blocked = true;
          else if (relation === 'crossing' && !leavingCrossing) {
            addedCrossings++;
            if (point && samePoint(point, candidate.b)) crossingAtEnd = true;
          }
        };
        for (const occupied of occupancy.nearby(candidate, spacing)) {
          if (occupied.edge.id !== edge.id) checkBlocker(occupied);
          if (blocked) break;
        }
        if (!blocked) for (const occupied of localSegments) { checkBlocker(occupied); if (blocked) break; }
        if (blocked) continue;
        const step = Math.abs(nextPoint.x - currentPoint.x) + Math.abs(nextPoint.y - currentPoint.y);
        const nextLength = current.length + step, nextBends = current.bends + Number(current.direction !== 'N' && current.direction !== direction);
        const nextCrossings = current.crossings + addedCrossings;
        const crossingClearance = crossingAtEnd ? Math.max(spacing, current.crossingClearance - step) : Math.max(0, current.crossingClearance - step);
        const key = stateKey(nextX, nextY, direction, crossingClearance), previousBest = best.get(key);
        if (previousBest && (previousBest.crossings < nextCrossings || previousBest.crossings === nextCrossings && (previousBest.length < nextLength || previousBest.length === nextLength && previousBest.bends <= nextBends))) continue;
        best.set(key, { length: nextLength, bends: nextBends, crossings: nextCrossings });
        heap.push({ x: nextX, y: nextY, direction, length: nextLength, bends: nextBends, crossings: nextCrossings, estimate: nextLength + Math.abs(nextPoint.x - target.x) + Math.abs(nextPoint.y - target.y), crossingClearance, previous: current });
      }
    }
  }
  return undefined;
};

export type RoutingScene = {
  nodes: Node[];
  clearance: number;
  obstacles: { nodeId: string; rect: Rect }[];
  obstacleRects: Rect[];
  obstacleXCoordinates: number[];
  obstacleYCoordinates: number[];
  obstacleByNodeId: Map<string, Rect>;
  obstacleNodeByRect: Map<Rect, string>;
  obstacleIndex: RectIndex;
};

export const createRoutingScene = (nodes: Node[], obstacleClearance = HALF_GRID): RoutingScene => {
  const clearance = Math.max(HALF_GRID, finite(obstacleClearance));
  const obstacles = nodes.map(node => ({ nodeId: node.id, rect: cableObstacleRect(node, clearance) }));
  const obstacleRects = obstacles.map(obstacle => obstacle.rect);
  return {
    nodes,
    clearance,
    obstacles,
    obstacleRects,
    obstacleXCoordinates: obstacleRects.flatMap(rect => [rect.x, rect.x + rect.w]),
    obstacleYCoordinates: obstacleRects.flatMap(rect => [rect.y, rect.y + rect.h]),
    obstacleByNodeId: new Map(obstacles.map(obstacle => [obstacle.nodeId, obstacle.rect])),
    obstacleNodeByRect: new Map(obstacles.map(obstacle => [obstacle.rect, obstacle.nodeId])),
    obstacleIndex: new RectIndex(obstacleRects),
  };
};

type RouteContext = RoutingScene & { spacing: number; margin: number };
const routeOneEdge = (edge: EdgeRouteInput, occupancy: TrackOccupancy, context: RouteContext): RoutedEdge => {
  const source = validPoint(edge.source), target = validPoint(edge.target);
  const sourceObstacle = context.obstacleByNodeId.get(edge.sourceNodeId);
  const targetObstacle = context.obstacleByNodeId.get(edge.targetNodeId);
  const uniqueLeads = (point: XY, side: PortSide, obstacle?: Rect) => {
    const desired = outwardLead(point, side, context.margin, obstacle);
    const minimum = outwardLead(point, side, 0, obstacle);
    return samePoint(desired, minimum) ? [desired] : [desired, minimum];
  };
  const sourceLeads = uniqueLeads(source, edge.sourceSide ?? 'output', sourceObstacle);
  const targetLeads = uniqueLeads(target, edge.targetSide ?? 'input', targetObstacle);

  // Prefer the full visual lead, but shorten it to the first safe routing lane
  // when a nearby component or cable blocks that straight escape.
  for (const sourceLead of sourceLeads) for (const targetLead of targetLeads) {
    const sourceEscape: CableSegment = { a: source, b: sourceLead, edge, index: 0 };
    const targetEscape: CableSegment = { a: targetLead, b: target, edge, index: -1 };
    const labelledEscapes = [
      { segment: sourceEscape, ownNodeId: edge.sourceNodeId },
      { segment: targetEscape, ownNodeId: edge.targetNodeId },
    ].filter(item => !samePoint(item.segment.a, item.segment.b));
    const escapes = labelledEscapes.map(item => item.segment);
    const escapeHitsComponent = labelledEscapes.some(({ segment, ownNodeId }) => context.obstacleIndex.nearby(segment)
      .some(rect => context.obstacleNodeByRect.get(rect) !== ownNodeId && segmentHitsRect(segment, rect)));
    const escapeHitsCable = escapes.some(segment => occupancy.nearby(segment, context.spacing).some(occupied => occupied.edge.id !== edge.id && relationBlocked(segmentRelation(segment, occupied, context.spacing), segment, occupied, context.margin, true)));
    if (escapeHitsComponent || escapeHitsCable) continue;

    const anchors = [sourceLead, ...(edge.waypoints ?? []).map(validPoint), targetLead];
    const middle: XY[] = [sourceLead];
    const localSegments = [...escapes];
    let failed = false;
    for (let i = 1; i < anchors.length; i++) {
      let leg = findGridPath(anchors[i - 1], anchors[i], edge, context, occupancy, localSegments, context.spacing, context.margin, false);
      if (!leg) leg = findGridPath(anchors[i - 1], anchors[i], edge, context, occupancy, localSegments, context.spacing, context.margin, true);
      if (!leg) { failed = true; break; }
      middle.push(...leg.slice(1));
      localSegments.push(...cableSegments(leg, edge));
    }
    if (failed) continue;
    const joined = [source, ...middle, target].filter((point, i, all) => i === 0 || !samePoint(point, all[i - 1]));
    const points = edge.waypoints?.length ? joined : simplifyOrthogonalPoints(joined);
    if (!isOrthogonalPath(points)) continue;
    const finalSegments = cableSegments(points, edge);
    const lastSegment = finalSegments.at(-1);
    const hitsComponent = finalSegments.some(segment => context.obstacleIndex.nearby(segment).some(rect => {
      const nodeId = context.obstacleNodeByRect.get(rect);
      const endpointEscape = nodeId === edge.sourceNodeId && segment.index === 0
        || nodeId === edge.targetNodeId && segment === lastSegment;
      return !endpointEscape && segmentHitsRect(segment, rect);
    }));
    const hitsCable = finalSegments.some(segment => occupancy.nearby(segment, context.spacing).some(occupied => occupied.edge.id !== edge.id
      && relationBlocked(segmentRelation(segment, occupied, context.spacing), segment, occupied, context.margin, true)));
    // Validate the simplified geometry as rendered, not only the individual A*
    // steps. This catches overlaps and bend contacts introduced at segment joins.
    if (hitsComponent || hitsCable) continue;
    return { id: edge.id, status: 'routed', points, path: pointsToSvgPath(points), crossings: [] };
  }
  return { id: edge.id, status: 'unroutable', points: [], path: '', crossings: [] };
};

const addCrossingReports = (routes: Map<string, RoutedEdge>, byEdge: Map<string, EdgeRouteInput>) => {
  const routed = [...routes.values()].filter(route => route.status === 'routed').sort((a, b) => a.id.localeCompare(b.id));
  const routeById = new Map(routed.map(route => [route.id, route]));
  const occupancy = new TrackOccupancy(), reported = new Set<string>();
  for (const route of routed) {
    const segments = cableSegments(route.points, byEdge.get(route.id)!);
    for (const segment of segments) for (const occupied of occupancy.nearby(segment, 0)) {
      if (segmentRelation(segment, occupied, 0) !== 'crossing') continue;
      const point = crossingPoint(segment, occupied);
      const key = `${occupied.edge.id}:${occupied.index}:${route.id}:${segment.index}:${point.x},${point.y}`;
      if (reported.has(key)) continue;
      reported.add(key);
      route.crossings.push({ point, withEdgeId: occupied.edge.id, segmentIndex: segment.index });
      routeById.get(occupied.edge.id)?.crossings.push({ point, withEdgeId: route.id, segmentIndex: occupied.index });
    }
    occupancy.addAll(segments);
  }
  for (const route of routed) route.crossings.sort((a, b) => a.segmentIndex - b.segmentIndex || a.point.x - b.point.x || a.point.y - b.point.y || a.withEdgeId.localeCompare(b.withEdgeId));
};

const unconstrainedLength = (edge: EdgeRouteInput, context: RouteContext) => {
  const source = validPoint(edge.source), target = validPoint(edge.target);
  const sourceLead = outwardLead(source, edge.sourceSide ?? 'output', context.margin, context.obstacleByNodeId.get(edge.sourceNodeId));
  const targetLead = outwardLead(target, edge.targetSide ?? 'input', context.margin, context.obstacleByNodeId.get(edge.targetNodeId));
  const anchors = [source, sourceLead, ...(edge.waypoints ?? []).map(validPoint), targetLead, target];
  return anchors.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - anchors[i].x) + Math.abs(point.y - anchors[i].y), 0);
};

/** Routes against a reusable obstacle scene. */
export const routeEdgesInScene = (edges: EdgeRouteInput[], scene: RoutingScene, options: RouteEdgesOptions = {}): RoutedEdge[] => {
  if (!edges.length) return [];
  const spacing = Math.max(0, finite(options.laneSpacing ?? options.laneGap ?? CABLE_LANE_SPACING));
  const margin = Math.max(0, finite(options.portMargin ?? options.stub ?? PORT_MARGIN));
  const obstacles = scene.obstacles;
  const context: RouteContext = { ...scene, spacing, margin };
  const sorted = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  const byEdge = new Map(sorted.map(edge => [edge.id, edge]));
  // One rip-up pass reverses the original priority, so the first cable cannot keep
  // permanent ownership of a bottleneck. More rotations remain opt-in for callers
  // routing unusually congested diagrams.
  const iterations = Math.max(1, Math.min(sorted.length, Math.floor(finite(options.ripUpIterations ?? Math.min(sorted.length, 2)))));
  const orders = [sorted];
  if (iterations > 1) orders.push([...sorted].reverse());
  for (let offset = 1; orders.length < iterations; offset++) orders.push([...sorted.slice(offset), ...sorted.slice(0, offset)]);
  let bestRoutes: Map<string, RoutedEdge> | undefined, bestScore: [number, number, number, number, string] | undefined;

  const terminalReservations = sorted.flatMap(edge => {
    const source = validPoint(edge.source), target = validPoint(edge.target);
    const sourceObstacle = scene.obstacleByNodeId.get(edge.sourceNodeId);
    const targetObstacle = scene.obstacleByNodeId.get(edge.targetNodeId);
    const sourceLead = outwardLead(source, edge.sourceSide ?? 'output', margin, sourceObstacle);
    const targetLead = outwardLead(target, edge.targetSide ?? 'input', margin, targetObstacle);
    return [
      { a: source, b: sourceLead, edge, index: 0 },
      { a: targetLead, b: target, edge, index: -1 },
    ].filter(segment => !samePoint(segment.a, segment.b));
  });

  for (let pass = 0; pass < orders.length; pass++) {
    const order = orders[pass];
    const occupancy = new TrackOccupancy(), routes = new Map<string, RoutedEdge>();
    for (const fixed of options.occupiedRoutes ?? []) {
      if (fixed.points.length > 1 && isOrthogonalPath(fixed.points)) occupancy.addAll(cableSegments(fixed.points, fixed.edge));
    }
    // Reserve every connector's exit corridor up front so an early cable cannot
    // claim the bend point needed by a cable routed later in the pass.
    occupancy.addAll(terminalReservations);
    for (const edge of order) {
      const route = routeOneEdge(edge, occupancy, context);
      routes.set(edge.id, route);
      if (route.status === 'routed') occupancy.addAll(cableSegments(route.points, edge));
    }
    addCrossingReports(routes, byEdge);
    const values = [...routes.values()];
    const score: [number, number, number, number, string] = [
      values.filter(route => route.status === 'unroutable').length,
      values.reduce((sum, route) => sum + route.crossings.length, 0),
      values.reduce((sum, route) => sum + pathLength(route.points), 0),
      values.reduce((sum, route) => sum + bendCount(route.points), 0),
      sorted.map(edge => routes.get(edge.id)?.path ?? '').join('|'),
    ];
    const better = !bestScore || score[0] < bestScore[0] || score[0] === bestScore[0] && (score[1] < bestScore[1]
      || score[1] === bestScore[1] && (score[2] < bestScore[2] || score[2] === bestScore[2] && (score[3] < bestScore[3] || score[3] === bestScore[3] && score[4] < bestScore[4])));
    if (better) { bestScore = score; bestRoutes = routes; }
    // If every cable already attained its absolute Manhattan lower bound, no
    // ordering can improve it and a rip-up pass would only duplicate all work.
    if (pass === 0 && values.every(route => route.status === 'routed' && !route.crossings.length && pathLength(route.points) === unconstrainedLength(byEdge.get(route.id)!, context))) break;
  }
  return edges.map(edge => bestRoutes!.get(edge.id)!);
};

/** Deterministic orthogonal grid A* with track occupancy and rip-up/reroute passes. */
export const routeEdges = (edges: EdgeRouteInput[], nodes: Node[], options: RouteEdgesOptions = {}): RoutedEdge[] => {
  const scene = createRoutingScene(nodes, options.obstacleClearance);
  return routeEdgesInScene(edges, scene, options);
};

export const cablePoints = (a: XY, b: XY, nodes: Node[] = [], offset = 0, from: PortSide = 'output', to: PortSide = 'input'): XY[] => {
  const sourceNode = nodes.find(node => {
    const rect = nodeRect(node);
    return (a.x === rect.x || a.x === rect.x + rect.w) && a.y >= rect.y && a.y <= rect.y + rect.h || (a.y === rect.y || a.y === rect.y + rect.h) && a.x >= rect.x && a.x <= rect.x + rect.w;
  });
  const targetNode = nodes.find(node => {
    const rect = nodeRect(node);
    return (b.x === rect.x || b.x === rect.x + rect.w) && b.y >= rect.y && b.y <= rect.y + rect.h || (b.y === rect.y || b.y === rect.y + rect.h) && b.x >= rect.x && b.x <= rect.x + rect.w;
  });
  return routeOrthogonalConnection(a, b, { sourceSide: from, targetSide: to, portMargin: PORT_MARGIN + offset, sourceBounds: sourceNode ? nodeRect(sourceNode) : undefined, targetBounds: targetNode ? nodeRect(targetNode) : undefined });
};
export const straightPath = (a: XY, b: XY, nodes: Node[] = [], offset = 0, from: PortSide = 'output', to: PortSide = 'input'): string => pointsToSvgPath(cablePoints(a, b, nodes, offset, from, to));
