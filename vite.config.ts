import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    base: '/Keycap-Shadowboard-Generator/',
    plugins: [react()],
    build: {
        target: 'esnext',
        cssMinify: true,
    },
    esbuild: {
        drop: ['console', 'debugger'],
    },
});
