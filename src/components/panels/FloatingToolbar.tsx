import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CATEGORY_COLORS, NODE_TYPES, SIGNAL_TYPES, templateSignal } from '../../nodes/NodeTypes';
import { useCanvasStore } from '../../store/canvasStore';
import NodeInspector from './NodeInspector';
import { canvasJson, openCanvasFile, protectedViewJson } from '../canvas/share';
import type { CanvasDocument } from '../canvas/share';
import { canvasDataFromState } from '../../store/canvasDocument';
import { createGraphIndex, resolveEdge } from '../../graph/indexes';
import { hasEthernetPort } from '../../types/graph';

type PortGroup = { type: string; amount: number; signalType?: keyof typeof SIGNAL_TYPES; position?: 'left' | 'right' | 'top' | 'bottom' };
type SavedComponent = { id: string; label: string; category: string; manualUrl?: string; inputGroups: PortGroup[]; outputGroups: PortGroup[]; bidirectionalGroups?: PortGroup[]; templateId?: string };
type CategoryCatalog = { sections: string[]; assignments: Record<string, string>; categoryOrder: string[]; deletedCategories: string[] };

const COMPONENTS_KEY = 'audiopatch-components';
const HIDDEN_KEY = 'audiopatch-hidden-components';
const CATEGORY_KEY = 'audiopatch-category-catalog';
const CATEGORY_SECTIONS: Record<string, string> = {
  'Audio Consoles': 'Audio',
  'Audio Interfaces / Converters': 'Audio',
  'Processors / DSP': 'Audio',
  Monitoring: 'Audio',
  Infrastructure: 'Infrastructure',
  'Video Switchers': 'Video',
  'Video Routers': 'Video',
  'Broadcast Cameras': 'Video',
  'Playback / Recording': 'Computers',
  'Intercom / Comms': 'Communications',
  'Patch Bays': 'Infrastructure',
  Custom: 'Custom',
};
const defaultCatalog = (): CategoryCatalog => ({ sections: [...new Set([...Object.values(CATEGORY_SECTIONS), 'Other'])], assignments: { ...CATEGORY_SECTIONS }, categoryOrder: Object.keys(CATEGORY_SECTIONS), deletedCategories: [] });
const labels = (groups: PortGroup[]) => groups.flatMap(g => Array.from({ length: Math.max(0, g.amount) }, (_, i) => ({ label: `${g.type || 'PORT'} ${i + 1}`, signalType: g.signalType ?? templateSignal(g.type), position: g.position })));
const groupName = (label: string) => label.replace(/\s+\d+$/, '');
const portGroups = (ports: { label: string; signalType?: keyof typeof SIGNAL_TYPES; position?: PortGroup['position'] }[]): PortGroup[] => Object.values(ports.reduce<Record<string, PortGroup>>((a, p) => {
  const type = groupName(p.label), key = `${type}:${p.signalType ?? templateSignal(type)}:${p.position ?? ''}`;
  (a[key] ??= { type, amount: 0, signalType: p.signalType ?? templateSignal(type), position: p.position }).amount++;
  return a;
}, {}));
const specsUrl = (label: string, value?: string) => {
  try { const url = new URL(value ?? ''); if (['http:', 'https:'].includes(url.protocol)) return url.href; } catch { /* Use documentation search below. */ }
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${label} technical specifications manual PDF`)}`;
};
const templateGroups = (xs: string[]): PortGroup[] => xs.map(label => {
  const m = label.match(/^(.*?)(\d+)-(\d+)(.*)$/);
  const type = m ? `${m[1]}${m[4]}`.replace(/\s{2,}/g, ' ').trim() : label;
  return { type, amount: m ? Number(m[3]) - Number(m[2]) + 1 : 1, signalType: templateSignal(type) };
});

