import type { APIRoute } from 'astro';
import { verifyCsrf } from '../../../server/auth';
import { createProject, listProjects } from '../../../server/projects';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = ({ locals }) => locals.session ? json({ projects: listProjects(locals.session.user.id) }) : json({ error: 'Authentication required.' }, 401);

export const POST: APIRoute = async ({ request, locals }) => {
  const session = locals.session;
  if (!session) return json({ error: 'Authentication required.' }, 401);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON required.' }, 415);
  if (!verifyCsrf(request, session, request.headers.get('x-csrf-token'))) return json({ error: 'Request verification failed.' }, 403);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 2 * 1024 * 1024 + 4096) return json({ error: 'Request is too large.' }, 413);
  try {
    const body = await request.json() as { title?: unknown; document?: unknown };
    const result = createProject(session.user.id, body.title, body.document);
    return 'error' in result ? json(result, 400) : json(result, 201);
  } catch { return json({ error: 'Invalid JSON.' }, 400); }
};
