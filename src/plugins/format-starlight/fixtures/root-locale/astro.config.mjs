import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Lantern',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        he: { label: 'עברית', lang: 'he', dir: 'rtl' },
        'pt-br': { label: 'Português do Brasil', lang: 'pt-BR' },
      },
    }),
  ],
});
