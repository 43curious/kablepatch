import type { APIRoute } from 'astro';
import { verifyCsrf } from '../../../server/auth';
import { deleteProject, getProject, renameProject, saveProject } from '../../../server/projects';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = ({ params, locals }) => {
  if (!locals.session) return json({ error: 'Authentication required.' }, 401);
  const project = getProject(locals.session.user.id, params.id ?? '');
  return project ? json(project) : json({ error: 'Project not found.' }, 404);
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const session = locals.session;
  if (!session) return json({ error: 'Authentication required.' }, 401);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON required.' }, 415);
  if (!verifyCsrf(request, session, request.headers.get('x-csrf-token'))) return json({ error: 'Request verification failed.' }, 403);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 2 * 1024 * 1024 + 4096) return json({ error: 'Request is too large.' }, 413);
  try {
    const body = await request.json() as { document?: unknown; revision?: unknown };
    const result = saveProject(session.user.id, params.id ?? '', body.document, body.revision);
    return json(result, result.status);
  } catch { return json({ error: 'Invalid JSON.' }, 400); }
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const session = locals.session;
  if (!session) return json({ error: 'Authentication required.' }, 401);
  if (!verifyCsrf(request, session, request.headers.get('x-csrf-token'))) return json({ error: 'Request verification failed.' }, 403);
  try {
    const body = await request.json() as { title?: unknown };
    return renameProject(session.user.id, params.id ?? '', body.title) ? json({ ok: true }) : json({ error: 'Project not found or title invalid.' }, 404);
  } catch { return json({ error: 'Invalid JSON.' }, 400); }
};

export const DELETE: APIRoute = ({ params, request, locals }) => {
  const session = locals.session;
  if (!session) return json({ error: 'Authentication required.' }, 401);
  if (!verifyCsrf(request, session, request.headers.get('x-csrf-token'))) return json({ error: 'Request verification failed.' }, 403);
  return deleteProject(session.user.id, params.id ?? '') ? json({ ok: true }) : json({ error: 'Project not found.' }, 404);
};
