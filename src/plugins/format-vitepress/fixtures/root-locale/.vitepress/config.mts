import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Lantern',
  description: 'A small library for lighting things up',
  locales: {
    root: { label: 'English', lang: 'en' },
    he: { label: 'עברית', lang: 'he', dir: 'rtl', link: '/he/' },
    'pt-br': { label: 'Português', lang: 'pt-BR' },
  },
  themeConfig: {
    search: {
      provider: 'local',
      options: {
        locales: { zh: { translations: { button: { buttonText: '搜索' } } } },
      },
    },
  },
})
