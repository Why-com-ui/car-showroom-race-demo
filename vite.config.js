import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/car-showroom-race-demo/' : '/',
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');
          if (!normalizedId.includes('node_modules')) return undefined;
          if (normalizedId.includes('/three/examples/')) return 'three-examples';
          if (normalizedId.includes('/three/')) return 'three-core';
          if (normalizedId.includes('/dat.gui/')) return 'dat-gui';
          return undefined;
        },
      },
    },
  },
}));
