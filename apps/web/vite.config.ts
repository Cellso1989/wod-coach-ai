import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  return {
    plugins: [react()],
    // O .env vive na raiz do monorepo, não em apps/web — sem isto, Vite
    // nunca encontra VITE_API_URL e import.meta.env.VITE_API_URL fica
    // sempre undefined em dev (bug real encontrado e corrigido: fazia o
    // frontend chamar a própria porta 5173 em vez de localhost:3333).
    envDir: '../../',
    server: {
      port: 5173,
      // The push service worker verifies the session through the app's own origin.
      proxy: {
        '/api': {
          target: env.VITE_API_URL || `http://localhost:${env.API_PORT || '3333'}`,
          changeOrigin: true,
        },
      },
    },
  };
});
