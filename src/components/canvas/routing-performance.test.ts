import { describe, expect, it } from 'vitest';
import type { Node } from '../../types/graph';
import { cableObstacleRect, createRoutingScene, isOrthogonalPath, orthogonalPathHitsRect, routeEdges, routeEdgesInScene } from './geometry';

describe('representative routing scene', () => {
  it('remains deterministic and obstacle-safe when a scene is reused', { timeout: 10_000 }, () => {
    const endpoints: Node[] = Array.from({ length: 6 }, (_, i) => [
      { id: `source-${i}`, label: 'Source', category: 'Custom', headerColor: '#000', position: { x: 0, y: i * 120 }, ports: [] },
      { id: `target-${i}`, label: 'Target', category: 'Custom', headerColor: '#000', position: { x: 960, y: i * 120 }, ports: [] },
    ]).flat();
    const blockers: Node[] = Array.from({ length: 6 }, (_, i) => ({ id: `blocker-${i}`, label: 'Blocker', category: 'Custom', headerColor: '#000', position: { x: 360 + i % 2 * 240, y: i * 120 - 24 }, ports: [] }));
    const nodes = [...endpoints, ...blockers];
    const edges = Array.from({ length: 6 }, (_, i) => ({
      id: `cable-${i}`, source: { x: 216, y: i * 120 + 24 }, target: { x: 960, y: i * 120 + 24 },
      sourceNodeId: `source-${i}`, targetNodeId: `target-${i}`, sourceSide: 'east' as const, targetSide: 'west' as const,
    }));
    const scene = createRoutingScene(nodes), first = routeEdgesInScene(edges, scene), second = routeEdgesInScene(edges, scene);

    expect(second).toEqual(first);
    expect(routeEdges(edges, nodes)).toEqual(first);
    for (const route of first) {
      expect(route.status).toBe('routed');
      expect(isOrthogonalPath(route.points)).toBe(true);
      for (const blocker of blockers) expect(orthogonalPathHitsRect(route.points, cableObstacleRect(blocker))).toBe(false);
    }
  });
});
