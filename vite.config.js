import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/car-showroom-race-demo/' : '/',
}));
