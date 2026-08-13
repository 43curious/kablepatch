import { NODE_TYPES, templateSignal } from '../../nodes/NodeTypes';
import type { SignalType } from '../../types/graph';

export type LibraryPortGroup = { type: string; amount: number; signalType?: SignalType; position?: 'left' | 'right' | 'top' | 'bottom' };
export type LibraryPreset = { id: string; label: string; category: string; emoji?: string; manualUrl?: string; inputGroups: LibraryPortGroup[]; outputGroups: LibraryPortGroup[]; bidirectionalGroups?: LibraryPortGroup[]; templateId?: string };
export type CategoryCatalog = { sections: string[]; assignments: Record<string, string>; categoryOrder: string[]; deletedCategories: string[] };

export const COMPONENTS_KEY = 'audiopatch-components';
export const HIDDEN_KEY = 'audiopatch-hidden-components';
export const CATEGORY_KEY = 'audiopatch-category-catalog';

export const CATEGORY_SECTIONS: Record<string, string> = {
  'Audio Consoles': 'Audio', 'Audio Interfaces / Converters': 'Audio', 'Processors / DSP': 'Audio', Monitoring: 'Audio',
  Infrastructure: 'Infrastructure', 'Video Switchers': 'Video', 'Video Routers': 'Video', 'Broadcast Cameras': 'Video',
  'Playback / Recording': 'Computers', 'Intercom / Comms': 'Communications', 'Patch Bays': 'Infrastructure', Custom: 'Custom',
};

export const defaultCategoryCatalog = (): CategoryCatalog => ({ sections: [...new Set([...Object.values(CATEGORY_SECTIONS), 'Other'])], assignments: { ...CATEGORY_SECTIONS }, categoryOrder: Object.keys(CATEGORY_SECTIONS), deletedCategories: [] });

const array = <T>(key: string): T[] => {
  try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
};

export const loadLibrary = () => {
  const presets = array<LibraryPreset>(COMPONENTS_KEY).map(preset => ({
    ...preset, category: preset.category || 'Custom',
    inputGroups: (preset.inputGroups ?? []).map(group => ({ ...group, signalType: group.signalType ?? templateSignal(group.type) })),
    outputGroups: (preset.outputGroups ?? []).map(group => ({ ...group, signalType: group.signalType ?? templateSignal(group.type) })),
    bidirectionalGroups: (preset.bidirectionalGroups ?? []).map(group => ({ ...group, signalType: group.signalType ?? templateSignal(group.type) })),
  }));
  const hidden = array<string>(HIDDEN_KEY);
  let categories = defaultCategoryCatalog();
  try {
    const stored = JSON.parse(localStorage.getItem(CATEGORY_KEY) ?? 'null') as Partial<CategoryCatalog> | null;
    if (stored && Array.isArray(stored.sections) && stored.assignments) categories = {
      sections: [...new Set([...categories.sections, ...stored.sections])],
      assignments: { ...categories.assignments, ...stored.assignments },
      categoryOrder: [...new Set([...(stored.categoryOrder ?? []), ...categories.categoryOrder, ...Object.keys(stored.assignments)])],
      deletedCategories: stored.deletedCategories ?? [],
    };
  } catch { /* Keep defaults. */ }
  return { presets, hidden, categories };
};

export const saveLibrary = (presets: LibraryPreset[], hidden: string[], categories: CategoryCatalog) => {
  localStorage.setItem(COMPONENTS_KEY, JSON.stringify(presets));
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories));
  window.dispatchEvent(new Event('audiopatch-components-changed'));
};

export const allLibraryCategories = (presets: LibraryPreset[]) => [...new Set([...NODE_TYPES.map(node => node.category), ...presets.map(preset => preset.category), 'Custom', 'Other'])].sort();
