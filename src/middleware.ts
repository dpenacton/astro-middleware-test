import { defineMiddleware } from 'astro:middleware';
import { PUBLIC_POSTHOG_EXPERIMENT_FLAG, PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_KEY } from 'astro:env/client';
import {
  DISTINCT_ID_COOKIE,
  VARIANT_COOKIE,
  captureExposure,
  distinctIdFromPosthogJsCookie,
  getFlagVariant,
} from './lib/posthog';

// PostHog experiment variant key -> page to send the visitor to.
const VARIANT_ROUTES: Record<string, string> = {
  control: '/home-a',
  'home-a': '/home-a',
  'home-b': '/home-b',
  'home-c': '/home-c',
};
const FALLBACK_ROUTE = '/home-a';

const ONE_YEAR = 60 * 60 * 24 * 365;

export const onRequest = defineMiddleware(async (context, next) => {
  // Prerendered pages (home-a/b/c) only pass through here at build time;
  // at runtime Cloudflare serves them as static assets without invoking the Worker.
  if (context.isPrerendered || context.url.pathname !== '/') {
    return next();
  }

  // 1. Distinct ID: our cookie -> posthog-js cookie -> new UUID.
  const distinctId =
    context.cookies.get(DISTINCT_ID_COOKIE)?.value ||
    distinctIdFromPosthogJsCookie(context.request.headers.get('cookie'), PUBLIC_POSTHOG_KEY) ||
    crypto.randomUUID();

  context.cookies.set(DISTINCT_ID_COOKIE, distinctId, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    secure: context.url.protocol === 'https:',
  });

  // 2. Ask PostHog which experiment variant this visitor is in.
  const variant = await getFlagVariant(PUBLIC_POSTHOG_HOST, PUBLIC_POSTHOG_KEY, distinctId, PUBLIC_POSTHOG_EXPERIMENT_FLAG);
  const target = (variant && VARIANT_ROUTES[variant]) || FALLBACK_ROUTE;

  // Lets the static page's client-side PostHog tag events with the variant.
  context.cookies.set(VARIANT_COOKIE, variant ?? 'fallback', { path: '/', sameSite: 'lax' });

  // 3. Log the exposure without delaying the redirect.
  if (variant) {
    const exposure = captureExposure(
      PUBLIC_POSTHOG_HOST,
      PUBLIC_POSTHOG_KEY,
      distinctId,
      PUBLIC_POSTHOG_EXPERIMENT_FLAG,
      variant,
      context.url.href,
    );
    const waitUntil = context.locals.cfContext?.waitUntil?.bind(context.locals.cfContext);
    if (waitUntil) waitUntil(exposure);
    else await exposure;
  }

  // 4. Redirect, keeping any query string (UTMs etc.).
  const location = new URL(target, context.url);
  location.search = context.url.search;

  return new Response(null, {
    status: 302,
    headers: {
      Location: location.pathname + location.search,
      'Cache-Control': 'private, no-store',
    },
  });
});
