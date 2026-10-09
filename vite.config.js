import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { watch: { ignored: ['**/dist/**', '**/dist-exe/**', '**/desktop/bin/**', '**/desktop/obj/**', '**/share/**', '**/artifacts/**', '**/.tmp/**', '**/.tmp*/**'] } },
  optimizeDeps: { noDiscovery: true, exclude: ['three'] },
  build: { rollupOptions: { input: { platformer: 'platformer/index.html' }, output: { manualChunks: { three: ['three'] } } } },
});
