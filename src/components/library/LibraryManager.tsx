import { useEffect, useMemo, useState } from 'react';
import { NODE_TYPES, SIGNAL_TYPES } from '../../nodes/NodeTypes';
import { allLibraryCategories, defaultCategoryCatalog, loadLibrary, saveLibrary } from './libraryCatalog';
import type { CategoryCatalog, LibraryPortGroup, LibraryPreset } from './libraryCatalog';
import EmojiPicker from './EmojiPicker';

const blankGroup = (): LibraryPortGroup => ({ type: 'PORT', amount: 1, signalType: 'analog_audio' });

export default function LibraryManager() {
  const [loaded, setLoaded] = useState(false), [query, setQuery] = useState(''), [tab, setTab] = useState<'library' | 'organization'>('library');
  const [presets, setPresets] = useState<LibraryPreset[]>([]), [hidden, setHidden] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CategoryCatalog>(defaultCategoryCatalog);
  const [editing, setEditing] = useState<LibraryPreset | null>(null);
  const [dropTarget, setDropTarget] = useState<{ side: 'inputGroups' | 'outputGroups' | 'bidirectionalGroups'; index: number } | null>(null);
  const [newSection, setNewSection] = useState(''), [newCategory, setNewCategory] = useState('');

  useEffect(() => { const library = loadLibrary(); setPresets(library.presets); setHidden(library.hidden); setCatalog(library.categories); setLoaded(true); }, []);
  useEffect(() => { if (loaded) saveLibrary(presets, hidden, catalog); }, [loaded, presets, hidden, catalog]);

  const categories = allLibraryCategories(presets).filter(category => !catalog.deletedCategories.includes(category));
  const rank = new Map(catalog.categoryOrder.map((category, index) => [category, index]));
  const sections = catalog.sections.map(section => ({ section, categories: categories.filter(category => (catalog.assignments[category] ?? 'Other') === section).sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b)) })).filter(item => item.categories.length);
  const matches = (label: string, category: string) => `${label} ${category}`.toLowerCase().includes(query.toLowerCase());
  const visibleBuiltins = useMemo(() => NODE_TYPES.filter(node => !hidden.includes(node.id) && matches(node.label, node.category)), [hidden, query]);
  const visiblePresets = useMemo(() => presets.filter(preset => matches(preset.label, preset.category)), [presets, query]);
  const countPorts = (groups: LibraryPortGroup[] = []) => groups.reduce((total, group) => total + group.amount, 0);

  const openNew = () => setEditing({ id: crypto.randomUUID(), label: 'New preset', category: 'Custom', inputGroups: [blankGroup()], outputGroups: [blankGroup()], bidirectionalGroups: [] });
  const savePreset = () => {
    if (!editing?.label.trim()) return;
    setPresets(items => [...items.filter(item => item.id !== editing.id && (item.label !== editing.label || item.category !== editing.category)), { ...editing, label: editing.label.trim() }]);
    setEditing(null);
  };
  const patchGroup = (side: 'inputGroups' | 'outputGroups' | 'bidirectionalGroups', index: number, patch: Partial<LibraryPortGroup>) => setEditing(current => current ? ({ ...current, [side]: (current[side] ?? []).map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) }) : current);
  const moveGroup = (side: 'inputGroups' | 'outputGroups' | 'bidirectionalGroups', from: number, insertion: number) => setEditing(current => {
    if (!current || from === insertion || from + 1 === insertion) return current;
    const groups = [...(current[side] ?? [])], [moved] = groups.splice(from, 1);
    if (!moved) return current;
    const to = from < insertion ? insertion - 1 : insertion;
    groups.splice(to, 0, moved);
    return { ...current, [side]: groups };
  });
  const dropLine = (side: 'inputGroups' | 'outputGroups' | 'bidirectionalGroups', index: number) => <div className={`group-drop-line ${dropTarget?.side === side && dropTarget.index === index ? 'active' : ''}`} onDragEnter={() => setDropTarget({ side, index })} onDragOver={event => { event.preventDefault(); setDropTarget({ side, index }); }} onDrop={event => { event.preventDefault(); moveGroup(side, Number(event.dataTransfer.getData('text/plain')), index); setDropTarget(null); }} />;
  const addSection = () => { const name = newSection.trim(); if (name && !catalog.sections.includes(name)) setCatalog(current => ({ ...current, sections: [...current.sections, name] })); setNewSection(''); };
  const addCategory = () => { const name = newCategory.trim(); if (name && !categories.includes(name)) setCatalog(current => ({ ...current, assignments: { ...current.assignments, [name]: current.sections[0] ?? 'Other' }, categoryOrder: [...current.categoryOrder, name], deletedCategories: current.deletedCategories.filter(item => item !== name) })); setNewCategory(''); };
  const deleteCategory = (name: string) => {
    if (!confirm(`Delete ${name}? Saved presets will move to Other.`)) return;
    setPresets(items => items.map(item => item.category === name ? { ...item, category: 'Other' } : item));
    setCatalog(current => ({ ...current, assignments: { ...current.assignments, [name]: 'Other' }, deletedCategories: [...new Set([...current.deletedCategories, name])], categoryOrder: current.categoryOrder.filter(item => item !== name) }));
  };

  if (!loaded) return <div className="library-loading">Loading library…</div>;
  return <div className="library-manager">
    <section className="library-hero"><div><p>Component library</p><h1>Build once. Reuse everywhere.</h1><span>Manage built-in devices, reusable presets, categories, and the way the catalog is organized.</span></div><button className="manager-primary" onClick={openNew}>New preset <b>＋</b></button></section>

    <nav className="manager-tabs" aria-label="Library manager sections"><button className={tab === 'library' ? 'active' : ''} aria-current={tab === 'library' ? 'page' : undefined} onClick={() => setTab('library')}>Library</button><button className={tab === 'organization' ? 'active' : ''} aria-current={tab === 'organization' ? 'page' : undefined} onClick={() => setTab('organization')}>Organization</button></nav>

    {tab === 'library' && <><div className="manager-toolbar"><label><span aria-hidden="true">⌕</span><input aria-label="Search library" placeholder="Search components and presets…" value={query} onChange={event => setQuery(event.target.value)} /></label><div><span>{visibleBuiltins.length} built in</span><span>{visiblePresets.length} presets</span>{hidden.length > 0 && <button onClick={() => setHidden([])}>Restore {hidden.length} hidden</button>}</div></div>

    <div className="manager-layout library-only">
      <main className="manager-list"><header><h2>Library</h2><p>Click a component to edit a saved preset. Built-in components can be hidden from the editor catalog.</p></header>
        {sections.map(({ section, categories: sectionCategories }) => <section className="manager-section" key={section}><h3>{section}</h3>{sectionCategories.map(category => {
          const saved = visiblePresets.filter(preset => preset.category === category), builtins = visibleBuiltins.filter(node => (catalog.deletedCategories.includes(node.category) ? 'Other' : node.category) === category);
          if (!saved.length && !builtins.length) return null;
          return <div className="manager-category" key={category}><header><span style={{ background: category === 'Other' ? '#8e8e93' : '#007aff' }}></span><h4>{category}</h4><small>{saved.length + builtins.length}</small></header><div>{saved.map(preset => <article key={preset.id} className="manager-item saved"><button onClick={() => setEditing(structuredClone(preset))}><i>{preset.emoji || '◆'}</i><span><b>{preset.label}</b><small>{countPorts(preset.inputGroups)} in · {countPorts(preset.outputGroups)} out · saved preset</small></span></button><button className="item-delete" onClick={() => confirm(`Delete ${preset.label}?`) && setPresets(items => items.filter(item => item.id !== preset.id))}>Delete</button></article>)}{builtins.map(node => <article key={node.id} className="manager-item"><div><i>{node.icon}</i><span><b>{node.label}</b><small>Built-in component</small></span></div><button onClick={() => setHidden(items => [...items, node.id])}>Hide</button></article>)}</div></div>;
        })}</section>)}
      </main>
    </div></>}

      {tab === 'organization' && <aside className="category-sidebar organization-page"><header><h2>Organization</h2><p>Assign categories to top-level sections.</p></header><div className="manager-add"><input placeholder="New section" value={newSection} onChange={event => setNewSection(event.target.value)} /><button onClick={addSection}>Add</button></div><div className="manager-add"><input placeholder="New category" value={newCategory} onChange={event => setNewCategory(event.target.value)} /><button onClick={addCategory}>Add</button></div><div className="category-map">{catalog.sections.map(section => <section key={section}><h3>{section}</h3>{categories.filter(category => (catalog.assignments[category] ?? 'Other') === section).map(category => <div key={category}><span>{category}</span><select aria-label={`${category} section`} value={section} onChange={event => setCatalog(current => ({ ...current, assignments: { ...current.assignments, [category]: event.target.value } }))}>{catalog.sections.map(option => <option key={option}>{option}</option>)}</select><button aria-label={`Delete ${category}`} disabled={category === 'Other'} onClick={() => deleteCategory(category)}>×</button></div>)}</section>)}</div></aside>}

    {editing && <dialog open className="preset-editor"><div className="preset-editor-shell"><header><div><p>Preset editor</p><h2>{editing.label || 'New preset'}</h2></div><button aria-label="Close" onClick={() => setEditing(null)}>×</button></header><div className="preset-fields"><label>Component icon<EmojiPicker value={editing.emoji} onChange={emoji => setEditing({ ...editing, emoji: emoji || undefined })} /></label><label>Name<input value={editing.label} onChange={event => setEditing({ ...editing, label: event.target.value })} /></label><label>Category<select value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label>Manual or specifications URL<input type="url" value={editing.manualUrl ?? ''} onChange={event => setEditing({ ...editing, manualUrl: event.target.value })} /></label></div>{(['inputGroups', 'outputGroups', 'bidirectionalGroups'] as const).map(side => <section className="group-editor" key={side}><header><h3>{side === 'inputGroups' ? 'Inputs' : side === 'outputGroups' ? 'Outputs' : 'Bidirectional'}</h3><button onClick={() => setEditing(current => current ? { ...current, [side]: [...(current[side] ?? []), blankGroup()] } : current)}>＋ Add group</button></header>{dropLine(side, 0)}{(editing[side] ?? []).map((group, index) => <div className="group-editor-row-wrap" key={`${side}-${index}`}><div className="group-editor-row"><span className="group-drag-handle" draggable onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }} onDragEnd={() => setDropTarget(null)} title="Drag to reorder" aria-label={`Reorder ${group.type} group`}>⠿</span><input aria-label="Port type" value={group.type} onChange={event => patchGroup(side, index, { type: event.target.value })} /><input aria-label="Port amount" type="number" min="0" value={group.amount} onChange={event => patchGroup(side, index, { amount: Number(event.target.value) })} /><select aria-label="Signal type" value={group.signalType} onChange={event => patchGroup(side, index, { signalType: event.target.value as keyof typeof SIGNAL_TYPES })}>{Object.entries(SIGNAL_TYPES).map(([id, signal]) => <option key={id} value={id}>{signal.label}</option>)}</select><button aria-label="Remove group" onClick={() => setEditing(current => current ? { ...current, [side]: (current[side] ?? []).filter((_, groupIndex) => groupIndex !== index) } : current)}>×</button></div>{dropLine(side, index + 1)}</div>)}</section>)}<footer><button onClick={() => setEditing(null)}>Cancel</button><button className="manager-primary" onClick={savePreset}>Save preset</button></footer></div></dialog>}
  </div>;
}