export default function FloatingToolbar({ svgRef, onOpenCanvas, onAutoAlign }: { svgRef: React.RefObject<SVGSVGElement | null>; onOpenCanvas: (document: CanvasDocument, merge?: boolean) => void; onAutoAlign: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const fileMode = useRef<'open' | 'import'>('open');
  const [q, setQ] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'presets' | 'add' | 'project' | 'export'>('add');
  const [presetTab, setPresetTab] = useState<'inspector' | 'create'>('create');
  const [customLabel, setCustomLabel] = useState('Custom Device');
  const [customCategory, setCustomCategory] = useState('Custom');
  const [customManualUrl, setCustomManualUrl] = useState('');
  const [inputGroups, setInputGroups] = useState<PortGroup[]>([{ type: 'XLR', amount: 16, signalType: 'analog_audio' }]);
  const [outputGroups, setOutputGroups] = useState<PortGroup[]>([{ type: 'XLR OUT', amount: 8, signalType: 'analog_audio' }]);
  const [bidirectionalGroups, setBidirectionalGroups] = useState<PortGroup[]>([]);
  const [savedId, setSavedId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [saved, setSaved] = useState<SavedComponent[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [categoryCatalog, setCategoryCatalog] = useState<CategoryCatalog>(defaultCatalog);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [manageCategories, setManageCategories] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<CategoryCatalog>(defaultCatalog);
  const [newSection, setNewSection] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [vlanTag, setVlanTag] = useState('10');
  const [vlanName, setVlanName] = useState('');
  const [vlanColor, setVlanColor] = useState('#22c55e');
  const [notice, setNotice] = useState('');
  const selectedNodeId = useCanvasStore(state => state.selectedNodeId);
  const selectedNodeIds = useCanvasStore(state => state.selectedNodeIds);
  const selected = useCanvasStore(useShallow(state => {
    const node = state.nodes.find(item => item.id === selectedNodeId);
    return node ? { id: node.id, label: node.label, category: node.category, catalogId: node.catalogId, ports: node.ports } : null;
  }));
  const portCollections = useCanvasStore(useShallow(state => state.nodes.map(node => node.ports)));
  const nodeCategories = useCanvasStore(useShallow(state => state.nodes.map(node => node.category || 'Custom')));
  const s = useCanvasStore(useShallow(state => ({
    nodes: state.nodes, portLayer: state.portLayer, spaces: state.spaces, vlans: state.vlans, selectedVlanId: state.selectedVlanId, setPortLayer: state.setPortLayer,
    addSpace: state.addSpace, updateSpace: state.updateSpace, deleteSpace: state.deleteSpace,
    addVlan: state.addVlan, updateVlan: state.updateVlan, deleteVlan: state.deleteVlan, selectVlan: state.selectVlan, setNodeVlanAssignment: state.setNodeVlanAssignment,
    addNode: state.addNode, addCustomNode: state.addCustomNode, updateCatalogCategory: state.updateCatalogCategory,
    reassignCategory: state.reassignCategory,
  })));
  const aliasLayers = useMemo(() => Math.max(1, ...portCollections.flatMap(ports => ports.map(port => port.aliases?.length ?? 0))), [portCollections]);
  const categoryNames = [...new Set([...Object.keys(CATEGORY_COLORS), ...Object.keys(categoryCatalog.assignments), ...saved.map(c => c.category || 'Custom'), ...nodeCategories])].filter(category => !categoryCatalog.deletedCategories.includes(category)).sort();
  const categoryOptions = categoryNames;
  const draftCategories = [...new Set([...categoryNames, ...Object.keys(categoryDraft.assignments)])].filter(category => !categoryDraft.deletedCategories.includes(category)).sort((a, b) => (categoryDraft.categoryOrder.indexOf(a) < 0 ? Infinity : categoryDraft.categoryOrder.indexOf(a)) - (categoryDraft.categoryOrder.indexOf(b) < 0 ? Infinity : categoryDraft.categoryOrder.indexOf(b)) || a.localeCompare(b));
  const matches = (label: string, category = '') => `${category} ${label}`.toLowerCase().includes(q.toLowerCase());
  const groups = useMemo(() => NODE_TYPES.filter(n => !hidden.includes(n.id) && !saved.some(c => c.templateId === n.id) && matches(n.label, n.category)).reduce<Record<string, typeof NODE_TYPES>>((a, n) => (((a[categoryCatalog.deletedCategories.includes(n.category) ? 'Other' : n.category] ??= []).push(n)), a), {}), [q, hidden, saved, categoryCatalog.deletedCategories]);
  const savedGroups = useMemo(() => saved.filter(c => matches(c.label, c.category)).reduce<Record<string, SavedComponent[]>>((a, c) => (((a[categoryCatalog.deletedCategories.includes(c.category) ? 'Other' : c.category] ??= []).push(c)), a), {}), [saved, q, categoryCatalog.deletedCategories]);
  const catalogSections = useMemo(() => {
    const categories = [...new Set([...Object.keys(savedGroups), ...Object.keys(groups)])];
    const rank = new Map(categoryCatalog.categoryOrder.map((category, i) => [category, i]));
    return Object.entries(categories.reduce<Record<string, string[]>>((all, category) => ((all[categoryCatalog.assignments[category] ?? 'Other'] ??= []).push(category), all), {})).map(([section, subcategories]) => [section, subcategories.sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b))] as [string, string[]]).sort(([a], [b]) => (categoryCatalog.sections.indexOf(a) < 0 ? Infinity : categoryCatalog.sections.indexOf(a)) - (categoryCatalog.sections.indexOf(b) < 0 ? Infinity : categoryCatalog.sections.indexOf(b)) || a.localeCompare(b));
  }, [groups, savedGroups, categoryCatalog]);

  useEffect(() => {
    const withTypes = (groups: PortGroup[]) => groups.map(g => ({ ...g, signalType: g.signalType ?? templateSignal(g.type) }));
    const parseArray = <T,>(key: string): T[] => {
      try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
    };
    const load = () => setSaved(parseArray<SavedComponent>(COMPONENTS_KEY).map(c => ({ ...c, category: c.category || 'Custom', inputGroups: withTypes(c.inputGroups ?? []), outputGroups: withTypes(c.outputGroups ?? []), bidirectionalGroups: withTypes(c.bidirectionalGroups ?? []) })));
    load(); setHidden(parseArray<string>(HIDDEN_KEY));
    try {
      const storedCatalog = JSON.parse(localStorage.getItem(CATEGORY_KEY) ?? 'null') as Partial<CategoryCatalog> | null;
      if (storedCatalog && Array.isArray(storedCatalog.sections) && storedCatalog.assignments) {
        const defaults = defaultCatalog();
        setCategoryCatalog({ sections: [...new Set([...defaults.sections, ...storedCatalog.sections])], assignments: { ...defaults.assignments, ...storedCatalog.assignments }, categoryOrder: [...new Set([...(storedCatalog.categoryOrder ?? []), ...defaults.categoryOrder, ...Object.keys(storedCatalog.assignments)])], deletedCategories: storedCatalog.deletedCategories ?? [] });
      }
    } catch { /* Keep the default category catalog when storage is corrupt. */ }
    setCategoriesLoaded(true);
    window.addEventListener('audiopatch-components-changed', load);
    return () => window.removeEventListener('audiopatch-components-changed', load);
  }, []);
  useEffect(() => { if (categoriesLoaded) localStorage.setItem(COMPONENTS_KEY, JSON.stringify(saved)); }, [saved, categoriesLoaded]);
  useEffect(() => { if (categoriesLoaded) localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)); }, [hidden, categoriesLoaded]);
  useEffect(() => { if (categoriesLoaded) localStorage.setItem(CATEGORY_KEY, JSON.stringify(categoryCatalog)); }, [categoryCatalog, categoriesLoaded]);
  useEffect(() => {
    if (selectedNodeId && selectedNodeIds.length === 1) { setOpen(true); setTab('presets'); setPresetTab('inspector'); }
  }, [selectedNodeId, selectedNodeIds]);

  const center = () => {
    const r = svgRef.current?.getBoundingClientRect(), viewport = useCanvasStore.getState().viewport;
    return { x: ((r?.width ?? 1000) / 2 - viewport.x) / viewport.zoom, y: ((r?.height ?? 700) / 2 - viewport.y) / viewport.zoom };
  };
  const current = (): SavedComponent => ({ id: savedId || crypto.randomUUID(), label: customLabel || 'Custom Device', category: customCategory, manualUrl: customManualUrl.trim() || undefined, inputGroups, outputGroups, bidirectionalGroups, templateId: templateId || undefined });
  const loadComponent = (id: string) => {
    if (!id) return resetForm();
    setSavedId(id);
    const c = saved.find(x => x.id === id);
    if (!c) return resetForm();
    setTemplateId(c.templateId ?? ''); setCustomLabel(c.label); setCustomCategory(c.category || 'Custom'); setCustomManualUrl(c.manualUrl ?? ''); setInputGroups(c.inputGroups); setOutputGroups(c.outputGroups); setBidirectionalGroups(c.bidirectionalGroups ?? []);
  };
  const resetForm = () => { setSavedId(''); setTemplateId(''); setCustomLabel('Custom Device'); setCustomCategory('Custom'); setCustomManualUrl(''); setInputGroups([{ type: 'XLR', amount: 16, signalType: 'analog_audio' }]); setOutputGroups([{ type: 'XLR OUT', amount: 8, signalType: 'analog_audio' }]); setBidirectionalGroups([]); };
  const saveComponent = () => {
    const c = current(), updating = !!(savedId || templateId), previousLabel = saved.find(x => x.id === savedId)?.label ?? c.label;
    setSaved(xs => savedId ? xs.map(x => x.id === savedId ? c : x) : [...xs.filter(x => x.label !== c.label || x.category !== c.category), c]);
    if (updating) s.updateCatalogCategory(c.templateId || c.id, c.category, previousLabel);
    setSavedId(c.id); setTab('add'); setNotice(updating ? 'Library and canvas updated' : 'Added to library');
    setTimeout(() => setNotice(''), 1800);
  };
  const addCurrent = () => s.addCustomNode(customLabel, labels(inputGroups), labels(outputGroups), center(), customCategory, templateId || savedId || undefined, labels(bidirectionalGroups));
  const moveGroup = (groups: PortGroup[], setGroups: (groups: PortGroup[]) => void, from: number, to: number) => {
    const next = [...groups], [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setGroups(next);
  };
  const saveSelected = () => {
    if (!selected) return;
    const c = { id: crypto.randomUUID(), label: selected.label, category: selected.category || 'Custom', manualUrl: saved.find(item => item.id === selected.catalogId || item.templateId === selected.catalogId)?.manualUrl, inputGroups: portGroups(selected.ports.filter(p => p.side === 'input')), outputGroups: portGroups(selected.ports.filter(p => p.side === 'output')), bidirectionalGroups: portGroups(selected.ports.filter(p => p.side === 'bidirectional')) };
    setSaved(xs => [...xs.filter(x => x.label !== c.label || x.category !== c.category), c]);
  };
  const editSaved = (c: SavedComponent) => {
    setTab('presets'); setPresetTab('create'); setSavedId(c.id); setTemplateId(c.templateId ?? ''); setCustomLabel(c.label); setCustomCategory(c.category || 'Custom'); setCustomManualUrl(c.manualUrl ?? ''); setInputGroups(c.inputGroups); setOutputGroups(c.outputGroups); setBidirectionalGroups(c.bidirectionalGroups ?? []);
  };
  const removeSaved = (c: SavedComponent) => {
    if (!confirm(`Remove ${c.label} from your catalog?`)) return;
    setSaved(xs => xs.filter(x => x.id !== c.id));
    if (savedId === c.id) resetForm();
    setNotice('Removed from catalog'); setTimeout(() => setNotice(''), 1800);
  };
  const openCategoryManager = () => { setCategoryDraft({ sections: [...categoryCatalog.sections], assignments: { ...categoryCatalog.assignments }, categoryOrder: [...categoryCatalog.categoryOrder], deletedCategories: [...categoryCatalog.deletedCategories] }); setManageCategories(true); };
  const saveCategories = () => {
    const removed = categoryDraft.deletedCategories.filter(category => !categoryCatalog.deletedCategories.includes(category));
    const state = useCanvasStore.getState();
    const moved = saved.filter(item => removed.includes(item.category)).length + state.nodes.filter(node => removed.includes(node.category)).length;
    if (removed.length) {
      setSaved(items => items.map(item => removed.includes(item.category) ? { ...item, category: 'Other' } : item));
      removed.forEach(category => state.reassignCategory(category, 'Other'));
    }
    setCategoryCatalog(categoryDraft); setManageCategories(false); setNotice(removed.length ? `Moved ${moved} library items to Other` : 'Category layout saved'); setTimeout(() => setNotice(''), 1800);
  };
  const addSection = () => {
    const name = newSection.trim();
    if (!name || categoryDraft.sections.includes(name)) return;
    setCategoryDraft(x => ({ ...x, sections: [...x.sections, name] })); setNewSection('');
  };
  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || categoryDraft.assignments[name]) return;
    setCategoryDraft(x => ({ ...x, assignments: { ...x.assignments, [name]: x.sections[0] ?? 'Other' }, categoryOrder: [...x.categoryOrder, name], deletedCategories: x.deletedCategories.filter(category => category !== name) })); setNewCategory('');
  };
  const deleteCategory = (category: string) => {
    if (!confirm(`Delete ${category}? Its library and canvas items will move to Other when you save.`)) return;
    setCategoryDraft(x => ({ ...x, assignments: Object.fromEntries(Object.entries(x.assignments).filter(([name]) => name !== category)), categoryOrder: x.categoryOrder.filter(name => name !== category), deletedCategories: [...new Set([...x.deletedCategories, category])] }));
  };
  const deleteSection = (section: string) => {
    if (section === 'Other' || !confirm(`Delete ${section}? Its subcategories will move to Other.`)) return;
    setCategoryDraft(x => ({ ...x, sections: x.sections.filter(name => name !== section), assignments: Object.fromEntries(Object.entries(x.assignments).map(([category, parent]) => [category, parent === section ? 'Other' : parent])) }));
  };
  const moveSection = (section: string, target: string) => setCategoryDraft(x => {
    if (section === target) return x;
    const sections = x.sections.filter(name => name !== section), index = sections.indexOf(target);
    sections.splice(index < 0 ? sections.length : index, 0, section);
    return { ...x, sections };
  });
  const moveCategory = (category: string, section: string, before?: string) => setCategoryDraft(x => {
    if (category === before) return x;
    const categoryOrder = x.categoryOrder.filter(name => name !== category);
    const assignments = { ...x.assignments, [category]: section };
    const index = before ? categoryOrder.indexOf(before) : categoryOrder.reduce((last, name, i) => assignments[name] === section ? i + 1 : last, categoryOrder.length);
    categoryOrder.splice(index < 0 ? categoryOrder.length : index, 0, category);
    return { ...x, assignments, categoryOrder };
  });
  const editTemplate = (n: typeof NODE_TYPES[number]) => {
    setTab('presets'); setPresetTab('create'); setSavedId(''); setTemplateId(n.id); setCustomLabel(n.label); setCustomCategory(n.category); setCustomManualUrl(''); setInputGroups(templateGroups(n.defaultInputs)); setOutputGroups(templateGroups(n.defaultOutputs)); setBidirectionalGroups((n.defaultBidirectional ?? []).map(type => ({ ...templateGroups([type])[0], position: n.layout === 'ethernet-switch' ? 'top' : 'left' })));
  };
  const download = (name: string, type: string, text: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const canvasData = () => canvasDataFromState(useCanvasStore.getState());
  const downloadEditable = () => download('iko-connect-edit.json', 'application/json', canvasJson(canvasData()));
  const downloadView = async () => {
    if (!exportPassword) return setNotice('Set a password before downloading a view file');
    download('iko-connect-view.json', 'application/json', await protectedViewJson(canvasData(), exportPassword));
    setNotice('Password-protected view file downloaded'); setTimeout(() => setNotice(''), 1800);
  };
  const openFile = async (file?: File) => {
    if (!file) return;
    let document = await openCanvasFile(await file.text());
    if (document === 'password-required') {
      const password = prompt('Password for this view file');
      document = password ? await openCanvasFile(await file.text(), password) : null;
    }
    if (document && document !== 'password-required') {
      if (fileMode.current === 'import' && document.readOnly) setNotice('Read-only view files can only be opened');
      else { onOpenCanvas(document, fileMode.current === 'import'); setNotice(fileMode.current === 'import' ? 'Canvas and spaces imported' : 'File opened'); }
    } else setNotice('Could not open this iko-connect file');
    setTimeout(() => setNotice(''), 1800);
  };
  const addProjectVlan = () => {
    const tag = Number(vlanTag), name = vlanName.trim();
    if (!Number.isInteger(tag) || tag < 1 || tag > 4094) return setNotice('VLAN ID must be between 1 and 4094');
    if (!name) return setNotice('Give the VLAN a name');
    if (s.vlans.some(vlan => vlan.tag === tag)) return setNotice(`VLAN ${tag} already exists`);
    s.addVlan(tag, name, vlanColor);
    setVlanName(''); setVlanTag(String(Math.min(4094, tag + 10))); setNotice(`VLAN ${tag} created`);
    setTimeout(() => setNotice(''), 1800);
  };
  const editProjectVlan = (id: string) => {
    const vlan = s.vlans.find(item => item.id === id);
    if (!vlan) return;
    const tagText = prompt('VLAN ID (1–4094)', String(vlan.tag));
    if (tagText == null) return;
    const tag = Number(tagText), name = prompt('VLAN name', vlan.name)?.trim();
    if (!Number.isInteger(tag) || tag < 1 || tag > 4094 || !name || s.vlans.some(item => item.id !== id && item.tag === tag)) return setNotice('Use a unique VLAN ID from 1 to 4094 and a name');
    s.updateVlan(id, { tag, name });
  };
  const exportSvg = () => {
    const svg = svgRef.current?.cloneNode(true) as SVGSVGElement | undefined;
    if (!svg) return;
    svg.insertAdjacentHTML('afterbegin', `<title>AudioPatch diagram</title><metadata>${new Date().toISOString()}</metadata>`);
    download('audiopatch-diagram.svg', 'image/svg+xml', new XMLSerializer().serializeToString(svg));
  };
  const exportCsv = () => {
    const row = (xs: string[]) => xs.map(x => `"${x.replaceAll('"', '""')}"`).join(',');
    const { nodes, edges } = useCanvasStore.getState(), index = createGraphIndex(nodes);
    const lines = [row(['Source Device', 'Source Port', 'Signal Type', 'Target Device', 'Target Port', 'Notes'])];
    for (const edge of edges) {
      const resolved = resolveEdge(edge, index);
      if (resolved) lines.push(row([resolved.sourceNode.label, resolved.sourcePort.label, SIGNAL_TYPES[resolved.sourcePort.signalType].label, resolved.targetNode.label, resolved.targetPort.label, resolved.targetNode.notes ?? '']));
    }
    download('audiopatch-connections.csv', 'text/csv', lines.join('\n'));
  };

  return <div className={`side-stack ${open ? '' : 'sidebar-collapsed'}`}><aside className={`toolbar ${selected ? 'expanded' : ''} ${open ? '' : 'collapsed'}`}>
    <div className="sidebar-topbar">
      {open && <nav className="tabs" aria-label="Sidebar sections"><button className={tab === 'add' ? 'active' : ''} aria-current={tab === 'add' ? 'page' : undefined} onClick={() => setTab('add')}>Add</button><button className={tab === 'presets' ? 'active' : ''} aria-current={tab === 'presets' ? 'page' : undefined} onClick={() => { setTab('presets'); setPresetTab(selected ? 'inspector' : 'create'); }}>Presets</button><button className={tab === 'project' ? 'active' : ''} aria-current={tab === 'project' ? 'page' : undefined} onClick={() => setTab('project')}>Project</button><button className={tab === 'export' ? 'active' : ''} aria-current={tab === 'export' ? 'page' : undefined} onClick={() => setTab('export')}>Export</button></nav>}
      <button className="sidebar-toggle" aria-label={open ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={open} title={open ? 'Hide sidebar' : 'Show sidebar'} onClick={() => setOpen(!open)}><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /><path d={open ? 'm8 9 3 3-3 3' : 'm11 9-3 3 3 3'} /></svg></button>
    </div>
    {open && <>
      {notice && <div className="notice">{notice}</div>}
      {tab === 'project' && <div className="tab-panel project-panel">
        <section><h3>Diagram</h3><label>Port label layer<select value={s.portLayer} onChange={e => s.setPortLayer(Number(e.target.value))}><option value={0}>Base names</option>{Array.from({ length: aliasLayers }, (_, i) => <option key={i + 1} value={i + 1}>Alias layer {i + 1}</option>)}</select></label><div className="toolbar-actions"><button className="primary" onClick={() => { const name = prompt('Space name'); if (name) s.addSpace(name); }}>+ Space</button><button onClick={onAutoAlign}>Auto align</button></div>{s.spaces.length > 0 && <div className="space-list">{s.spaces.map(x => <span key={x.name}><input aria-label={`${x.name} color`} type="color" value={x.color} onChange={e => s.updateSpace(x.name, { color: e.target.value })} />{x.name}<button aria-label={`Delete ${x.name}`} onClick={() => confirm(`Delete ${x.name}?`) && s.deleteSpace(x.name)}>×</button></span>)}</div>}<p className="shortcut-hint">Undo: ⌘/Ctrl Z · Redo: ⇧⌘/Ctrl Z</p></section>
        <section className="vlan-project"><h3>VLANs</h3><p>Create network groups, assign them to components with Ethernet ports, then select a VLAN to highlight its members on the canvas.</p><form className="vlan-add" onSubmit={event => { event.preventDefault(); addProjectVlan(); }}><input aria-label="VLAN ID" title="VLAN ID" placeholder="ID" type="number" min="1" max="4094" value={vlanTag} onChange={event => setVlanTag(event.target.value)} /><input aria-label="VLAN name" placeholder="VLAN name" value={vlanName} onChange={event => setVlanName(event.target.value)} /><input aria-label="VLAN color" title="VLAN color" type="color" value={vlanColor} onChange={event => setVlanColor(event.target.value)} /><button className="primary" type="submit">Add</button></form>{s.vlans.length ? <div className="vlan-list">{[...s.vlans].sort((a, b) => a.tag - b.tag).map(vlan => { const count = s.nodes.filter(node => node.vlanIds?.includes(vlan.id)).length, active = s.selectedVlanId === vlan.id; return <div className={`vlan-row ${active ? 'active' : ''}`} key={vlan.id}><button className="vlan-select" aria-pressed={active} onClick={() => s.selectVlan(active ? null : vlan.id)}><span className="vlan-swatch" style={{ background: vlan.color }} /><span><b>VLAN {vlan.tag}</b><small>{vlan.name} · {count} component{count === 1 ? '' : 's'}</small></span></button><input aria-label={`VLAN ${vlan.tag} color`} type="color" value={vlan.color} onChange={event => s.updateVlan(vlan.id, { color: event.target.value })} /><button aria-label={`Edit VLAN ${vlan.tag}`} title="Edit VLAN" onClick={() => editProjectVlan(vlan.id)}>Edit</button><button className="remove" aria-label={`Delete VLAN ${vlan.tag}`} title="Delete VLAN" onClick={() => confirm(`Delete VLAN ${vlan.tag}? Components will be unassigned.`) && s.deleteVlan(vlan.id)}>×</button></div>; })}</div> : <p className="empty-state">No VLANs yet.</p>}{s.selectedVlanId && <div className="vlan-members"><b>Assign Ethernet components</b>{s.nodes.filter(hasEthernetPort).sort((a, b) => a.label.localeCompare(b.label)).map(node => <label key={node.id}><input type="checkbox" checked={node.vlanIds?.includes(s.selectedVlanId!) ?? false} onChange={event => s.setNodeVlanAssignment(node.id, s.selectedVlanId!, event.target.checked)} />{node.label}</label>)}{!s.nodes.some(hasEthernetPort) && <p className="empty-state">Add a switch or component with an Ethernet port to assign it.</p>}</div>}</section>
      </div>}
      {tab === 'presets' && <div className="tab-panel presets-panel">
        <nav className="preset-subtabs" aria-label="Preset tools"><button className={presetTab === 'inspector' ? 'active' : ''} aria-current={presetTab === 'inspector' ? 'page' : undefined} onClick={() => setPresetTab('inspector')}>Inspector</button><button className={presetTab === 'create' ? 'active' : ''} aria-current={presetTab === 'create' ? 'page' : undefined} onClick={() => setPresetTab('create')}>Create</button></nav>
        {presetTab === 'inspector' && <div className="preset-inspector">{selected ? <NodeInspector categories={categoryOptions} /> : <p className="empty-state">Select a component on the canvas to inspect its properties, ports, space, VLANs, and notes.</p>}</div>}
        {presetTab === 'create' && <div className="custom-object">
          <label>Name<input placeholder="Object name" value={customLabel} onChange={e => setCustomLabel(e.target.value)} /></label>
          <label>Library category<select value={customCategory} onChange={e => setCustomCategory(e.target.value)}>{categoryOptions.map(category => <option key={category}>{category}</option>)}</select></label>
          <label>Technical specs / manual URL<input type="url" placeholder="https://manufacturer.com/manual" value={customManualUrl} onChange={e => setCustomManualUrl(e.target.value)} /></label>
          <label>Preset to edit<select value={savedId} onChange={e => loadComponent(e.target.value)}><option value="">New preset</option>{[...saved].sort((a, b) => `${a.category}/${a.label}`.localeCompare(`${b.category}/${b.label}`)).map(c => <option key={c.id} value={c.id}>{c.category} / {c.label}</option>)}</select></label>
          {(savedId || templateId) && <><p className="editing-preset">Updating {templateId ? 'library preset' : 'preset'}: <b>{customLabel}</b></p>{savedId && <button className="remove-preset" onClick={() => { const c = saved.find(x => x.id === savedId); if (c) removeSaved(c); }}>Remove this preset</button>}</>}
          <b>Inputs</b>{inputGroups.map((g, i) => <div className="port-group" key={i} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup(inputGroups, setInputGroups, Number(e.dataTransfer.getData('text/plain')), i)}><span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span><input aria-label="Input type" placeholder="Type" value={g.type} onChange={e => setInputGroups(inputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} /><input aria-label="Input amount" type="number" min="0" value={g.amount} onChange={e => setInputGroups(inputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} /><select aria-label="Input connector type" value={g.signalType ?? templateSignal(g.type)} onChange={e => setInputGroups(inputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as keyof typeof SIGNAL_TYPES } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select><button onClick={() => setInputGroups(inputGroups.filter((_, n) => n !== i))}>×</button></div>)}
          <button onClick={() => setInputGroups([...inputGroups, { type: '', amount: 1, signalType: 'analog_audio' }])}>+ input group</button>
          <b>Outputs</b>{outputGroups.map((g, i) => <div className="port-group" key={i} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup(outputGroups, setOutputGroups, Number(e.dataTransfer.getData('text/plain')), i)}><span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span><input aria-label="Output type" placeholder="Type" value={g.type} onChange={e => setOutputGroups(outputGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} /><input aria-label="Output amount" type="number" min="0" value={g.amount} onChange={e => setOutputGroups(outputGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} /><select aria-label="Output connector type" value={g.signalType ?? templateSignal(g.type)} onChange={e => setOutputGroups(outputGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as keyof typeof SIGNAL_TYPES } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select><button onClick={() => setOutputGroups(outputGroups.filter((_, n) => n !== i))}>×</button></div>)}
          <button onClick={() => setOutputGroups([...outputGroups, { type: '', amount: 1, signalType: 'analog_audio' }])}>+ output group</button>
          <b>Bidirectional</b>{bidirectionalGroups.map((g, i) => <div className="port-group bidirectional" key={i} onDragOver={e => e.preventDefault()} onDrop={e => moveGroup(bidirectionalGroups, setBidirectionalGroups, Number(e.dataTransfer.getData('text/plain')), i)}><span className="drag-handle" draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>↕</span><input aria-label="Bidirectional port type" placeholder="Type" value={g.type} onChange={e => setBidirectionalGroups(bidirectionalGroups.map((x, n) => n === i ? { ...x, type: e.target.value } : x))} /><input aria-label="Bidirectional port amount" type="number" min="0" value={g.amount} onChange={e => setBidirectionalGroups(bidirectionalGroups.map((x, n) => n === i ? { ...x, amount: Number(e.target.value) } : x))} /><select aria-label="Bidirectional connector type" value={g.signalType ?? templateSignal(g.type)} onChange={e => setBidirectionalGroups(bidirectionalGroups.map((x, n) => n === i ? { ...x, signalType: e.target.value as keyof typeof SIGNAL_TYPES } : x))}>{Object.entries(SIGNAL_TYPES).map(([id, v]) => <option key={id} value={id}>{v.label}</option>)}</select><select aria-label="Bidirectional port side" value={g.position ?? 'left'} onChange={e => setBidirectionalGroups(bidirectionalGroups.map((x, n) => n === i ? { ...x, position: e.target.value as PortGroup['position'] } : x))}><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="bottom">Bottom</option></select><button onClick={() => setBidirectionalGroups(bidirectionalGroups.filter((_, n) => n !== i))}>×</button></div>)}
          <button onClick={() => setBidirectionalGroups([...bidirectionalGroups, { type: 'ETHERNET', amount: 1, signalType: 'ethernet', position: 'left' }])}>+ bidirectional group</button>
          <div className="toolbar-actions form-actions"><button className="primary" onClick={saveComponent}>{savedId || templateId ? 'Save changes' : 'Save to library'}</button><button onClick={addCurrent}>Add to canvas</button><button onClick={resetForm}>New</button></div>
        </div>}
      </div>}
        {tab === 'export' && <div className="tab-panel export-panel">
          <section><h3>Diagram exports</h3><p>Export the complete diagram as a scalable graphic or its connection schedule as a spreadsheet-ready file.</p><div className="toolbar-actions"><button className="primary" onClick={exportSvg}>Download SVG</button><button onClick={exportCsv}>Download CSV</button></div></section>
          <section><h3>Open or import</h3><p>Open replaces the canvas. Import merges an editable file and renames duplicate spaces with -1, -2…</p><div className="toolbar-actions"><button className="primary" onClick={() => { fileMode.current = 'open'; fileInput.current?.click(); }}>Open file</button><button onClick={() => { fileMode.current = 'import'; fileInput.current?.click(); }}>Import into canvas</button></div><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { void openFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></section>
          <section><h3>Editable file</h3><p>Download nodes, cables, and spaces in a local JSON file you can reopen or import.</p><button onClick={downloadEditable}>Download editable JSON</button></section>
          <section><h3>Read-only view file</h3><p>Set a password to protect a viewer-only file containing nodes, cables, and spaces.</p><label>Password<input type="password" value={exportPassword} onChange={e => setExportPassword(e.target.value)} placeholder="Required for view files" /></label><button className="primary" onClick={() => { void downloadView(); }}>Download protected view JSON</button></section>
        </div>}
        {tab === 'add' && <div className="tab-panel catalog">
          <input aria-label="Search catalog" placeholder="Search devices and presets…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="catalog-tools"><span>{saved.length} saved preset{saved.length === 1 ? '' : 's'}</span><div><button className="primary" onClick={() => { resetForm(); setTab('presets'); setPresetTab('create'); }}>+ New preset</button><button onClick={manageCategories ? saveCategories : openCategoryManager}>{manageCategories ? 'Save categories' : 'Manage categories'}</button>{hidden.length > 0 && <button onClick={() => setHidden([])}>Restore catalog</button>}</div></div>
          {manageCategories && <section className="category-manager"><header><div><h3>Categories</h3><p>Drag sections or subcategories into their new order, then save.</p></div><button onClick={() => setManageCategories(false)}>Cancel</button></header><div className="category-add"><input aria-label="New section" placeholder="New section" value={newSection} onChange={e => setNewSection(e.target.value)} /><button onClick={addSection}>+ Section</button></div><div className="category-add"><input aria-label="New subcategory" placeholder="New subcategory" value={newCategory} onChange={e => setNewCategory(e.target.value)} /><button onClick={addCategory}>+ Subcategory</button></div><div className="category-tree">{categoryDraft.sections.map(section => <div className="category-drag-section" key={section} draggable onDragStart={e => e.dataTransfer.setData('text/plain', `section:${section}`)} onDragOver={e => e.preventDefault()} onDrop={e => { const [type, name] = e.dataTransfer.getData('text/plain').split(':'); if (type === 'section') moveSection(name, section); if (type === 'category') moveCategory(name, section); }}><div className="category-drag-title"><span>↕ {section}</span><button className="category-delete" aria-label={`Delete ${section}`} disabled={section === 'Other'} onClick={e => { e.stopPropagation(); deleteSection(section); }}>🗑</button></div><div className="category-drop-zone">{draftCategories.filter(category => (categoryDraft.assignments[category] ?? 'Other') === section).map(category => <div className="category-drag-item" key={category} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', `category:${category}`); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); const [type, name] = e.dataTransfer.getData('text/plain').split(':'); if (type === 'category') moveCategory(name, section, category); }}><span>↕ {category}</span><button className="category-delete" aria-label={`Delete ${category}`} onClick={() => deleteCategory(category)}>🗑</button></div>)}</div></div>)}</div></section>}
          <div className="node-list">
            {catalogSections.map(([section, categories]) => <details className="category-section" key={section} open><summary>{section}</summary><div className="category-list">
              {categories.map(cat => <details className="library-category" key={cat} open><summary style={{ color: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Custom }}>{cat}</summary>
                {(savedGroups[cat] ?? []).sort((a, b) => a.label.localeCompare(b.label)).map(c => <div className="preset-row saved-preset" key={c.id}><button className="preset-add" onClick={() => s.addCustomNode(c.label, labels(c.inputGroups), labels(c.outputGroups), center(), c.category, c.templateId || c.id, labels(c.bidirectionalGroups ?? []))}><span aria-hidden="true">💾</span><span>{c.label}<small>{c.templateId ? 'Library override' : `${c.inputGroups.reduce((n, g) => n + g.amount, 0)} in · ${c.outputGroups.reduce((n, g) => n + g.amount, 0)} out`}</small></span></button><div className="preset-actions"><button onClick={() => editSaved(c)}>Edit</button><a href={specsUrl(c.label, c.manualUrl)} target="_blank" rel="noreferrer">Specs</a><button className="remove" onClick={() => removeSaved(c)}>Remove</button></div></div>)}
                {(groups[cat] ?? []).map(n => <div className="preset-row" key={n.id}><button className="preset-add" onClick={() => s.addNode(n.id, center())}><span aria-hidden="true">{n.icon}</span><span>{n.label}<small>Built-in device</small></span></button><div className="preset-actions"><button onClick={() => editTemplate(n)}>Customize</button><a href={specsUrl(n.label)} target="_blank" rel="noreferrer">Specs</a><button className="remove" onClick={() => confirm(`Remove ${n.label} from the catalog?`) && setHidden(xs => [...xs, n.id])}>Remove</button></div></div>)}
              </details>)}
            </div></details>)}
            {!Object.keys(savedGroups).length && !Object.keys(groups).length && <p className="empty-state">No catalog entries match “{q}”.</p>}
          </div>
        </div>}
    </>}
  </aside></div>;
}
