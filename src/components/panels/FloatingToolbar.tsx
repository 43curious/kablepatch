import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_COLORS, NODE_TYPES, SIGNAL_TYPES, templateSignal } from '../../nodes/NodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import NodeInspector from './NodeInspector';

type PortGroup = { type: string; amount: number; signalType?: keyof typeof SIGNAL_TYPES };
type SavedComponent = { id: string; label: string; category: string; inputGroups: PortGroup[]; outputGroups: PortGroup[] };

const COMPONENTS_KEY = 'audiopatch-components';
const HIDDEN_KEY = 'audiopatch-hidden-components';
const labels = (groups: PortGroup[]) => groups.flatMap(g => Array.from({ length: Math.max(0, g.amount) }, (_, i) => ({ label: `${g.type || 'PORT'} ${i + 1}`, signalType: g.signalType ?? templateSignal(g.type) })));
const groupName = (label: string) => label.replace(/\s+\d+$/, '');
const portGroups = (ports: { label: string; signalType?: keyof typeof SIGNAL_TYPES }[]): PortGroup[] => Object.values(ports.reduce<Record<string, PortGroup>>((a, p) => {
  const type = groupName(p.label), key = `${type}:${p.signalType ?? templateSignal(type)}`;
  (a[key] ??= { type, amount: 0, signalType: p.signalType ?? templateSignal(type) }).amount++;
  return a;
}, {}));
const templateGroups = (xs: string[]): PortGroup[] => xs.map(label => {
  const m = label.match(/^(.*?)(\d+)-(\d+)(.*)$/);
  const type = m ? `${m[1]}${m[4]}`.replace(/\s{2,}/g, ' ').trim() : label;
  return { type, amount: m ? Number(m[3]) - Number(m[2]) + 1 : 1, signalType: templateSignal(type) };
});

