import type { Node } from '../../../types/graph';
import type { EdgeRouteInput, RoutedEdge } from '../geometry';
import type { WorkerRouteOptions } from '../routingWorkerProtocol';
import { routingGoldenExpected } from './routingGoldenExpected';

export type RoutingGoldenFixture = {
  name: string;
  nodes: Node[];
  edges: EdgeRouteInput[];
  options: WorkerRouteOptions;
  expected: RoutedEdge[];
};

const options: WorkerRouteOptions = { portMargin: 28, laneSpacing: 8, obstacleClearance: 12, ripUpIterations: 2 };
const blocker = (id: string, x: number, y: number): Node => ({ id, label: id, category: 'Custom', headerColor: '#334155', position: { x, y }, ports: [] });

export const routingGoldenFixtures: RoutingGoldenFixture[] = [
  {
    name: 'dense obstacle lanes',
    nodes: [blocker('block-a', 180, 40), blocker('block-b', 420, 136)],
    edges: [
      { id: 'lane-a', source: { x: 0, y: 100 }, target: { x: 720, y: 100 }, sourceNodeId: 'source-a', targetNodeId: 'target-a', sourceSide: 'east', targetSide: 'west' },
      { id: 'lane-b', source: { x: 0, y: 180 }, target: { x: 720, y: 180 }, sourceNodeId: 'source-b', targetNodeId: 'target-b', sourceSide: 'east', targetSide: 'west' },
      { id: 'lane-c', source: { x: 0, y: 260 }, target: { x: 720, y: 60 }, sourceNodeId: 'source-c', targetNodeId: 'target-c', sourceSide: 'east', targetSide: 'west' },
    ],
    options,
    expected: routingGoldenExpected[0],
  },
  {
    name: 'shared terminal fanout',
    nodes: [],
    edges: ['c', 'a', 'b'].map(id => ({ id, source: { x: 0, y: 100 }, target: { x: 480, y: 220 }, sourceNodeId: 'shared-source', targetNodeId: 'shared-target', sourceSide: 'east' as const, targetSide: 'west' as const })),
    options,
    expected: routingGoldenExpected[1],
  },
  {
    name: 'manual waypoints and crossing',
    nodes: [blocker('waypoint-block', 180, 80)],
    edges: [
      { id: 'manual', source: { x: 0, y: 40 }, target: { x: 520, y: 260 }, sourceNodeId: 'manual-source', targetNodeId: 'manual-target', sourceSide: 'east', targetSide: 'west', waypoints: [{ x: 120, y: 20 }, { x: 400, y: 300 }] },
      { id: 'vertical', source: { x: 360, y: -80 }, target: { x: 360, y: 380 }, sourceNodeId: 'vertical-source', targetNodeId: 'vertical-target', sourceSide: 'south', targetSide: 'north' },
    ],
    options,
    expected: routingGoldenExpected[2],
  },
  {
    name: 'reported unavoidable crossing',
    nodes: [],
    edges: [
      { id: 'a-loop', source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, sourceNodeId: 'loop-source', targetNodeId: 'loop-target', sourceSide: 'east', targetSide: 'east', waypoints: [{ x: 32, y: -40 }, { x: -40, y: -40 }, { x: -40, y: 40 }, { x: 32, y: 40 }] },
      { id: 'b-exit', source: { x: 0, y: 8 }, target: { x: 100, y: 8 }, sourceNodeId: 'inside', targetNodeId: 'outside', sourceSide: 'west', targetSide: 'west' },
    ],
    options: { ...options, ripUpIterations: 1 },
    expected: routingGoldenExpected[3],
  },
  {
    name: 'explicit unroutable result',
    nodes: [blocker('enclosing', -100, 40)],
    edges: [{ id: 'impossible', source: { x: 0, y: 80 }, target: { x: 400, y: 80 }, sourceNodeId: 'source', targetNodeId: 'target' }],
    options,
    expected: routingGoldenExpected[4],
  },
];
