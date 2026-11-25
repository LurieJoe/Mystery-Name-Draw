import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
  plugins: [react()],

  // Injected as plain constants rather than read through
  // import.meta.env, which is syntax the render tests cannot compile:
  // they build CommonJS so Node can require the pages, and import.meta
  // is not allowed there. A constant works in both, and src/api/config
  // copes with it being absent.
  //
  // Both values are public. The secret key is named nowhere.
  define: {
    __SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    __SUPABASE_ANON_KEY__: JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
  },

  // Relative asset paths, so the build works unchanged whether it is
  // served from a domain root (mysterynamedraw.com) or a GitHub Pages
  // project subpath (luriejoe.github.io/Mystery-Name-Draw/). With an
  // absolute base, one of those two always 404s on its assets.
  base: './',
  }
})
