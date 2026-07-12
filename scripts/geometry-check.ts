import assert from 'node:assert/strict';
import { cableCorridorGap, cablePoints, NODE_WIDTH, nodeRect, routeEdges, snapToGrid } from '../src/components/canvas/geometry.ts';
import type { Node, XY } from '../src/types/graph.ts';

const node = (id: string, x: number, y: number): Node => ({ id, label: id, category: 'Custom', headerColor: '#000', position: { x, y }, ports: [], notes: '' });
const hits = (a: XY, b: XY, n: Node) => {
  const r = nodeRect(n);
  return a.x === b.x
    ? a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h
    : a.y === b.y && a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
};

const nodes = [node('source', 0, 0), node('blocker', 360, 0), node('target', 720, 0)];
const path = cablePoints({ x: 216, y: 48 }, { x: 720, y: 48 }, nodes);
assert.ok(path.length > 4, 'route should detour around a blocker');
assert.ok(path.slice(1).every((p, i) => !hits(path[i], p, nodes[1])), 'route must not cross a component');
assert.equal(cableCorridorGap(0), 72, 'auto-align defaults to three grid snaps');
assert.equal(cableCorridorGap(2), 72, 'cable corridors retain the three-grid auto-align minimum');
assert.equal(snapToGrid(NODE_WIDTH + cableCorridorGap(2)) - NODE_WIDTH, 72, 'two lanes retain three grid snaps after alignment');

const routes = routeEdges([
  { id: 'one', source: { x: 216, y: 48 }, target: { x: 720, y: 48 }, sourceNodeId: 'source', targetNodeId: 'target' },
  { id: 'two', source: { x: 216, y: 72 }, target: { x: 720, y: 72 }, sourceNodeId: 'source', targetNodeId: 'target' },
], nodes);
const verticalRuns = (path: string) => {
  let x = 0, y = 0;
  return [...path.matchAll(/([MHV])(-?\d+)(?:,(-?\d+))?/g)].flatMap(([, command, first, second]) => {
    if (command === 'M') { x = Number(first); y = Number(second); return []; }
    if (command === 'H') { x = Number(first); return []; }
    const run = { x, y1: y, y2: Number(first) }; y = Number(first); return [run];
  });
};
const verticalOverlap = (a: { x: number; y1: number; y2: number }, b: { x: number; y1: number; y2: number }) => a.x === b.x && Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) > Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
const horizontalRuns = (path: string) => {
  let x = 0, y = 0;
  return [...path.matchAll(/([MHV])(-?\d+)(?:,(-?\d+))?/g)].flatMap(([, command, first, second]) => {
    if (command === 'M') { x = Number(first); y = Number(second); return []; }
    if (command === 'V') { y = Number(first); return []; }
    const run = { y, x1: x, x2: Number(first) }; x = Number(first); return [run];
  });
};
const horizontalOverlap = (a: { y: number; x1: number; x2: number }, b: { y: number; x1: number; x2: number }) => a.y === b.y && Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) > Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
assert.equal(routes.length, 2);
assert.ok(!verticalRuns(routes[0].path).some(a => verticalRuns(routes[1].path).some(b => verticalOverlap(a, b))), 'parallel cables must use separate vertical lanes');
assert.ok(!horizontalRuns(routes[0].path).some(a => horizontalRuns(routes[1].path).some(b => horizontalOverlap(a, b))), 'parallel cables must use separate horizontal lanes');
console.log('geometry check passed');
