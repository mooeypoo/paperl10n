import { defineConfig } from 'vitepress'
import { en } from './en'
import { he } from './he'

export default defineConfig({
  srcDir: './src',
  locales: {
    root: { label: 'English', ...en },
    he: { label: 'עברית', ...he },
  },
})
