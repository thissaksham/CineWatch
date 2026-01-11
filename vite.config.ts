import { defineConfig, loadEnv, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Agent } from 'node:https'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const env = loadEnv(mode, process.cwd(), '');

  // Debug: Check if Key is loaded (Do not log the actual key)
  console.log(`[Vite] Loading Env. API Key Present: ${!!env.VITE_TMDB_API_KEY}`);

  // Helper to resolve TMDB IP using Google DNS (Bypass ISP Block)
  const resolveTMDB = async () => {
    try {
      console.log('[Vite] resolving api.themoviedb.org via Google DNS...');
      const res = await fetch('https://dns.google/resolve?name=api.themoviedb.org');
      const data = await res.json() as { Answer?: { type: number; data: string }[] };
      const ip = data.Answer?.find(a => a.type === 1)?.data; // Type 1 is A Record
      if (ip && typeof ip === 'string') {
        const cleanIp = ip.trim();
        console.log(`[Vite] Resolved TMDB to: "${cleanIp}"`);
        return cleanIp;
      }
    } catch (e) {
      console.error('[Vite] DNS Bypass Failed:', e);
    }
    return null;
  };

  const tmdbIp = await resolveTMDB();

  // Use the resolved IP if available, else hostname
  const tmdbTarget = tmdbIp ? `https://${tmdbIp}/3` : 'https://api.themoviedb.org/3';

  console.log(`[Vite] Proxying TMDB to: ${tmdbTarget}`);

  // Agent with explicit SNI
  // We connect to the IP (target), but tell TLS we are connecting to 'api.themoviedb.org'
  const tmdbAgent = new Agent({
    keepAlive: true,
    servername: 'api.themoviedb.org',
  });

  const proxyConfig = {
    '/api/tmdb': {
      target: tmdbTarget,
      changeOrigin: true,
      secure: false,
      agent: tmdbAgent,
      rewrite: (path: string) => {
        const newPath = path.replace(/^\/api\/tmdb/, '');
        const separator = newPath.includes('?') ? '&' : '?';

        if (!env.VITE_TMDB_API_KEY) {
          console.error('[Proxy] ❌ FATAL: VITE_TMDB_API_KEY is missing in environment variables!');
          return newPath;
        }
        return `${newPath}${separator}api_key=${env.VITE_TMDB_API_KEY}`;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configure: (proxy: any) => {
        proxy.on('proxyReq', ((proxyReq: { setHeader: (name: string, value: string) => void }) => {
          // Ensure Host header matches SNI
          proxyReq.setHeader('Host', 'api.themoviedb.org');
        }) as (...args: unknown[]) => void);
        proxy.on('error', ((err: Error) => {
          console.log('[Proxy] TMDB Error:', err);
        }) as (...args: unknown[]) => void);
      }
    }
  };

  return {
    plugins: [...react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/components': path.resolve(__dirname, './src/components'),
        '@/utils': path.resolve(__dirname, './src/utils'),
        '@/constants': path.resolve(__dirname, './src/constants'),
        '@/hooks': path.resolve(__dirname, './src/hooks'),
        '@/styles': path.resolve(__dirname, './src/styles'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: proxyConfig
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      proxy: proxyConfig
    }
  };
})
