import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { locales } from './locales.mjs';

// Locales come from another module: Paper Lion can't read them without running code, so the
// plugin falls back to the folders it finds.
export default defineConfig({
  integrations: [starlight({ title: 'Lantern', defaultLocale: 'en', locales })],
});
