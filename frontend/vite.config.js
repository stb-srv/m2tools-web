import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The repo already serves user data at /assets/items/*.png (stable,
// vnum-keyed URLs) from public/assets/ via Express. Vite's default output
// folder for built JS/CSS is also literally named "assets" - if left
// default, `vite build`'s emptyOutDir would collide with/shadow that
// directory. assetsDir moves the *built* assets elsewhere so the two
// never overlap.
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    build: {
        outDir: '../public/dist',
        assetsDir: 'app-assets',
        emptyOutDir: true
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3001',
            '/assets': 'http://localhost:3001',
            '/basic': 'http://localhost:3001',
            '/i18n': 'http://localhost:3001'
        }
    },
    test: {
        environment: 'happy-dom'
    }
});
