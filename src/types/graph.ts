import type { SignalType } from '../nodes/NodeTypes';

export type XY = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };
export type { SignalType };

export interface Port {
  id: string;
  label: string;
  signalType: SignalType;
  side: 'input' | 'output' | 'bidirectional';
  /** Physical face for bidirectional connectors; input/output sides are implicit. */
  position?: 'left' | 'right' | 'top' | 'bottom';
  aliases?: string[];
  /** Keeps separately added port groups distinct even when their labels match. */
  groupId?: string;
}

export interface Node {
  id: string;
  label: string;
  category: string;
  headerColor: string;
  /** Library template or preset this node came from, for catalog updates. */
  catalogId?: string;
  position: XY;
  ports: Port[];
  /** Optional physical layout variant. */
  layout?: 'ethernet-switch';
  space?: string;
  notes?: string;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  /** Absolute world-space bends retained when connected devices move. */
  waypoints?: XY[];
  label?: string;
}
