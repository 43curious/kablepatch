# Routing performance roadmap

The collision-aware routing algorithm remains unchanged and runs in a persistent Web Worker. Routing uses world-space geometry, is deferred while dragging, and ignores pan/zoom changes.

## Implemented safeguards and infrastructure

1. Exact golden fixtures for dense obstacles, shared terminals, manual waypoints, crossings, and unroutable results.
2. Independent routing invariant validation covering components, horizontal and vertical lane spacing, overlaps, crossing turns, endpoints, directions, waypoints, and crossing reports.
3. Worker and main-thread telemetry for queueing, coalescing, scene construction, routing, round-trip latency, and stale results.
4. Persistent Worker reuse with monotonic request IDs and stale-result rejection.
5. Trailing request coalescing with at most one active and one latest pending request.
6. Worker-side obstacle-scene caching keyed by effective component geometry and clearance.
7. Development-only final route validation, removed from production bundles.

## Higher-risk ideas intentionally deferred

- Affected-route rerouting with fixed occupancy.
- Sparse rectilinear graphs.
- Numeric or typed-array A* rewrites.
- Numeric occupancy indexes.
- Parallel routing-order passes.
- Heuristic/scoring changes.
- WASM rewrites.

These should only be reconsidered after profiling and must remain byte-for-byte compatible with the golden fixtures unless a route-quality change is explicitly approved.

## Quality constraints

Any future optimization must preserve obstacle clearance, horizontal and vertical lane spacing, endpoint direction, manual waypoints, deterministic output, strict crossing behavior, and explicit unroutable results.
