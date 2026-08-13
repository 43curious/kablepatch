import { randomUUID } from 'node:crypto';
import database from './db';
import { normalizeCanvasData } from '../store/canvasDocument';
import type { CanvasData } from '../store/canvasDocument';

export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_PROJECTS_PER_USER = 200;
export const MAX_PROJECT_TITLE = 120;

export type ProjectSummary = { id: string; title: string; revision: number; byteSize: number; createdAt: number; updatedAt: number };
export type ProjectRecord = ProjectSummary & { document: CanvasData };

type ProjectRow = { id: string; title: string; document: string; revision: number; byte_size: number; created_at: number; updated_at: number };

export const emptyCanvas = (): CanvasData => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, spaces: [], vlans: [] });
export const projectByteSize = (document: CanvasData) => Buffer.byteLength(JSON.stringify(document), 'utf8');
const titleFor = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, MAX_PROJECT_TITLE) : '';
const summary = (row: ProjectRow): ProjectSummary => ({ id: row.id, title: row.title, revision: row.revision, byteSize: row.byte_size, createdAt: row.created_at, updatedAt: row.updated_at });

export const listProjects = (userId: string): ProjectSummary[] => (database.prepare('SELECT id, title, revision, byte_size, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as ProjectRow[]).map(summary);

export const getProject = (userId: string, id: string): ProjectRecord | null => {
  const row = database.prepare('SELECT id, title, document, revision, byte_size, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as ProjectRow | undefined;
  if (!row) return null;
  try {
    const document = normalizeCanvasData(JSON.parse(row.document));
    return document ? { ...summary(row), document } : null;
  } catch { return null; }
};

export const createProject = (userId: string, titleInput: unknown, input?: unknown): ProjectRecord | { error: string } => {
  const count = (database.prepare('SELECT COUNT(*) AS count FROM projects WHERE user_id = ?').get(userId) as { count: number }).count;
  if (count >= MAX_PROJECTS_PER_USER) return { error: `Project limit reached (${MAX_PROJECTS_PER_USER}).` };
  const title = titleFor(titleInput);
  if (!title) return { error: 'Give the project a name.' };
  const document = input == null ? emptyCanvas() : normalizeCanvasData(input);
  if (!document) return { error: 'Project document is invalid.' };
  const text = JSON.stringify(document), byteSize = Buffer.byteLength(text, 'utf8');
  if (byteSize > MAX_PROJECT_BYTES) return { error: 'Project exceeds the 2 MiB storage limit.' };
  const id = randomUUID(), now = Date.now();
  database.prepare('INSERT INTO projects (id, user_id, title, document, schema_version, revision, byte_size, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)')
    .run(id, userId, title, text, byteSize, now, now);
  return { id, title, document, revision: 1, byteSize, createdAt: now, updatedAt: now };
};

export const renameProject = (userId: string, id: string, titleInput: unknown) => {
  const title = titleFor(titleInput);
  if (!title) return false;
  return database.prepare('UPDATE projects SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, Date.now(), id, userId).changes > 0;
};

export const deleteProject = (userId: string, id: string) => database.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;

export const saveProject = (userId: string, id: string, input: unknown, revision: unknown) => {
  const document = normalizeCanvasData(input);
  if (!document || !Number.isSafeInteger(revision) || Number(revision) < 1) return { status: 400, error: 'Invalid project document or revision.' } as const;
  const text = JSON.stringify(document), byteSize = Buffer.byteLength(text, 'utf8');
  if (byteSize > MAX_PROJECT_BYTES) return { status: 413, error: 'Project exceeds the 2 MiB storage limit.' } as const;
  const now = Date.now();
  const result = database.prepare('UPDATE projects SET document = ?, byte_size = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?')
    .run(text, byteSize, now, id, userId, Number(revision));
  if (result.changes) return { status: 200, revision: Number(revision) + 1, byteSize, updatedAt: now } as const;
  const exists = database.prepare('SELECT revision FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as { revision: number } | undefined;
  return exists ? { status: 409, error: 'This project changed in another tab.', revision: exists.revision } as const : { status: 404, error: 'Project not found.' } as const;
};
