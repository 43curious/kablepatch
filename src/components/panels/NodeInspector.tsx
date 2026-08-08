import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CATEGORY_COLORS, SIGNAL_TYPES } from '../../nodes/NodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import { hasEthernetPort } from '../../types/graph';
import type { Port, SignalType } from '../../types/graph';

type PortGroup = { side: Port['side']; type: string; amount: number; signalType: SignalType; ids: string[]; aliases: (string[] | undefined)[]; groupId?: string; position?: Port['position']; before?: string; after?: string };

const COMPONENTS_KEY = 'audiopatch-components';
const compact = (s: string) => s.replace(/\s{2,}/g, ' ').trim();
const portInfo = (label: string) => {
  const m = label.match(/^(.*\s)\d+(\D*)$/);
  return m ? { type: compact(`${m[1]}${m[2]}`), before: m[1], after: m[2] } : { type: label };
};
const portGroups = (ports: Port[]) => Object.values(ports.reduce<Record<string, PortGroup>>((a, p) => {
  const info = portInfo(p.label), key = `${p.side}:${p.position ?? ''}:${p.groupId ?? info.type}:${p.signalType}`;
  (a[key] ??= { ...info, side: p.side, position: p.position, amount: 0, signalType: p.signalType, ids: [], aliases: [], groupId: p.groupId }).amount++;
  a[key].ids.push(p.id); a[key].aliases.push(p.aliases);
  return a;
}, {}));
const labelFor = (g: PortGroup, i: number) => g.before && compact(`${g.before}${g.after ?? ''}`) === g.type ? `${g.before}${i + 1}${g.after ?? ''}` : g.amount === 1 ? (g.type || 'PORT') : `${g.type || 'PORT'} ${i + 1}`;
const buildPorts = (groups: PortGroup[]): Port[] => groups.flatMap(g => Array.from({ length: Math.max(0, g.amount) }, (_, i) => ({ id: g.ids[i] ?? crypto.randomUUID(), label: labelFor(g, i), side: g.side, position: g.position, signalType: g.signalType, aliases: g.aliases[i], groupId: g.groupId })));

