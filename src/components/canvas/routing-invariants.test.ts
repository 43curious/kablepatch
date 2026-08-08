import { describe, expect, it } from 'vitest';
import { pointsToSvgPath, routeEdges } from './geometry';
import type { EdgeRouteInput, RoutedEdge } from './geometry';
import { routingGoldenFixtures } from './__fixtures__/routingGoldenFixtures';
import { validateRoutingResult } from './routingValidation';

const edge = (id: string, y: number): EdgeRouteInput => ({ id, source: { x: 0, y }, target: { x: 200, y }, sourceNodeId: `${id}-source`, targetNodeId: `${id}-target`, sourceSide: 'east', targetSide: 'west' });
const routed = (input: EdgeRouteInput, points = [input.source, input.target]): RoutedEdge => ({ id: input.id, status: 'routed', points, path: points.length === 2 ? `M${points[0].x},${points[0].y} H${points[1].x}` : '', crossings: [] });

describe('routing result invariants', () => {
  for (const fixture of routingGoldenFixtures) it(`validates ${fixture.name}`, () => {
    const routes = routeEdges(fixture.edges, fixture.nodes, fixture.options);
    expect(validateRoutingResult(fixture.edges, fixture.nodes, routes, fixture.options)).toEqual([]);
  });

  it('detects horizontal and vertical lane crowding', () => {
    const horizontal = [edge('a', 0), edge('b', 4)];
    expect(validateRoutingResult(horizontal, [], horizontal.map(item => routed(item))).some(item => item.code === 'lane-spacing')).toBe(true);

    const vertical: EdgeRouteInput[] = [0, 4].map((x, index) => ({ id: `v${index}`, source: { x, y: 0 }, target: { x, y: 200 }, sourceNodeId: `vs${index}`, targetNodeId: `vt${index}`, sourceSide: 'south', targetSide: 'north' }));
    const routes = vertical.map(item => ({ id: item.id, status: 'routed' as const, points: [item.source, item.target], path: `M${item.source.x},0 V200`, crossings: [] }));
    expect(validateRoutingResult(vertical, [], routes).some(item => item.code === 'lane-spacing')).toBe(true);
  });

  it('detects component collisions, overlaps, endpoint errors, and turns on crossings', () => {
    const first = edge('first', 100), second = { ...edge('second', 100), source: { x: -20, y: 100 }, target: { x: 220, y: 100 } };
    const blocker = { id: 'blocker', label: 'Blocker', category: 'Custom', headerColor: '#000', position: { x: 80, y: 60 }, ports: [] };
    const violations = validateRoutingResult([first, second], [blocker], [routed(first), routed(second)]);
    expect(violations.map(item => item.code)).toEqual(expect.arrayContaining(['component-collision', 'cable-overlap']));

    const crossing: EdgeRouteInput = { id: 'crossing', source: { x: 100, y: -100 }, target: { x: 100, y: 100 }, sourceNodeId: 'cs', targetNodeId: 'ct', sourceSide: 'south', targetSide: 'north' };
    expect(validateRoutingResult([first, crossing], [], [routed(first), { id: crossing.id, status: 'routed', points: [crossing.source, crossing.target], path: 'M100,-100 V100', crossings: [] }]).some(item => item.code === 'turn-on-crossing')).toBe(true);
  });

  it('detects missing ordered waypoints and malformed unroutable results', () => {
    const manual = { ...edge('manual', 0), waypoints: [{ x: 80, y: 40 }] };
    const badUnroutable: RoutedEdge = { id: manual.id, status: 'unroutable', points: [manual.source], path: 'M0,0', crossings: [] };
    expect(validateRoutingResult([manual], [], [routed(manual)]).some(item => item.code === 'waypoint')).toBe(true);
    expect(validateRoutingResult([manual], [], [badUnroutable]).some(item => item.code === 'unroutable-shape')).toBe(true);
  });

  it('uses output/input defaults and detects wrong endpoint directions', () => {
    const input = edge('defaults', 0);
    expect(validateRoutingResult([input], [], [routed(input)]).filter(item => item.code.endsWith('-direction'))).toEqual([]);
    const wrongPoints = [input.source, { x: -20, y: 0 }, input.target];
    const wrong = { ...routed(input, wrongPoints), path: pointsToSvgPath(wrongPoints) };
    expect(validateRoutingResult([input], [], [wrong]).some(item => item.code === 'source-direction')).toBe(true);
  });

  it('detects result identity, endpoint, SVG, duplicate-point, and self-collision violations', () => {
    const input = edge('identity', 0), valid = routed(input);
    expect(validateRoutingResult([input], [], []).some(item => item.code === 'missing-route')).toBe(true);
    expect(validateRoutingResult([input], [], [valid, valid]).some(item => item.code === 'duplicate-route')).toBe(true);
    expect(validateRoutingResult([], [], [valid]).some(item => item.code === 'unknown-route')).toBe(true);
    expect(validateRoutingResult([input], [], [{ ...valid, points: [{ x: 1, y: 0 }, input.target] }]).some(item => item.code === 'endpoint')).toBe(true);
    expect(validateRoutingResult([input], [], [{ ...valid, path: 'bad' }]).some(item => item.code === 'svg-path')).toBe(true);
    expect(validateRoutingResult([input], [], [{ ...valid, points: [input.source, input.source, input.target], path: pointsToSvgPath([input.source, input.source, input.target]) }]).some(item => item.code === 'duplicate-point')).toBe(true);

    const selfPoints = [input.source, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 50, y: -50 }, { x: 200, y: -50 }, input.target];
    expect(validateRoutingResult([input], [], [{ ...valid, points: selfPoints, path: pointsToSvgPath(selfPoints) }]).some(item => item.code === 'self-collision')).toBe(true);
  });

  it('detects missing and invalid crossing reports', () => {
    const horizontal = edge('horizontal', 0);
    const vertical: EdgeRouteInput = { id: 'vertical-cross', source: { x: 100, y: -100 }, target: { x: 100, y: 100 }, sourceNodeId: 'vs', targetNodeId: 'vt', sourceSide: 'south', targetSide: 'north' };
    const horizontalRoute = routed(horizontal), verticalRoute: RoutedEdge = { id: vertical.id, status: 'routed', points: [vertical.source, vertical.target], path: 'M100,-100 V100', crossings: [] };
    expect(validateRoutingResult([horizontal, vertical], [], [horizontalRoute, verticalRoute]).some(item => item.code === 'missing-crossing-report')).toBe(true);
    const bogus = { ...horizontalRoute, crossings: [{ point: { x: 20, y: 0 }, withEdgeId: vertical.id, segmentIndex: 0 }] };
    expect(validateRoutingResult([horizontal, vertical], [], [bogus, verticalRoute]).some(item => item.code === 'invalid-crossing-report')).toBe(true);
  });
});
