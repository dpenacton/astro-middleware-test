// Minimal PostHog HTTP client for the Cloudflare runtime (no Node APIs needed).
// Shared by the Pages Function (server) and the layout script (cookie names).

export const DISTINCT_ID_COOKIE = 'ph_distinct_id';
export const VARIANT_COOKIE = 'ph_home_variant';

interface FlagsResponse {
  // /flags?v=2 shape
  flags?: Record<string, { enabled?: boolean; variant?: string | null }>;
  // legacy /decide shape, kept as a fallback
  featureFlags?: Record<string, string | boolean>;
}

/** Returns the variant key for `flagKey`, or null if the flag is off / unreachable. */
export async function getFlagVariant(
  host: string,
  apiKey: string,
  distinctId: string,
  flagKey: string,
  timeoutMs = 1500,
): Promise<string | null> {
  try {
    const res = await fetch(`${host}/flags/?v=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, distinct_id: distinctId }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as FlagsResponse;

    const flag = data.flags?.[flagKey];
    if (flag) return flag.enabled ? (flag.variant ?? null) : null;

    const legacy = data.featureFlags?.[flagKey];
    return typeof legacy === 'string' ? legacy : null;
  } catch {
    return null;
  }
}

/** Records the experiment exposure so PostHog Experiments can attribute results. */
export async function captureExposure(
  host: string,
  apiKey: string,
  distinctId: string,
  flagKey: string,
  variant: string,
  url: string,
): Promise<void> {
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: '$feature_flag_called',
        distinct_id: distinctId,
        properties: {
          $feature_flag: flagKey,
          $feature_flag_response: variant,
          [`$feature/${flagKey}`]: variant,
          $current_url: url,
          source: 'astro-middleware',
        },
      }),
    });
  } catch {
    // Analytics must never break the redirect.
  }
}

/** Reuses posthog-js's own distinct_id cookie if the visitor already has one. */
export function distinctIdFromPosthogJsCookie(cookieHeader: string | null, apiKey: string): string | null {
  if (!cookieHeader) return null;
  const name = `ph_${apiKey}_posthog=`;
  const raw = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(name));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice(name.length)));
    return typeof parsed?.distinct_id === 'string' ? parsed.distinct_id : null;
  } catch {
    return null;
  }
}