export default function NodeInspector({ categories }: { categories: string[] }) {
  const selectedNodeId = useCanvasStore(state => state.selectedNodeId);
  const node = useCanvasStore(useShallow(state => {
    const selected = state.nodes.find(item => item.id === selectedNodeId);
    return selected ? {
      id: selected.id, label: selected.label, category: selected.category, headerColor: selected.headerColor,
      catalogId: selected.catalogId, ports: selected.ports, space: selected.space, vlanIds: selected.vlanIds, notes: selected.notes,
    } : null;
  }));
  const updateNode = useCanvasStore(state => state.updateNode);
  const deleteNode = useCanvasStore(state => state.deleteNode);
  const beginTransaction = useCanvasStore(state => state.beginTransaction);
  const commitTransaction = useCanvasStore(state => state.commitTransaction);
  const portLayer = useCanvasStore(state => state.portLayer);
  const spaces = useCanvasStore(state => state.spaces);
  const vlans = useCanvasStore(state => state.vlans);
  const setNodeVlanAssignment = useCanvasStore(state => state.setNodeVlanAssignment);
  useEffect(() => () => useCanvasStore.getState().commitTransaction(), [selectedNodeId]);
  if (!node) return null;
  const inputGroups = portGroups(node.ports.filter(p => p.side === 'input'));
  const outputGroups = portGroups(node.ports.filter(p => p.side === 'output'));
  const bidirectionalGroups = portGroups(node.ports.filter(p => p.side === 'bidirectional'));
  const applyGroups = (side: Port['side'], groups: PortGroup[]) => updateNode(node.id, { ports: [...node.ports.filter(p => p.side !== side), ...buildPorts(groups)] });
  const moveGroup = (side: Port['side'], groups: PortGroup[], from: number, to: number) => {
    const next = [...groups], [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applyGroups(side, next);
  };
  const patchAlias = (id: string, value: string) => updateNode(node.id, { ports: node.ports.map(p => p.id === id ? { ...p, aliases: Object.assign([...(p.aliases ?? [])], { [portLayer - 1]: value }) } : p) });
  const savePreset = () => {
    const saved = JSON.parse(localStorage.getItem(COMPONENTS_KEY) ?? '[]') as { label: string; category?: string }[];
    const preset = { id: crypto.randomUUID(), label: node.label, category: node.category || 'Custom', inputGroups, outputGroups, bidirectionalGroups };
    localStorage.setItem(COMPONENTS_KEY, JSON.stringify([...saved.filter(x => x.label !== preset.label || (x.category || 'Custom') !== preset.category), preset]));
    updateNode(node.id, { catalogId: preset.id });
    window.dispatchEvent(new Event('audiopatch-components-changed'));
  };

  return <section className="inspector" onFocusCapture={event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) beginTransaction();
  }} onBlurCapture={event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) commitTransaction();
  }}>
    <label>Name<input value={node.label} onChange={e => updateNode(node.id, { label: e.target.value })} /></label>
    <label>Category<select value={node.category} onChange={e => updateNode(node.id, { category: e.target.value, headerColor: CATEGORY_COLORS[e.target.value] ?? CATEGORY_COLORS.Custom })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
    <label>Color<input type="color" value={node.headerColor} onChange={e => updateNode(node.id, { headerColor: e.target.value })} /></label>
    <label>Space<select value={node.space ?? ''} onChange={e => updateNode(node.id, { space: e.target.value })}><option value="">No space</option>{spaces.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
    {hasEthernetPort(node) && <div className="vlan-assignments"><h3>VLANs</h3>{vlans.length ? [...vlans].sort((a, b) => a.tag - b.tag).map(vlan => <label key={vlan.id}><input type="checkbox" checked={node.vlanIds?.includes(vlan.id) ?? false} onChange={event => setNodeVlanAssignment(node.id, vlan.id, event.target.checked)} /><span className="vlan-swatch" style={{ background: vlan.color }} />VLAN {vlan.tag} · {vlan.name}</label>) : <p className="empty-state">Create a VLAN in Project to assign this networked component.</p>}</div>}
    <h3>Ports</h3>
    <b>Inputs</b>{inputGroups.map((g, i) => <div className="port-edit" key={`input-${i}`} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup('input', inputGroups, Number(e.dataTransfer.getData('text/plain')), i)}>
      <span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span>
      <input value={g.type} onChange={e => applyGroups('input', inputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} />
      <input type="number" min="0" value={g.amount} onChange={e => applyGroups('input', inputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} />
      <select value={g.signalType} onChange={e => applyGroups('input', inputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as SignalType } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select>
      <button onClick={() => applyGroups('input', inputGroups.filter((_, n) => n !== i))}>×</button>
    </div>)}
    <button onClick={() => applyGroups('input', [...inputGroups, { side: 'input', type: 'NEW INPUT', amount: 1, signalType: 'analog_audio', ids: [], aliases: [], groupId: crypto.randomUUID() }])}>+ input</button>
    <b>Outputs</b>{outputGroups.map((g, i) => <div className="port-edit" key={`output-${i}`} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup('output', outputGroups, Number(e.dataTransfer.getData('text/plain')), i)}>
      <span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span>
      <input value={g.type} onChange={e => applyGroups('output', outputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} />
      <input type="number" min="0" value={g.amount} onChange={e => applyGroups('output', outputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} />
      <select value={g.signalType} onChange={e => applyGroups('output', outputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as SignalType } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select>
      <button onClick={() => applyGroups('output', outputGroups.filter((_, n) => n !== i))}>×</button>
    </div>)}
    <b>Bidirectional</b>{bidirectionalGroups.map((g, i) => <div className="port-edit bidirectional" key={`bidirectional-${i}`} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup('bidirectional', bidirectionalGroups, Number(e.dataTransfer.getData('text/plain')), i)}>
      <span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span>
      <input value={g.type} onChange={e => applyGroups('bidirectional', bidirectionalGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} />
      <input type="number" min="0" value={g.amount} onChange={e => applyGroups('bidirectional', bidirectionalGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} />
      <select value={g.signalType} onChange={e => applyGroups('bidirectional', bidirectionalGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as SignalType } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select>
      <select aria-label="Port side" value={g.position ?? 'left'} onChange={e => applyGroups('bidirectional', bidirectionalGroups.map((x, n) => n === i ? { ...x, position: e.target.value as Port['position'] } : x))}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select>
      <button onClick={() => applyGroups('bidirectional', bidirectionalGroups.filter((_, n) => n !== i))}>×</button>
    </div>)}
    <div className="toolbar-actions"><button onClick={() => applyGroups('output', [...outputGroups, { side: 'output', type: 'NEW OUTPUT', amount: 1, signalType: 'analog_audio', ids: [], aliases: [], groupId: crypto.randomUUID() }])}>+ output</button><button onClick={() => applyGroups('bidirectional', [...bidirectionalGroups, { side: 'bidirectional', position: 'left', type: 'ETHERNET', amount: 1, signalType: 'ethernet', ids: [], aliases: [], groupId: crypto.randomUUID() }])}>+ bidirectional</button><button onClick={savePreset}>Save as preset</button></div>
    {portLayer > 0 && <><h3>Alias layer {portLayer}</h3>{node.ports.map(p => <label className="alias-edit" key={p.id}>{p.label}<input placeholder={p.label} value={p.aliases?.[portLayer - 1] ?? ''} onChange={e => patchAlias(p.id, e.target.value)} /></label>)}</>}
    <label>Notes<textarea value={node.notes ?? ''} onChange={e => updateNode(node.id, { notes: e.target.value })} /></label>
    <button className="danger" onClick={() => confirm('Delete this node?') && deleteNode(node.id)}>Delete node</button>
  </section>;
}
