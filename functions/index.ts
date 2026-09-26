// Cloudflare Pages Function for `/` only. Every other path is served as a
// static asset without invoking this function.
import {
  DISTINCT_ID_COOKIE,
  VARIANT_COOKIE,
  captureExposure,
  distinctIdFromPosthogJsCookie,
  getFlagVariant,
} from '../src/lib/posthog';

interface Env {
  PUBLIC_POSTHOG_KEY: string;
  PUBLIC_POSTHOG_HOST?: string;
  PUBLIC_POSTHOG_EXPERIMENT_FLAG?: string;
}

// PostHog experiment variant key -> page to send the visitor to.
const VARIANT_ROUTES: Record<string, string> = {
  control: '/home-a',
  'home-a': '/home-a',
  'home-b': '/home-b',
  'home-c': '/home-c',
};
const FALLBACK_ROUTE = '/home-a';

const ONE_YEAR = 60 * 60 * 24 * 365;

function getCookie(header: string | null, name: string): string | undefined {
  return header
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export const onRequest: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const apiKey = env.PUBLIC_POSTHOG_KEY;
  const host = env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
  const flagKey = env.PUBLIC_POSTHOG_EXPERIMENT_FLAG || 'server-side-ab-test';
  const cookieHeader = request.headers.get('cookie');

  // 1. Distinct ID: our cookie -> posthog-js cookie -> new UUID.
  const distinctId =
    getCookie(cookieHeader, DISTINCT_ID_COOKIE) ||
    (apiKey && distinctIdFromPosthogJsCookie(cookieHeader, apiKey)) ||
    crypto.randomUUID();

  // 2. Ask PostHog which experiment variant this visitor is in.
  const variant = apiKey ? await getFlagVariant(host, apiKey, distinctId, flagKey) : null;
  const target = (variant && VARIANT_ROUTES[variant]) || FALLBACK_ROUTE;

  // 3. Log the exposure without delaying the redirect.
  if (variant) {
    waitUntil(captureExposure(host, apiKey, distinctId, flagKey, variant, url.href));
  }

  // 4. Redirect, keeping any query string (UTMs etc.).
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const headers = new Headers({
    Location: target + url.search,
    'Cache-Control': 'private, no-store',
  });
  headers.append(
    'Set-Cookie',
    `${DISTINCT_ID_COOKIE}=${distinctId}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`,
  );
  // Lets the static page's client-side PostHog tag events with the variant.
  headers.append('Set-Cookie', `${VARIANT_COOKIE}=${variant ?? 'fallback'}; Path=/; SameSite=Lax${secure}`);

  return new Response(null, { status: 302, headers });
};
