import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { cartographer } from '@replit/vite-plugin-cartographer';
import { devBanner } from '@replit/vite-plugin-dev-banner';

export default defineConfig(({ command }) => {
const rawPort = process.env.WEB_PORT
  ?? process.env.PORT
  ?? (command === 'build' ? '4173' : undefined);

if (!rawPort) {
  throw new Error(
    'WEB_PORT or PORT environment variable is required for the dev/preview server.',
  );
}

const port = Number(rawPort);
const portSource = process.env.WEB_PORT
  ? 'WEB_PORT'
  : process.env.PORT
    ? 'PORT'
    : 'build-default';

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const rawApiPort = process.env.API_PORT;
const apiPort = rawApiPort ? Number(rawApiPort) : undefined;
const apiHost = process.env.API_HOST ?? '127.0.0.1';

if (
  rawApiPort
  && (apiPort === undefined || Number.isNaN(apiPort) || apiPort <= 0)
) {
  throw new Error(`Invalid API_PORT value: "${rawApiPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';

const apiProxy = apiPort
  ? {
      '/api': {
        target: `http://${apiHost}:${apiPort}`,
        changeOrigin: false,
      },
    }
  : undefined;
const webHost = process.env.WEB_HOST
  ?? (process.env.REPL_ID ? '0.0.0.0' : '127.0.0.1');

console.info(
  `[picture-flashcards-web] WEB_HOST=${webHost} source=${process.env.WEB_HOST ? 'environment' : process.env.REPL_ID ? 'replit-default' : 'local-default'} WEB_PORT=${port} source=${portSource} API_LISTENER=${apiPort ? `${apiHost}:${apiPort}` : 'same-origin/unconfigured'}`,
);

return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          cartographer({
            root: path.resolve(import.meta.dirname, '..'),
          }),
          devBanner(),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: webHost,
    allowedHosts: true,
    ...(apiProxy ? { proxy: apiProxy } : {}),
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: webHost,
    allowedHosts: true,
    ...(apiProxy ? { proxy: apiProxy } : {}),
  },
};
});
