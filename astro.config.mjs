// @ts-check
import { defineConfig, envField } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Every page is prerendered (static HTML) unless it opts out with
  // `export const prerender = false`. Only `/` opts out, so the Worker
  // (and therefore the middleware) only runs for the home route.
  output: 'static',
  adapter: cloudflare({ imageService: 'passthrough' }),
  // No sessions needed; avoids auto-provisioning a KV namespace on deploy.
  session: false,

  env: {
    schema: {
      // Build-time values, inlined into the static pages and the Worker.
      PUBLIC_POSTHOG_KEY: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_POSTHOG_HOST: envField.string({
        context: 'client',
        access: 'public',
        default: 'https://us.i.posthog.com',
      }),
      PUBLIC_POSTHOG_EXPERIMENT_FLAG: envField.string({
        context: 'client',
        access: 'public',
        default: 'home-page-experiment',
      }),
    },
  },
});
