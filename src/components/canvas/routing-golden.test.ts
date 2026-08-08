import { describe, expect, it } from 'vitest';
import { createRoutingScene, routeEdges, routeEdgesInScene } from './geometry';
import { routingGoldenFixtures } from './__fixtures__/routingGoldenFixtures';

const canonical = <T extends { id: string }>(values: T[]) => [...values].sort((a, b) => a.id.localeCompare(b.id));

describe('routing golden fixtures', () => {
  for (const fixture of routingGoldenFixtures) it(`preserves ${fixture.name}`, () => {
    const direct = routeEdges(fixture.edges, fixture.nodes, fixture.options);
    expect(direct).toEqual(fixture.expected);
    expect(routeEdges(fixture.edges, fixture.nodes, fixture.options)).toEqual(fixture.expected);
    expect(routeEdgesInScene(fixture.edges, createRoutingScene(fixture.nodes, fixture.options.obstacleClearance), fixture.options)).toEqual(fixture.expected);
    expect(canonical(routeEdges([...fixture.edges].reverse(), fixture.nodes, fixture.options))).toEqual(canonical(fixture.expected));
  });
});