export default function FloatingToolbar({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'create' | 'library'>('library');
  const [customLabel, setCustomLabel] = useState('Custom Device');
  const [customCategory, setCustomCategory] = useState('Custom');
  const [inputGroups, setInputGroups] = useState<PortGroup[]>([{ type: 'XLR', amount: 16, signalType: 'analog_audio' }]);
  const [outputGroups, setOutputGroups] = useState<PortGroup[]>([{ type: 'XLR OUT', amount: 8, signalType: 'analog_audio' }]);
  const [savedId, setSavedId] = useState('');
  const [saved, setSaved] = useState<SavedComponent[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const s = useCanvasStore();
  const aliasLayers = Math.max(1, ...s.nodes.flatMap(n => n.ports.map(p => p.aliases?.length ?? 0)));
  const selected = s.nodes.find(n => n.id === s.selectedNodeId);
  const selectedEdge = s.edges.find(e => e.id === s.selectedEdgeId);
  const edgeText = selectedEdge && (() => {
    const a = s.nodes.find(n => n.id === selectedEdge.sourceNodeId), b = s.nodes.find(n => n.id === selectedEdge.targetNodeId);
    const p = a?.ports.find(p => p.id === selectedEdge.sourcePortId), t = b?.ports.find(p => p.id === selectedEdge.targetPortId);
    return a && b && p && t ? `${a.label} / ${p.label} → ${b.label} / ${t.label}` : '';
  })();
  const categoryOptions = [...new Set([...Object.keys(CATEGORY_COLORS), ...saved.map(c => c.category || 'Custom')])];
  const matches = (label: string, category = '') => `${category} ${label}`.toLowerCase().includes(q.toLowerCase());
  const groups = useMemo(() => NODE_TYPES.filter(n => !hidden.includes(n.id) && matches(n.label, n.category)).reduce<Record<string, typeof NODE_TYPES>>((a, n) => ((a[n.category] ??= []).push(n), a), {}), [q, hidden]);
  const savedGroups = useMemo(() => saved.filter(c => matches(c.label, c.category)).reduce<Record<string, SavedComponent[]>>((a, c) => ((a[c.category || 'Custom'] ??= []).push(c), a), {}), [saved, q]);

  useEffect(() => {
    const withTypes = (groups: PortGroup[]) => groups.map(g => ({ ...g, signalType: g.signalType ?? templateSignal(g.type) }));
    const load = () => setSaved((JSON.parse(localStorage.getItem(COMPONENTS_KEY) ?? '[]') as SavedComponent[]).map(c => ({ ...c, category: c.category || 'Custom', inputGroups: withTypes(c.inputGroups), outputGroups: withTypes(c.outputGroups) })));
    load(); setHidden(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'));
    window.addEventListener('audiopatch-components-changed', load);
    return () => window.removeEventListener('audiopatch-components-changed', load);
  }, []);
  useEffect(() => localStorage.setItem(COMPONENTS_KEY, JSON.stringify(saved)), [saved]);
  useEffect(() => localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)), [hidden]);

  const center = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: ((r?.width ?? 1000) / 2 - s.viewport.x) / s.viewport.zoom, y: ((r?.height ?? 700) / 2 - s.viewport.y) / s.viewport.zoom };
  };
  const current = (): SavedComponent => ({ id: savedId || crypto.randomUUID(), label: customLabel || 'Custom Device', category: customCategory, inputGroups, outputGroups });
  const loadComponent = (id: string) => {
    if (!id) return resetForm();
    setSavedId(id);
    const c = saved.find(x => x.id === id);
    if (!c) return resetForm();
    setCustomLabel(c.label); setCustomCategory(c.category || 'Custom'); setInputGroups(c.inputGroups); setOutputGroups(c.outputGroups);
  };
  const resetForm = () => { setSavedId(''); setCustomLabel('Custom Device'); setCustomCategory('Custom'); setInputGroups([{ type: 'XLR', amount: 16, signalType: 'analog_audio' }]); setOutputGroups([{ type: 'XLR OUT', amount: 8, signalType: 'analog_audio' }]); };
  const saveComponent = () => {
    const c = current(), updating = !!savedId;
    setSaved(xs => savedId ? xs.map(x => x.id === savedId ? c : x) : [...xs.filter(x => x.label !== c.label || x.category !== c.category), c]);
    setSavedId(c.id); setTab('library'); setNotice(updating ? 'Library updated' : 'Added to library');
    setTimeout(() => setNotice(''), 1800);
  };
  const addCurrent = () => s.addCustomNode(customLabel, labels(inputGroups), labels(outputGroups), center(), customCategory);
  const moveGroup = (groups: PortGroup[], setGroups: (groups: PortGroup[]) => void, from: number, to: number) => {
    const next = [...groups], [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setGroups(next);
  };
  const saveSelected = () => {
    if (!selected) return;
    const c = { id: crypto.randomUUID(), label: selected.label, category: selected.category || 'Custom', inputGroups: portGroups(selected.ports.filter(p => p.side === 'input')), outputGroups: portGroups(selected.ports.filter(p => p.side === 'output')) };
    setSaved(xs => [...xs.filter(x => x.label !== c.label || x.category !== c.category), c]);
  };
  const editSaved = (c: SavedComponent) => {
    setTab('create'); setSavedId(c.id); setCustomLabel(c.label); setCustomCategory(c.category || 'Custom'); setInputGroups(c.inputGroups); setOutputGroups(c.outputGroups);
  };
  const removeSaved = (c: SavedComponent) => {
    if (!confirm(`Remove ${c.label} from your catalog?`)) return;
    setSaved(xs => xs.filter(x => x.id !== c.id));
    if (savedId === c.id) resetForm();
    setNotice('Removed from catalog'); setTimeout(() => setNotice(''), 1800);
  };
  const editTemplate = (n: typeof NODE_TYPES[number]) => {
    setTab('create'); setSavedId(''); setCustomLabel(n.label); setCustomCategory(n.category); setInputGroups(templateGroups(n.defaultInputs)); setOutputGroups(templateGroups(n.defaultOutputs));
  };
  const download = (name: string, type: string, text: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const exportSvg = () => {
    const svg = svgRef.current?.cloneNode(true) as SVGSVGElement | undefined;
    if (!svg) return;
    svg.insertAdjacentHTML('afterbegin', `<title>AudioPatch diagram</title><metadata>${new Date().toISOString()}</metadata>`);
    download('audiopatch-diagram.svg', 'image/svg+xml', new XMLSerializer().serializeToString(svg));
  };
  const exportCsv = () => {
    const row = (xs: string[]) => xs.map(x => `"${x.replaceAll('"', '""')}"`).join(',');
    const lines = [row(['Source Device', 'Source Port', 'Signal Type', 'Target Device', 'Target Port', 'Notes'])];
    for (const e of s.edges) {
      const a = s.nodes.find(n => n.id === e.sourceNodeId), b = s.nodes.find(n => n.id === e.targetNodeId);
      const p = a?.ports.find(p => p.id === e.sourcePortId), t = b?.ports.find(p => p.id === e.targetPortId);
      if (a && b && p && t) lines.push(row([a.label, p.label, SIGNAL_TYPES[p.signalType].label, b.label, t.label, b.notes ?? '']));
    }
    download('audiopatch-connections.csv', 'text/csv', lines.join('\n'));
  };

  return <div className="side-stack"><aside className={`toolbar ${selected ? 'expanded' : ''}`}>
    <button className="collapse" onClick={() => setOpen(!open)}>{open ? '−' : '+'}</button>
    {open && <>
      <div className="panel-title"><span>{selected ? 'Selected device' : 'Patch catalog'}</span><h2>{selected ? 'Inspector' : 'AudioPatch'}</h2></div>
      {selected ? <><label>Port label layer<select value={s.portLayer} onChange={e => s.setPortLayer(Number(e.target.value))}><option value={0}>Base names</option>{Array.from({ length: aliasLayers }, (_, i) => <option key={i + 1} value={i + 1}>Alias layer {i + 1}</option>)}</select></label><div className="toolbar-actions"><button onClick={() => s.selectNode(null)}>← Catalog</button><button onClick={() => { const name = prompt('Space name'); if (name) s.addSpace(name); }}>+ Space</button><button onClick={s.autoAlign}>Auto align</button></div><NodeInspector /></> : <>
        <div className="tabs"><button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>Create</button><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>Library</button></div>
        {notice && <div className="notice">{notice}</div>}
        <label>Port label layer<select value={s.portLayer} onChange={e => s.setPortLayer(Number(e.target.value))}><option value={0}>Base names</option>{Array.from({ length: aliasLayers }, (_, i) => <option key={i + 1} value={i + 1}>Alias layer {i + 1}</option>)}</select></label>
        <div className="toolbar-actions"><button onClick={() => { const name = prompt('Space name'); if (name) s.addSpace(name); }}>+ Space</button><button onClick={s.autoAlign}>Auto align</button><button onClick={s.undo}>Undo</button><button onClick={s.redo}>Redo</button><button onClick={exportSvg}>SVG</button><button onClick={exportCsv}>CSV</button></div>
        {s.spaces.length > 0 && <div className="space-list">{s.spaces.map(x => <span key={x.name}><input type="color" value={x.color} onChange={e => s.updateSpace(x.name, { color: e.target.value })} />{x.name}<button onClick={() => confirm(`Delete ${x.name}?`) && s.deleteSpace(x.name)}>×</button></span>)}</div>}
        {tab === 'create' && <div className="tab-panel custom-object">
          <label>Name<input placeholder="Object name" value={customLabel} onChange={e => setCustomLabel(e.target.value)} /></label>
          <label>Library category<input list="library-categories" placeholder="Category" value={customCategory} onChange={e => setCustomCategory(e.target.value || 'Custom')} /></label>
          <datalist id="library-categories">{categoryOptions.map(c => <option key={c} value={c} />)}</datalist>
          <label>Preset to edit<select value={savedId} onChange={e => loadComponent(e.target.value)}><option value="">New preset</option>{[...saved].sort((a, b) => `${a.category}/${a.label}`.localeCompare(`${b.category}/${b.label}`)).map(c => <option key={c.id} value={c.id}>{c.category} / {c.label}</option>)}</select></label>
          {savedId && <button className="remove-preset" onClick={() => { const c = saved.find(x => x.id === savedId); if (c) removeSaved(c); }}>Remove this preset</button>}
          <b>Inputs</b>{inputGroups.map((g, i) => <div className="port-group" key={i} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup(inputGroups, setInputGroups, Number(e.dataTransfer.getData('text/plain')), i)}><span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span><input aria-label="Input type" placeholder="Type" value={g.type} onChange={e => setInputGroups(inputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} /><input aria-label="Input amount" type="number" min="0" value={g.amount} onChange={e => setInputGroups(inputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} /><select aria-label="Input connector type" value={g.signalType ?? templateSignal(g.type)} onChange={e => setInputGroups(inputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as keyof typeof SIGNAL_TYPES } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select><button onClick={() => setInputGroups(inputGroups.filter((_, n) => n !== i))}>×</button></div>)}
          <button onClick={() => setInputGroups([...inputGroups, { type: '', amount: 1, signalType: 'analog_audio' }])}>+ input group</button>
          <b>Outputs</b>{outputGroups.map((g, i) => <div className="port-group" key={i} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup(outputGroups, setOutputGroups, Number(e.dataTransfer.getData('text/plain')), i)}><span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span><input aria-label="Output type" placeholder="Type" value={g.type} onChange={e => setOutputGroups(outputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} /><input aria-label="Output amount" type="number" min="0" value={g.amount} onChange={e => setOutputGroups(outputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} /><select aria-label="Output connector type" value={g.signalType ?? templateSignal(g.type)} onChange={e => setOutputGroups(outputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as keyof typeof SIGNAL_TYPES } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select><button onClick={() => setOutputGroups(outputGroups.filter((_, n) => n !== i))}>×</button></div>)}
          <button onClick={() => setOutputGroups([...outputGroups, { type: '', amount: 1, signalType: 'analog_audio' }])}>+ output group</button>
          <div className="toolbar-actions form-actions"><button className="primary" onClick={addCurrent}>Add to canvas</button><button onClick={saveComponent}>{savedId ? 'Update preset' : 'Save preset'}</button><button onClick={resetForm}>New</button></div>
        </div>}
        {tab === 'library' && <div className="tab-panel catalog">
          <input aria-label="Search catalog" placeholder="Search devices and presets…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="catalog-tools"><span>{saved.length} saved preset{saved.length === 1 ? '' : 's'}</span><div><button className="primary" onClick={() => { resetForm(); setTab('create'); }}>+ New preset</button>{hidden.length > 0 && <button onClick={() => setHidden([])}>Restore catalog</button>}</div></div>
          <div className="node-list">
            {[...new Set([...Object.keys(savedGroups), ...Object.keys(groups)])].sort().map(cat => <details key={cat} open><summary style={{ color: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Custom }}>{cat}</summary>
              {(savedGroups[cat] ?? []).sort((a, b) => a.label.localeCompare(b.label)).map(c => <div className="preset-row saved-preset" key={c.id}><button className="preset-add" onClick={() => s.addCustomNode(c.label, labels(c.inputGroups), labels(c.outputGroups), center(), c.category)}><span aria-hidden="true">💾</span><span>{c.label}<small>{c.inputGroups.reduce((n, g) => n + g.amount, 0)} in · {c.outputGroups.reduce((n, g) => n + g.amount, 0)} out</small></span></button><div className="preset-actions"><button onClick={() => editSaved(c)}>Edit</button><button className="remove" onClick={() => removeSaved(c)}>Remove</button></div></div>)}
              {(groups[cat] ?? []).map(n => <div className="preset-row" key={n.id}><button className="preset-add" onClick={() => s.addNode(n.id, center())}><span aria-hidden="true">{n.icon}</span><span>{n.label}<small>Built-in device</small></span></button><div className="preset-actions"><button onClick={() => editTemplate(n)}>Customize</button><button className="remove" onClick={() => confirm(`Remove ${n.label} from the catalog?`) && setHidden(xs => [...xs, n.id])}>Remove</button></div></div>)}
            </details>)}
            {!Object.keys(savedGroups).length && !Object.keys(groups).length && <p className="empty-state">No catalog entries match “{q}”.</p>}
          </div>
        </div>}
      </>}
    </>}
  </aside>{edgeText && <div className="connection-info"><b>Connection</b><br />{edgeText}</div>}</div>;
}
