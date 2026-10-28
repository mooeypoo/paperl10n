import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Lantern',
      locales: {
        // English at the root; Hebrew in a folder named in words.
        root: { label: 'English', lang: 'en' },
        hebrew: { label: 'עברית', lang: 'he', dir: 'rtl' },
        'zh-cn': { label: '简体中文', lang: 'zh-CN' },
      },
    }),
  ],
});
