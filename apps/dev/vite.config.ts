import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { fixtureServer, LIVE_ROUTES } from './fixtureServer.ts'

const PSO = 'https://playsorceryonline.com'

// With PSO_API_KEY in .env.local the dev site proxies the analytics routes to PSO's public API
// (/api/v1) and adds the key on the way out, so it never reaches the browser. Without one, everything is served from
// fixtures/.
export default defineConfig(({ mode }) => {
  // fileURLToPath, not URL.pathname: on Windows pathname is "/C:/…" and the env file is never found.
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '')
  const key = env.PSO_API_KEY?.trim()
  return {
    plugins: [react(), fixtureServer({ live: Boolean(key) })],
    define: { __PSO_DATA_MODE__: JSON.stringify(key ? 'live' : 'fixtures') },
    server: {
      port: 5180,
      proxy: key ? Object.fromEntries(Object.entries(LIVE_ROUTES).map(([route, upstream]) => [`^${route}(\\?|$)`, {
        target: PSO, changeOrigin: true, rewrite: (path) => upstream + path.slice(route.length),
        headers: upstream.startsWith('/api/v1') ? { 'x-pso-api-key': key } : undefined,
      }])) : undefined,
    },
  }
})
