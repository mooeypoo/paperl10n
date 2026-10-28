import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Lantern',
      defaultLocale: 'en',
      locales: {
        en: { label: 'English' },
        he: { label: 'עברית', dir: 'rtl' },
      },
    }),
  ],
});
