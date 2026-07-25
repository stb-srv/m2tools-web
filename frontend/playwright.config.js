import { defineConfig } from '@playwright/test';

// Smoke tests run against the real production server (node server.js
// serving the built public/dist/), not the Vite dev proxy - this is the
// integration surface that matters (router/guard/static-serving), so
// `npm run build` must be run before `npx playwright test`.
export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3001',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node ../server.js',
        url: 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 15000
    }
});
