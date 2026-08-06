import { describe, expect, it } from 'vitest';
import type { Node, Port, XY } from '../../types/graph';
import {
  PORT_MARGIN, ROUTING_PITCH, cableObstacleRect, createRoutingScene, isOrthogonalPath, pointsToSvgPath, routeEdges,
  routeEdgesInScene, routeOrthogonalConnection, segmentRelation, simplifyOrthogonalPoints,
} from './geometry';
import { portsAreCompatible, useCanvasStore } from '../../store/canvasStore';

const source = { x: 0, y: 100 }, target = { x: 300, y: 220 };
const length = (points: XY[]) => points.slice(1).reduce((sum, point, i) => sum + Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y), 0);
const port = (side: Port['side'], signalType: Port['signalType'] = 'analog_audio'): Port => ({ id: `${side}-${signalType}`, label: side, side, signalType });

const assertRoute = (points: XY[], start: XY, end: XY) => {
  expect(points[0]).toEqual(start);
  expect(points.at(-1)).toEqual(end);
  expect(isOrthogonalPath(points)).toBe(true);
  expect(points.flatMap(point => [point.x, point.y]).every(Number.isFinite)).toBe(true);
};

describe('ConnectCAD orthogonal routing', () => {
  it('routes a standard left-to-right connection through the horizontal midpoint', () => {
    const route = routeOrthogonalConnection(source, target);
    expect(route).toEqual([source, { x: 150, y: 100 }, { x: 150, y: 220 }, target]);
    assertRoute(route, source, target);
  });

  it('simplifies ports with identical Y coordinates to a straight run', () => {
    expect(routeOrthogonalConnection({ x: 0, y: 40 }, { x: 300, y: 40 })).toEqual([{ x: 0, y: 40 }, { x: 300, y: 40 }]);
  });

  it.each([
    ['above', { x: 300, y: 0 }],
    ['below', { x: 300, y: 300 }],
  ])('routes a target %s the source orthogonally', (_label, endpoint) => {
    assertRoute(routeOrthogonalConnection(source, endpoint), source, endpoint);
  });

  it('uses a deterministic back-route when the target is behind the source', () => {
    const start = { x: 200, y: 40 }, end = { x: 100, y: 160 };
    const route = routeOrthogonalConnection(start, end);
    expect(route).toContainEqual({ x: start.x + PORT_MARGIN, y: 100 });
    expect(route).toContainEqual({ x: end.x - PORT_MARGIN, y: 100 });
    assertRoute(route, start, end);
  });

  it('chooses the cheapest clear device lane when horizontal space is insufficient', () => {
    const start = { x: 200, y: 100 }, end = { x: 100, y: 100 };
    const route = routeOrthogonalConnection(start, end, {
      sourceBounds: { x: 160, y: 60, w: 80, h: 80 },
      targetBounds: { x: 60, y: 60, w: 80, h: 80 },
      backRouteClearance: 20,
    });
    expect(route.some(point => point.y === 40)).toBe(true);
    assertRoute(route, start, end);
  });

  it('handles vertically aligned ports', () => {
    const start = { x: 100, y: 0 }, end = { x: 100, y: 200 };
    assertRoute(routeOrthogonalConnection(start, end), start, end);
  });

  it('keeps north and south connector leads vertical', () => {
    const start = { x: 100, y: 200 }, end = { x: 300, y: 0 };
    const route = routeOrthogonalConnection(start, end, { sourceSide: 'north', targetSide: 'south' });
    expect(route[1].x).toBe(start.x);
    expect(route[1].y).toBeLessThan(start.y);
    expect(route.at(-2)?.x).toBe(end.x);
    expect(route.at(-2)?.y).toBeGreaterThan(end.y);
    assertRoute(route, start, end);
  });

  it('handles coincident points without invalid segments', () => {
    expect(routeOrthogonalConnection({ x: 12, y: 12 }, { x: 12, y: 12 })).toEqual([{ x: 12, y: 12 }]);
  });

  it('removes duplicate and collinear points', () => {
    expect(simplifyOrthogonalPoints([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }])).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]);
  });

  it('repairs diagonal input without producing diagonal segments', () => {
    const points = simplifyOrthogonalPoints([{ x: 0, y: 0 }, { x: 30, y: 40 }]);
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }]);
    expect(isOrthogonalPath(points)).toBe(true);
  });

  it('emits SVG paths using only M, H, and V commands', () => {
    const path = pointsToSvgPath(routeOrthogonalConnection(source, target));
    expect(path).toMatch(/^M/);
    expect(path.match(/[A-Za-z]/g)?.every(command => ['M', 'H', 'V'].includes(command))).toBe(true);
  });

  it('returns identical output for identical input', () => {
    expect(routeOrthogonalConnection(source, target)).toEqual(routeOrthogonalConnection(source, target));
  });

  it('assigns stable lanes to connections sharing an automatic route', () => {
    const edges = ['c', 'a', 'b'].map(id => ({ id, source, target, sourceNodeId: 'source', targetNodeId: 'target' }));
    const first = new Map(routeEdges(edges, []).map(route => [route.id, route]));
    const second = new Map(routeEdges([...edges].reverse(), []).map(route => [route.id, route]));

    for (const id of ['a', 'b', 'c']) expect(second.get(id)?.points).toEqual(first.get(id)?.points);
    expect(new Set([...first.values()].map(route => route.path)).size).toBe(3);
    for (const route of first.values()) assertRoute(route.points, source, target);
  });

  it('separates vertical trunks from different routes that share a midpoint', () => {
    const edges = [
      { id: 'lower', source: { x: 0, y: 40 }, target: { x: 300, y: 180 }, sourceNodeId: 'a', targetNodeId: 'b' },
      { id: 'upper', source: { x: 50, y: 0 }, target: { x: 250, y: 140 }, sourceNodeId: 'c', targetNodeId: 'd' },
    ];
    const routes = routeEdges(edges, []);
    const trunkX = routes.map(route => route.points.slice(1).map((point, i) => ({ a: route.points[i], b: point })).filter(run => run.a.x === run.b.x).sort((a, b) => Math.abs(b.a.y - b.b.y) - Math.abs(a.a.y - a.b.y))[0].a.x);

    expect(Math.abs(trunkX[0] - trunkX[1])).toBeGreaterThanOrEqual(8);
    routes.forEach((route, i) => assertRoute(route.points, edges[i].source, edges[i].target));
  });

  it('detours around unrelated components instead of rendering behind them', () => {
    const blocker: Node = { id: 'blocker', label: 'Blocker', category: 'Custom', headerColor: '#000', position: { x: 200, y: 50 }, ports: [] };
    const edge = { id: 'blocked', source: { x: 0, y: 100 }, target: { x: 500, y: 100 }, sourceNodeId: 'source', targetNodeId: 'target' };
    const route = routeEdges([edge], [blocker])[0], bounds = cableObstacleRect(blocker);
    const hits = route.points.slice(1).some((point, i) => {
      const previous = route.points[i];
      return previous.x === point.x
        ? previous.x > bounds.x && previous.x < bounds.x + bounds.w && Math.max(previous.y, point.y) > bounds.y && Math.min(previous.y, point.y) < bounds.y + bounds.h
        : previous.y > bounds.y && previous.y < bounds.y + bounds.h && Math.max(previous.x, point.x) > bounds.x && Math.min(previous.x, point.x) < bounds.x + bounds.w;
    });

    expect(hits).toBe(false);
    expect(length(route.points)).toBeLessThan(672);
    assertRoute(route.points, edge.source, edge.target);
  });

  it('recomputes automatic endpoints after a device moves', () => {
    const movedTarget = { x: target.x + 120, y: target.y + 48 };
    const before = routeOrthogonalConnection(source, target), after = routeOrthogonalConnection(source, movedTarget);
    expect(after).not.toEqual(before);
    assertRoute(after, source, movedTarget);
  });

  it('preserves absolute manual waypoints when endpoints move', () => {
    const waypoint = { x: 180, y: 20 };
    const before = routeOrthogonalConnection(source, target, { waypoints: [waypoint] });
    const after = routeOrthogonalConnection({ x: 24, y: 124 }, { x: 420, y: 260 }, { waypoints: [waypoint] });
    expect(before).toContainEqual(waypoint);
    expect(after).toContainEqual(waypoint);
    assertRoute(after, { x: 24, y: 124 }, { x: 420, y: 260 });
  });

  it('stores snapped manual waypoints and resets to automatic routing', () => {
    const previous = useCanvasStore.getState();
    try {
      useCanvasStore.setState({ edges: [{ id: 'manual', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }] });
      useCanvasStore.getState().setEdgeWaypoints('manual', [{ x: 25, y: 47 }]);
      expect(useCanvasStore.getState().edges[0].waypoints).toEqual([{ x: 24, y: 48 }]);
      useCanvasStore.getState().resetEdgeRoute('manual');
      expect(useCanvasStore.getState().edges[0].waypoints).toBeUndefined();
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it.each([
    ['OUT → IN', port('output'), port('input'), true],
    ['OUT → IO', port('output'), port('bidirectional'), true],
    ['IO → IN', port('bidirectional'), port('input'), true],
    ['IO → IO', port('bidirectional'), port('bidirectional'), true],
    ['OUT → OUT', port('output'), port('output'), false],
    ['IN → IN', port('input'), port('input'), false],
  ])('validates %s direction compatibility', (_label, a, b, valid) => {
    expect(portsAreCompatible(a, b)).toBe(valid);
  });

  it('rejects incompatible signal types', () => {
    expect(portsAreCompatible(port('output', 'analog_audio'), port('input', 'sdi'))).toBe(false);
    expect(portsAreCompatible(port('output', 'sdi'), port('input', 'sdi'))).toBe(true);
  });

  it('normalizes input-first connection creation to OUT → IN', () => {
    const previous = useCanvasStore.getState();
    const outputNode = { id: 'out-node', label: 'Out', category: 'Custom', headerColor: '#000', position: { x: 0, y: 0 }, ports: [{ ...port('output'), id: 'out' }] };
    const inputNode = { id: 'in-node', label: 'In', category: 'Custom', headerColor: '#000', position: { x: 300, y: 0 }, ports: [{ ...port('input'), id: 'in' }] };
    try {
      useCanvasStore.setState({ nodes: [outputNode, inputNode], edges: [] });
      useCanvasStore.getState().addEdge(inputNode.id, 'in', outputNode.id, 'out');
      expect(useCanvasStore.getState().edges[0]).toMatchObject({ sourceNodeId: outputNode.id, sourcePortId: 'out', targetNodeId: inputNode.id, targetPortId: 'in' });
    } finally {
      useCanvasStore.setState(previous, true);
    }
  });

  it('keeps arbitrary finite endpoint routes valid', () => {
    for (let i = 0; i < 100; i++) {
      const start = { x: (i * 97) % 503 - 250, y: (i * 53) % 401 - 200 };
      const end = { x: (i * 31) % 607 - 300, y: (i * 79) % 509 - 250 };
      const route = routeOrthogonalConnection(start, end);
      assertRoute(route, start, end);
      const simplified = simplifyOrthogonalPoints(route);
      expect(simplified[0]).toEqual(start);
      expect(simplified.at(-1)).toEqual(end);
      expect(length(simplified)).toBeGreaterThanOrEqual(Math.abs(start.x - end.x) + Math.abs(start.y - end.y));
    }
  });

  it('reuses a routing scene without changing deterministic output', () => {
    const blocker: Node = { id: 'blocker', label: 'Blocker', category: 'Custom', headerColor: '#000', position: { x: 160, y: 40 }, ports: [] };
    const edges = [
      { id: 'scene-a', source: { x: 0, y: 80 }, target: { x: 420, y: 80 }, sourceNodeId: 'a', targetNodeId: 'b' },
      { id: 'scene-b', source: { x: 0, y: 120 }, target: { x: 420, y: 160 }, sourceNodeId: 'c', targetNodeId: 'd' },
    ];
    const scene = createRoutingScene([blocker]);

    expect(routeEdgesInScene(edges, scene)).toEqual(routeEdges(edges, [blocker]));
    expect(routeEdgesInScene([...edges].reverse(), scene).map(route => route.path).reverse()).toEqual(routeEdgesInScene(edges, scene).map(route => route.path));
  });

  it('uses the independent 8px routing pitch and a shortest unobstructed A* route', () => {
    expect(ROUTING_PITCH).toBe(8);
    const edge = { id: 'shortest', source, target, sourceNodeId: 'source', targetNodeId: 'target' };
    const route = routeEdges([edge], [], { gridSize: 24 })[0];
    expect(route.status).toBe('routed');
    expect(length(route.points)).toBe(Math.abs(source.x - target.x) + Math.abs(source.y - target.y));
    assertRoute(route.points, source, target);
  });

  it('shortens a connector lead when a nearby component blocks the preferred escape', () => {
    const sourceNode: Node = {
      id: 'source-node', label: 'Source', category: 'Custom', headerColor: '#000', position: { x: 0, y: 0 },
      ports: [{ id: 'out', label: 'Out', side: 'output', signalType: 'analog_audio' }],
    };
    const targetNode: Node = {
      id: 'target-node', label: 'Target', category: 'Custom', headerColor: '#000', position: { x: 600, y: 0 },
      ports: [{ id: 'in', label: 'In', side: 'input', signalType: 'analog_audio' }],
    };
    const blocker: Node = { id: 'nearby', label: 'Nearby', category: 'Custom', headerColor: '#000', position: { x: 252, y: -24 }, ports: [] };
    const edge = {
      id: 'close-escape', source: { x: 216, y: 24 }, target: { x: 600, y: 24 },
      sourceNodeId: sourceNode.id, targetNodeId: targetNode.id, sourceSide: 'east' as const, targetSide: 'west' as const,
    };
    const route = routeEdges([edge], [sourceNode, blocker, targetNode])[0];

    expect(route.status).toBe('routed');
    expect(route.points[1].x).toBeLessThan(240);
    const bounds = cableObstacleRect(blocker);
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      const hits = a.x === b.x
        ? a.x > bounds.x && a.x < bounds.x + bounds.w && Math.max(a.y, b.y) > bounds.y && Math.min(a.y, b.y) < bounds.y + bounds.h
        : a.y > bounds.y && a.y < bounds.y + bounds.h && Math.max(a.x, b.x) > bounds.x && Math.min(a.x, b.x) < bounds.x + bounds.w;
      expect(hits).toBe(false);
    }
  });

  it('routes around several inflated component obstacles', () => {
    const blockers: Node[] = [120, 280, 440].map((x, i) => ({ id: `block-${i}`, label: 'Block', category: 'Custom', headerColor: '#000', position: { x, y: i % 2 ? 100 : 40 }, ports: [] }));
    const edge = { id: 'slalom', source: { x: 0, y: 120 }, target: { x: 720, y: 120 }, sourceNodeId: 'source', targetNodeId: 'target' };
    const route = routeEdges([edge], blockers)[0];
    expect(route.status).toBe('routed');
    for (const bounds of blockers.map(node => cableObstacleRect(node))) for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      const hits = a.x === b.x
        ? a.x > bounds.x && a.x < bounds.x + bounds.w && Math.max(a.y, b.y) > bounds.y && Math.min(a.y, b.y) < bounds.y + bounds.h
        : a.y > bounds.y && a.y < bounds.y + bounds.h && Math.max(a.x, b.x) > bounds.x && Math.min(a.x, b.x) < bounds.x + bounds.w;
      expect(hits).toBe(false);
    }
  });

  it('classifies every orthogonal segment relation', () => {
    const horizontal = { a: { x: 0, y: 0 }, b: { x: 20, y: 0 } };
    expect(segmentRelation(horizontal, { a: { x: 30, y: 20 }, b: { x: 40, y: 20 } })).toBe('none');
    expect(segmentRelation(horizontal, { a: { x: 20, y: 0 }, b: { x: 30, y: 0 } })).toBe('touch');
    expect(segmentRelation(horizontal, { a: { x: 10, y: -10 }, b: { x: 10, y: 10 } })).toBe('crossing');
    expect(segmentRelation(horizontal, { a: { x: 10, y: 0 }, b: { x: 30, y: 0 } })).toBe('overlap');
    expect(segmentRelation(horizontal, { a: { x: 0, y: 4 }, b: { x: 20, y: 4 } }, 8)).toBe('too-close');
    expect(segmentRelation({ a: { x: 0, y: 0 }, b: { x: 0, y: 20 } }, { a: { x: 4, y: 0 }, b: { x: 4, y: 20 } }, 8)).toBe('too-close');
  });

  it('reports an unavoidable horizontal/vertical crossing for hop-over rendering', () => {
    const loop = {
      id: 'a-loop', source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, sourceNodeId: 'loop-source', targetNodeId: 'loop-target',
      sourceSide: 'east' as const, targetSide: 'east' as const,
      waypoints: [{ x: 32, y: -40 }, { x: -40, y: -40 }, { x: -40, y: 40 }, { x: 32, y: 40 }],
    };
    const exit = { id: 'b-exit', source: { x: 0, y: 8 }, target: { x: 100, y: 8 }, sourceNodeId: 'inside', targetNodeId: 'outside', sourceSide: 'west' as const, targetSide: 'west' as const };
    const routes = routeEdges([loop, exit], [], { ripUpIterations: 1 });
    const crossing = { x: 32, y: 16 };
    expect(routes.every(route => route.status === 'routed')).toBe(true);
    expect(routes[0].crossings).toEqual([{ point: crossing, withEdgeId: exit.id, segmentIndex: 5 }]);
    expect(routes[1].crossings[0]).toMatchObject({ point: crossing, withEdgeId: loop.id });
    // Crossings belong inside straight segments; turning on one visually merges
    // both cables into an ambiguous T-junction.
    expect(routes.every(route => !route.points.some(point => point.x === crossing.x && point.y === crossing.y))).toBe(true);
  });

  it('never turns on another cable', () => {
    const trunk = {
      id: 'a-trunk', source: { x: 100, y: -100 }, target: { x: 100, y: 200 }, sourceNodeId: 'top', targetNodeId: 'bottom',
      sourceSide: 'south' as const, targetSide: 'north' as const,
    };
    const turningWaypoint = {
      id: 'b-turn', source: { x: 0, y: 0 }, target: { x: 220, y: 120 }, sourceNodeId: 'left', targetNodeId: 'right',
      sourceSide: 'east' as const, targetSide: 'west' as const, waypoints: [{ x: 100, y: 0 }],
    };
    const routes = routeEdges([trunk, turningWaypoint], [], { ripUpIterations: 1 });

    expect(routes[0].status).toBe('routed');
    expect(routes[1]).toMatchObject({ status: 'unroutable', points: [], crossings: [] });
  });

  it('routes changed cables around cached cable occupancy', () => {
    const fixed = { id: 'fixed', source: { x: 0, y: 100 }, target: { x: 300, y: 100 }, sourceNodeId: 'a', targetNodeId: 'b' };
    const dynamic = { id: 'dynamic', source: { x: -80, y: 104 }, target: { x: 380, y: 104 }, sourceNodeId: 'c', targetNodeId: 'd' };
    const route = routeEdges([dynamic], [], {
      occupiedRoutes: [{ edge: fixed, points: [fixed.source, fixed.target] }],
      ripUpIterations: 1,
    })[0];

    expect(route.status).toBe('routed');
    const dynamicSegments = route.points.slice(1).map((point, i) => ({ a: route.points[i], b: point }));
    for (const segment of dynamicSegments) expect(['none', 'crossing']).toContain(segmentRelation(segment, { a: fixed.source, b: fixed.target }));
  });

  it('uses separate horizontal and vertical tracks for parallel cables', () => {
    const edges = [
      { id: 'h1', source: { x: 0, y: 0 }, target: { x: 300, y: 0 }, sourceNodeId: 'a', targetNodeId: 'b' },
      { id: 'h2', source: { x: 0, y: 8 }, target: { x: 300, y: 8 }, sourceNodeId: 'c', targetNodeId: 'd' },
      { id: 'v1', source: { x: 400, y: 0 }, target: { x: 400, y: 300 }, sourceNodeId: 'e', targetNodeId: 'f', sourceSide: 'south' as const, targetSide: 'north' as const },
      { id: 'v2', source: { x: 408, y: 0 }, target: { x: 408, y: 300 }, sourceNodeId: 'g', targetNodeId: 'h', sourceSide: 'south' as const, targetSide: 'north' as const },
    ];
    const routes = routeEdges(edges, []);
    expect(routes.every(route => route.status === 'routed')).toBe(true);
    expect(new Set(routes.map(route => route.path)).size).toBe(4);
    routes.forEach((route, i) => assertRoute(route.points, edges[i].source, edges[i].target));
  });

  it.each([
    ['north', { x: 100, y: 200 }, { x: 300, y: 0 }],
    ['east', { x: 0, y: 100 }, { x: 300, y: 220 }],
    ['south', { x: 100, y: 0 }, { x: 300, y: 200 }],
    ['west', { x: 300, y: 100 }, { x: 0, y: 220 }],
  ] as const)('routes ports on the %s face', (face, start, end) => {
    const route = routeEdges([{ id: face, source: start, target: end, sourceNodeId: 'a', targetNodeId: 'b', sourceSide: face, targetSide: face }], [])[0];
    expect(route.status).toBe('routed');
    assertRoute(route.points, start, end);
  });

  it('runs A* between and retains every manual waypoint', () => {
    const waypoints = [{ x: 80, y: -40 }, { x: 240, y: 280 }];
    const edge = { id: 'manual-a-star', source, target, sourceNodeId: 'a', targetNodeId: 'b', waypoints };
    const route = routeEdges([edge], [
      { id: 'block', label: 'Block', category: 'Custom', headerColor: '#000', position: { x: 120, y: 40 }, ports: [] },
    ])[0];
    expect(route.status).toBe('routed');
    for (const waypoint of waypoints) expect(route.points).toContainEqual(waypoint);
    assertRoute(route.points, source, target);
  });

  it('returns an explicit deterministic failure instead of a one-point fallback', () => {
    const enclosing: Node = { id: 'enclosing', label: 'Block', category: 'Custom', headerColor: '#000', position: { x: -100, y: 40 }, ports: [] };
    const edge = { id: 'impossible', source: { x: 0, y: 80 }, target: { x: 400, y: 80 }, sourceNodeId: 'source', targetNodeId: 'target' };
    const first = routeEdges([edge], [enclosing])[0], second = routeEdges([edge], [enclosing])[0];
    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: edge.id, status: 'unroutable', points: [], path: '', crossings: [] });
  });

  it('makes every routed segment finite and orthogonal', () => {
    const edges = Array.from({ length: 12 }, (_, i) => ({ id: `finite-${i}`, source: { x: i * 8, y: -100 }, target: { x: 500 - i * 8, y: 400 }, sourceNodeId: `s${i}`, targetNodeId: `t${i}`, sourceSide: 'south' as const, targetSide: 'north' as const }));
    const routes = routeEdges(edges, []);
    expect(routes.map(route => route.status)).toEqual(Array(12).fill('routed'));
    for (const route of routes) {
      if (route.status === 'routed') expect(isOrthogonalPath(route.points)).toBe(true);
      expect(route.points.flatMap(point => [point.x, point.y]).every(Number.isFinite)).toBe(true);
    }

    const segments = routes.map(route => route.points.slice(1).map((point, i) => ({ a: route.points[i], b: point })));
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      if (routes[i].status !== 'routed' || routes[j].status !== 'routed') continue;
      for (const a of segments[i]) for (const b of segments[j]) {
        expect(['none', 'crossing']).toContain(segmentRelation(a, b));
      }
    }
  });
});
