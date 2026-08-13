import { defineMiddleware } from 'astro:middleware';
import { readSession } from './server/auth';

const protectedPage = (pathname: string) => pathname === '/app' || pathname.startsWith('/app/');

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.session = readSession(context.cookies);
  const { pathname, search } = context.url;

  if (protectedPage(pathname) && !context.locals.session) {
    const nextPath = `${pathname}${search}`;
    return context.redirect(`/login/?next=${encodeURIComponent(nextPath)}`, 303);
  }
  if ((pathname === '/login' || pathname === '/login/' || pathname === '/register' || pathname === '/register/') && context.locals.session) {
    return context.redirect('/app/', 303);
  }

  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
});
