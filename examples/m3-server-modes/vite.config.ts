import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Workspace sources are already resolvable via pnpm's link-workspace-packages
  // (set in .npmrc); no alias needed.
});
