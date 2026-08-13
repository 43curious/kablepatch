import { describe, expect, it } from 'vitest';
import { defaultCategoryCatalog } from './libraryCatalog';

describe('library catalog defaults', () => {
  it('keeps an Other fallback and assigns built-in categories to sections', () => {
    const catalog = defaultCategoryCatalog();
    expect(catalog.sections).toContain('Other');
    expect(catalog.assignments.Infrastructure).toBe('Infrastructure');
    expect(catalog.categoryOrder).toContain('Audio Consoles');
  });
});
