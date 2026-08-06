import { SIGNAL_TYPES } from '../../nodes/NodeTypes';
import type { Port } from '../../types/graph';

type Props = {
  port: Port;
  x: number;
  y: number;
  connectionState?: 'active' | 'compatible' | 'incompatible';
  onPointerDown?: (port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
  onPointerUp?: (port: Port, e: React.PointerEvent<SVGCircleElement>) => void;
  onClick?: (port: Port) => void;
};

export default function ConnectionDot({ port, x, y, connectionState, onPointerDown, onPointerUp, onClick }: Props) {
  const activate = () => onClick?.(port);
  return <circle className={`connection-dot ${connectionState ?? ''}`} data-port-id={port.id} data-side={port.side} cx={x} cy={y} r={4} fill={SIGNAL_TYPES[port.signalType].color} stroke="#fff" strokeWidth={1.5} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? `${port.label} ${port.side} connection` : undefined} onPointerDown={e => onPointerDown?.(port, e)} onPointerUp={e => onPointerUp?.(port, e)} onClick={e => { e.stopPropagation(); activate(); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); activate(); } }} />;
}
