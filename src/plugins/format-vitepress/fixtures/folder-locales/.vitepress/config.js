import { defineConfig } from 'vitepress'

export default defineConfig({
  locales: {
    en: { label: 'English', lang: 'en', link: '/en/' },
    he: { label: 'עברית', lang: 'he', dir: 'rtl', link: '/he/' },
  },
})
