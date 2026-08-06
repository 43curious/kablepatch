# Routing performance roadmap

The collision-aware router currently runs in a Web Worker. Dragging uses cached routes and a lightweight orthogonal preview; final A* results are applied only when the worker returns for the latest geometry revision.

## Suggested next changes

1. **Affected-route rerouting** — reroute attached and newly obstructed cables first, keeping unaffected routes as fixed occupancy. Follow with an optional full optimization pass.
2. **Sparse rectilinear graph** — search connector leads, obstacle boundaries, occupied tracks, lane offsets, and waypoints instead of every 8px grid coordinate.
3. **Numeric A* state** — replace string state keys and per-state objects with numeric IDs, typed arrays, generation markers, and reusable buffers.
4. **Numeric occupancy indexes** — replace string bucket keys and temporary sets with track-oriented interval indexes and reusable candidate buffers.
5. **Parallel rip-up passes** — run independent deterministic routing orders in separate workers and select the same best score.
6. **Stronger A* pruning** — use an obstacle-safe upper bound, bend-aware heuristics, direct jumps to interesting coordinates, and deterministic constrained-edge priority.
7. **WASM only after numeric refactoring** — consider Rust/WASM inside a Worker after the router uses flat numeric data; avoid porting the current object-heavy implementation directly.

## Quality constraints

Any optimization must preserve obstacle clearance, lane spacing, endpoint direction, manual waypoints, deterministic output, strict crossing behavior, and explicit unroutable results. Run the routing golden and invariant suites before comparing performance.
