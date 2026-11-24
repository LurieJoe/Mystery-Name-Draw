import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Relative asset paths, so the build works unchanged whether it is
  // served from a domain root (mysterynamedraw.com) or a GitHub Pages
  // project subpath (luriejoe.github.io/Mystery-Name-Draw/). With an
  // absolute base, one of those two always 404s on its assets.
  base: './',
})
