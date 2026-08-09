import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
