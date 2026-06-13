import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleRequest } from './server/api.js';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          handleRequest(req, res, next).catch(next);
        });
      },
    },
  ],
});
