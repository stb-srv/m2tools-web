import { createRouter, createWebHistory } from 'vue-router';

// Full route table + auth guard land here in a later step; this
// skeleton exists first because stores/auth.js and the shared layout
// components (navbar/sub-nav active-link state) depend on the router
// instance already existing.
const routes = [];

const router = createRouter({
    history: createWebHistory(),
    routes
});

export default router;
