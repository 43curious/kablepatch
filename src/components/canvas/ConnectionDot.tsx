import { SIGNAL_TYPES } from '../../nodes/NodeTypes';
import type { Port } from '../../types/graph';

type Props = {
  port: Port;
  x: number;
  y: number;
  onPointerDown?: (port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
  onPointerUp?: (port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
};

export default function ConnectionDot({ port, x, y, onPointerDown, onPointerUp }: Props) {
  return <circle className="connection-dot" data-port-id={port.id} data-side={port.side} cx={x} cy={y} r={4} fill={SIGNAL_TYPES[port.signalType].color} stroke="#fff" strokeWidth={1.5} onPointerDown={e => onPointerDown?.(port, e)} onPointerUp={e => onPointerUp?.(port, e)} />;
}
