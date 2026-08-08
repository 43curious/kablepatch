import type { Node, XY } from '../../types/graph';
import {
  CABLE_LANE_SPACING, HALF_GRID, cableObstacleRect, isOrthogonalPath, pointsToSvgPath, segmentRelation,
} from './geometry';
import type { EdgeRouteInput, OrthogonalSegment, PortSide, RoutedEdge } from './geometry';

export type RoutingViolation = { code: string; message: string; edgeId?: string; withEdgeId?: string };
export type RoutingValidationOptions = { laneSpacing?: number; obstacleClearance?: number; portMargin?: number };
type IndexedSegment = OrthogonalSegment & { edgeId: string; index: number; last: boolean };

const samePoint = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const inRange = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
const pointOnSegment = (point: XY, segment: OrthogonalSegment) => segment.a.x === segment.b.x
  ? point.x === segment.a.x && inRange(point.y, segment.a.y, segment.b.y)
  : point.y === segment.a.y && inRange(point.x, segment.a.x, segment.b.x);
const segmentsOf = (route: RoutedEdge): IndexedSegment[] => route.points.slice(1).map((b, index) => ({ a: route.points[index], b, edgeId: route.id, index, last: index === route.points.length - 2 }));
const strictRectHit = (segment: OrthogonalSegment, rect: { x: number; y: number; w: number; h: number }) => segment.a.x === segment.b.x
  ? segment.a.x > rect.x && segment.a.x < rect.x + rect.w && Math.max(segment.a.y, segment.b.y) > rect.y && Math.min(segment.a.y, segment.b.y) < rect.y + rect.h
  : segment.a.y > rect.y && segment.a.y < rect.y + rect.h && Math.max(segment.a.x, segment.b.x) > rect.x && Math.min(segment.a.x, segment.b.x) < rect.x + rect.w;
const crossingPoint = (a: OrthogonalSegment, b: OrthogonalSegment): XY => a.a.x === a.b.x ? { x: a.a.x, y: b.a.y } : { x: b.a.x, y: a.a.y };
const atEndpoint = (point: XY, segment: OrthogonalSegment) => samePoint(point, segment.a) || samePoint(point, segment.b);
const outward = (from: XY, to: XY, side: PortSide | undefined) => {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (side === 'north') return dx === 0 && dy < 0;
  if (side === 'south') return dx === 0 && dy > 0;
  if (side === 'input' || side === 'west') return dy === 0 && dx < 0;
  return dy === 0 && dx > 0;
};
const approaches = (from: XY, target: XY, side: PortSide | undefined) => outward(target, from, side);

const sharesTerminal = (a: IndexedSegment, b: IndexedSegment, edges: Map<string, EdgeRouteInput>) => {
  const first = edges.get(a.edgeId)!, second = edges.get(b.edgeId)!;
  return samePoint(first.source, second.source) && pointOnSegment(first.source, a) && pointOnSegment(second.source, b)
    || samePoint(first.target, second.target) && pointOnSegment(first.target, a) && pointOnSegment(second.target, b);
};

