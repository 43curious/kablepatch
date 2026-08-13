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

export interface Vlan {
  /** Stable project-local identifier used by component assignments. */
  id: string;
  /** IEEE 802.1Q VLAN identifier. */
  tag: number;
  name: string;
  color: string;
}

export interface Node {
  id: string;
  label: string;
  category: string;
  headerColor: string;
  /** Optional user-selected component icon. */
  emoji?: string;
  /** Library template or preset this node came from, for catalog updates. */
  catalogId?: string;
  position: XY;
  ports: Port[];
  /** Optional physical layout variant. */
  layout?: 'ethernet-switch';
  space?: string;
  /** A networked component may participate in multiple project VLANs. */
  vlanIds?: string[];
  notes?: string;
}

export const hasEthernetPort = (node: Pick<Node, 'ports'>) => node.ports.some(port => port.signalType === 'ethernet');

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
