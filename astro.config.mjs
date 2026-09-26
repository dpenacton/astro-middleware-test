// @ts-check
import { defineConfig, envField } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Fully static site. The `/` redirect is handled by the Cloudflare Pages
  // Function in `functions/index.ts`, not by Astro.
  output: 'static',

  env: {
    schema: {
      // Build-time values, inlined into the static pages' PostHog snippet.
      // The Pages Function reads the same names from its runtime env.
      PUBLIC_POSTHOG_KEY: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_POSTHOG_HOST: envField.string({
        context: 'client',
        access: 'public',
        default: 'https://us.i.posthog.com',
      }),
      PUBLIC_POSTHOG_EXPERIMENT_FLAG: envField.string({
        context: 'client',
        access: 'public',
        default: 'server-side-ab-test',
      }),
    },
  },
});