export const validateRoutingResult = (
  edges: EdgeRouteInput[],
  nodes: Node[],
  routes: RoutedEdge[],
  options: RoutingValidationOptions = {},
): RoutingViolation[] => {
  const violations: RoutingViolation[] = [];
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const sourceCounts = new Map<string, number>(), targetCounts = new Map<string, number>();
  for (const edge of edges) {
    const sourceKey = `${edge.source.x},${edge.source.y}`, targetKey = `${edge.target.x},${edge.target.y}`;
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    targetCounts.set(targetKey, (targetCounts.get(targetKey) ?? 0) + 1);
  }
  const routeGroups = new Map<string, RoutedEdge[]>();
  for (const route of routes) routeGroups.set(route.id, [...routeGroups.get(route.id) ?? [], route]);
  for (const route of routes) if (!edgeById.has(route.id)) violations.push({ code: 'unknown-route', edgeId: route.id, message: 'Route has no matching edge input' });
  for (const edge of edges) {
    const matches = routeGroups.get(edge.id) ?? [];
    if (matches.length !== 1) {
      violations.push({ code: matches.length ? 'duplicate-route' : 'missing-route', edgeId: edge.id, message: `Expected one route, received ${matches.length}` });
      continue;
    }
    const route = matches[0];
    if (route.status === 'unroutable') {
      if (route.points.length || route.path || route.crossings.length) violations.push({ code: 'unroutable-shape', edgeId: edge.id, message: 'Unroutable results must have empty geometry' });
      continue;
    }
    if (route.points.length < 2 || !isOrthogonalPath(route.points)) violations.push({ code: 'invalid-path', edgeId: edge.id, message: 'Routed geometry must be finite and orthogonal' });
    if (route.points.some((point, index) => index > 0 && samePoint(point, route.points[index - 1]))) violations.push({ code: 'duplicate-point', edgeId: edge.id, message: 'Route contains adjacent duplicate points' });
    if (!samePoint(route.points[0] ?? edge.source, edge.source) || !samePoint(route.points.at(-1) ?? edge.target, edge.target)) violations.push({ code: 'endpoint', edgeId: edge.id, message: 'Route endpoints do not match edge endpoints' });
    const sharedSource = (sourceCounts.get(`${edge.source.x},${edge.source.y}`) ?? 0) > 1;
    const sharedTarget = (targetCounts.get(`${edge.target.x},${edge.target.y}`) ?? 0) > 1;
    if (!sharedSource && route.points.length > 1 && !outward(route.points[0], route.points[1], edge.sourceSide ?? 'output')) violations.push({ code: 'source-direction', edgeId: edge.id, message: 'Route leaves the source on the wrong face' });
    if (!sharedTarget && route.points.length > 1 && !approaches(route.points.at(-2)!, route.points.at(-1)!, edge.targetSide ?? 'input')) violations.push({ code: 'target-direction', edgeId: edge.id, message: 'Route approaches the target on the wrong face' });
    if (route.path !== pointsToSvgPath(route.points)) violations.push({ code: 'svg-path', edgeId: edge.id, message: 'SVG path does not match route points' });
    let waypointIndex = -1;
    for (const waypoint of edge.waypoints ?? []) {
      waypointIndex = route.points.findIndex((point, index) => index > waypointIndex && samePoint(point, waypoint));
      if (waypointIndex < 0) { violations.push({ code: 'waypoint', edgeId: edge.id, message: 'Manual waypoints are not present in order' }); break; }
    }
  }

  const clearance = Math.max(HALF_GRID, options.obstacleClearance ?? HALF_GRID);
  const obstacles = nodes.map(node => ({ nodeId: node.id, rect: cableObstacleRect(node, clearance) }));
  const routed = routes.filter(route => route.status === 'routed' && edgeById.has(route.id));
  for (const route of routed) {
    const edge = edgeById.get(route.id)!;
    for (const segment of segmentsOf(route)) for (const obstacle of obstacles) {
      const ownEscape = obstacle.nodeId === edge.sourceNodeId && segment.index === 0
        || obstacle.nodeId === edge.targetNodeId && segment.last;
      if (!ownEscape && strictRectHit(segment, obstacle.rect)) violations.push({ code: 'component-collision', edgeId: edge.id, message: `Route intersects component ${obstacle.nodeId}` });
    }
  }

  const spacing = options.laneSpacing ?? CABLE_LANE_SPACING;
  const allSegments = routed.flatMap(segmentsOf);
  const expectedCrossings = new Set<string>();
  for (let i = 0; i < allSegments.length; i++) for (let j = i + 1; j < allSegments.length; j++) {
    const a = allSegments[i], b = allSegments[j];
    if (a.edgeId === b.edgeId) {
      const ownEdge = edgeById.get(a.edgeId)!;
      if (samePoint(ownEdge.source, ownEdge.target) || Math.abs(a.index - b.index) <= 1) continue;
      const relation = segmentRelation(a, b, spacing);
      if (relation !== 'none') violations.push({ code: 'self-collision', edgeId: a.edgeId, message: `Non-adjacent route segments ${a.index} and ${b.index} intersect` });
      continue;
    }
    const relation = segmentRelation(a, b, spacing);
    const firstEdge = edgeById.get(a.edgeId)!, secondEdge = edgeById.get(b.edgeId)!;
    const edgesShareEndpoint = samePoint(firstEdge.source, secondEdge.source) || samePoint(firstEdge.target, secondEdge.target);
    if ((relation === 'overlap' || relation === 'too-close') && !sharesTerminal(a, b, edgeById)) {
      violations.push({ code: relation === 'overlap' ? 'cable-overlap' : 'lane-spacing', edgeId: a.edgeId, withEdgeId: b.edgeId, message: 'Parallel cable runs violate lane separation' });
    }
    const perpendicular = (a.a.x === a.b.x) !== (b.a.x === b.b.x);
    if (!perpendicular) continue;
    const point = crossingPoint(a, b);
    if (!pointOnSegment(point, a) || !pointOnSegment(point, b)) continue;
    if ((atEndpoint(point, a) || atEndpoint(point, b)) && !edgesShareEndpoint) violations.push({ code: 'turn-on-crossing', edgeId: a.edgeId, withEdgeId: b.edgeId, message: 'A cable turns or terminates on another cable' });
    if (!atEndpoint(point, a) && !atEndpoint(point, b)) {
      expectedCrossings.add(`${a.edgeId}:${a.index}:${b.edgeId}:${b.index}:${point.x},${point.y}`);
      expectedCrossings.add(`${b.edgeId}:${b.index}:${a.edgeId}:${a.index}:${point.x},${point.y}`);
    }
  }
  const reportedCrossings = new Set(routed.flatMap(route => route.crossings.map(crossing => `${route.id}:${crossing.segmentIndex}:${crossing.withEdgeId}:${segmentsOf(routeGroups.get(crossing.withEdgeId)?.[0] ?? route).find(segment => pointOnSegment(crossing.point, segment))?.index ?? -1}:${crossing.point.x},${crossing.point.y}`)));
  for (const expected of expectedCrossings) if (!reportedCrossings.has(expected)) violations.push({ code: 'missing-crossing-report', message: `Missing crossing report ${expected}` });
  for (const reported of reportedCrossings) if (!expectedCrossings.has(reported)) violations.push({ code: 'invalid-crossing-report', message: `Invalid crossing report ${reported}` });

  return violations;
};

export const formatRoutingViolations = (violations: RoutingViolation[]) => violations.map(violation => `${violation.code}${violation.edgeId ? ` [${violation.edgeId}]` : ''}: ${violation.message}`).join('\n');
