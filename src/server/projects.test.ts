import { describe, expect, it } from 'vitest';
import { emptyCanvas, projectByteSize, saveProject } from './projects';

const uniqueUser = () => crypto.randomUUID();

describe('project storage', () => {
  it('measures compact UTF-8 project documents', () => {
    const document = emptyCanvas();
    expect(projectByteSize(document)).toBe(new TextEncoder().encode(JSON.stringify(document)).length);
    expect(projectByteSize(document)).toBeLessThan(200);
  });

  it('does not reveal or update a project owned by another user', () => {
    const result = saveProject(uniqueUser(), crypto.randomUUID(), emptyCanvas(), 1);
    expect(result.status).toBe(404);
  });
});
