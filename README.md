# Iko Connect

Astro diagram editor with deterministic orthogonal cable routing. Auto-align keeps allocated spaces contiguous, leaves two grid snaps between components, and prioritizes clear cable runs. Ethernet switches default to top-mounted bidirectional ports, a bottom name stripe, and compact 45-degree labels; Ethernet ports on other components use a centered bottom rail.

## Commands

```sh
npm install
npm run dev
npm test
npm run test:watch
npm run build
```

## Routing

`src/components/canvas/geometry.ts` implements deterministic ConnectCAD-style schematic routing. Automatic output-to-input connections use 28px screen-space leads and a centered horizontal–vertical–horizontal run. Reversed connections use a deterministic lane above or below their endpoint devices. Routes contain only orthogonal points and render as SVG `M`, `H`, and `V` commands. Stable 8px lanes prevent shared cable runs, while deterministic fallback lanes avoid unrelated component bounds.

Edges may store absolute world-space `waypoints`. Automatic routes recompute when devices move; manual routes retain those waypoints and update only their endpoint sections. Store actions expose waypoint updates and automatic-route reset. Segment dragging, bend insertion/removal, and crossing hop-overs are intentionally deferred until the canvas has a dedicated cable-edit interaction mode; crossing detection belongs in the rendering layer and does not alter schematic routing.
