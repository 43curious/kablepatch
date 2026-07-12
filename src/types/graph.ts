import type { SignalType } from '../nodes/NodeTypes';

export type XY = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };
export type { SignalType };

export interface Port {
  id: string;
  label: string;
  signalType: SignalType;
  side: 'input' | 'output';
  aliases?: string[];
}

export interface Node {
  id: string;
  label: string;
  category: string;
  headerColor: string;
  position: XY;
  ports: Port[];
  space?: string;
  notes?: string;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  label?: string;
}
