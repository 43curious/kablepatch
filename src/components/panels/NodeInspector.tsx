import { CATEGORY_COLORS, SIGNAL_TYPES } from '../../nodes/NodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import type { Port, SignalType } from '../../types/graph';

type PortGroup = { side: Port['side']; type: string; amount: number; signalType: SignalType; ids: string[]; aliases: (string[] | undefined)[]; before?: string; after?: string };

const COMPONENTS_KEY = 'audiopatch-components';
const compact = (s: string) => s.replace(/\s{2,}/g, ' ').trim();
const portInfo = (label: string) => {
  const m = label.match(/^(.*\s)\d+(\D*)$/);
  return m ? { type: compact(`${m[1]}${m[2]}`), before: m[1], after: m[2] } : { type: label };
};
const portGroups = (ports: Port[]) => Object.values(ports.reduce<Record<string, PortGroup>>((a, p) => {
  const info = portInfo(p.label), key = `${p.side}:${info.type}:${p.signalType}`;
  (a[key] ??= { ...info, side: p.side, amount: 0, signalType: p.signalType, ids: [], aliases: [] }).amount++;
  a[key].ids.push(p.id); a[key].aliases.push(p.aliases);
  return a;
}, {}));
const labelFor = (g: PortGroup, i: number) => g.before && compact(`${g.before}${g.after ?? ''}`) === g.type ? `${g.before}${i + 1}${g.after ?? ''}` : g.amount === 1 ? (g.type || 'PORT') : `${g.type || 'PORT'} ${i + 1}`;
const buildPorts = (groups: PortGroup[]): Port[] => groups.flatMap(g => Array.from({ length: Math.max(0, g.amount) }, (_, i) => ({ id: g.ids[i] ?? crypto.randomUUID(), label: labelFor(g, i), side: g.side, signalType: g.signalType, aliases: g.aliases[i] })));

export default function NodeInspector() {
  const { nodes, selectedNodeId, updateNode, deleteNode, portLayer, spaces } = useCanvasStore();
  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;
  const inputGroups = portGroups(node.ports.filter(p => p.side === 'input'));
  const outputGroups = portGroups(node.ports.filter(p => p.side === 'output'));
  const applyGroups = (side: Port['side'], groups: PortGroup[]) => updateNode(node.id, { ports: side === 'input' ? [...buildPorts(groups), ...node.ports.filter(p => p.side === 'output')] : [...node.ports.filter(p => p.side === 'input'), ...buildPorts(groups)] });
  const moveGroup = (side: Port['side'], groups: PortGroup[], from: number, to: number) => {
    const next = [...groups], [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applyGroups(side, next);
  };
  const patchAlias = (id: string, value: string) => updateNode(node.id, { ports: node.ports.map(p => p.id === id ? { ...p, aliases: Object.assign([...(p.aliases ?? [])], { [portLayer - 1]: value }) } : p) });
  const savePreset = () => {
    const saved = JSON.parse(localStorage.getItem(COMPONENTS_KEY) ?? '[]') as { label: string; category?: string }[];
    const preset = { id: crypto.randomUUID(), label: node.label, category: node.category || 'Custom', inputGroups, outputGroups };
    localStorage.setItem(COMPONENTS_KEY, JSON.stringify([...saved.filter(x => x.label !== preset.label || (x.category || 'Custom') !== preset.category), preset]));
    window.dispatchEvent(new Event('audiopatch-components-changed'));
  };

  return <section className="inspector">
    <label>Name<input value={node.label} onChange={e => updateNode(node.id, { label: e.target.value })} /></label>
    <label>Category<select value={node.category} onChange={e => updateNode(node.id, { category: e.target.value, headerColor: CATEGORY_COLORS[e.target.value] ?? node.headerColor })}>{Object.keys(CATEGORY_COLORS).map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Color<input type="color" value={node.headerColor} onChange={e => updateNode(node.id, { headerColor: e.target.value })} /></label>
    <label>Space<select value={node.space ?? ''} onChange={e => updateNode(node.id, { space: e.target.value })}><option value="">No space</option>{spaces.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
    <h3>Ports</h3>
    <b>Inputs</b>{inputGroups.map((g, i) => <div className="port-edit" key={`input-${i}`} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup('input', inputGroups, Number(e.dataTransfer.getData('text/plain')), i)}>
      <span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span>
      <input value={g.type} onChange={e => applyGroups('input', inputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} />
      <input type="number" min="0" value={g.amount} onChange={e => applyGroups('input', inputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} />
      <select value={g.signalType} onChange={e => applyGroups('input', inputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as SignalType } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select>
      <button onClick={() => applyGroups('input', inputGroups.filter((_, n) => n !== i))}>×</button>
    </div>)}
    <button onClick={() => applyGroups('input', [...inputGroups, { side: 'input', type: 'XLR IN', amount: 1, signalType: 'analog_audio', ids: [], aliases: [] }])}>+ input</button>
    <b>Outputs</b>{outputGroups.map((g, i) => <div className="port-edit" key={`output-${i}`} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup('output', outputGroups, Number(e.dataTransfer.getData('text/plain')), i)}>
      <span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span>
      <input value={g.type} onChange={e => applyGroups('output', outputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} />
      <input type="number" min="0" value={g.amount} onChange={e => applyGroups('output', outputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} />
      <select value={g.signalType} onChange={e => applyGroups('output', outputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as SignalType } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select>
      <button onClick={() => applyGroups('output', outputGroups.filter((_, n) => n !== i))}>×</button>
    </div>)}
    <div className="toolbar-actions"><button onClick={() => applyGroups('output', [...outputGroups, { side: 'output', type: 'XLR OUT', amount: 1, signalType: 'analog_audio', ids: [], aliases: [] }])}>+ output</button><button onClick={savePreset}>Save preset</button></div>
    {portLayer > 0 && <><h3>Alias layer {portLayer}</h3>{node.ports.map(p => <label className="alias-edit" key={p.id}>{p.label}<input placeholder={p.label} value={p.aliases?.[portLayer - 1] ?? ''} onChange={e => patchAlias(p.id, e.target.value)} /></label>)}</>}
    <label>Notes<textarea value={node.notes ?? ''} onChange={e => updateNode(node.id, { notes: e.target.value })} /></label>
    <button className="danger" onClick={() => confirm('Delete this node?') && deleteNode(node.id)}>Delete node</button>
  </section>;
}
