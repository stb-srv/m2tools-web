import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Automatic logout after inactivity - timeout is admin-configurable
 * (Admin panel -> System-Einstellungen, 0 = disabled), fetched via
 * auth.fetchIdleTimeout(). Mounted once in MainLayout so it covers every
 * authenticated page.
 */
export function useIdleLogout() {
    const auth = useAuthStore();
    const ui = useUiStore();
    let lastActivity = Date.now();
    let intervalId = null;

    function markActivity() {
        lastActivity = Date.now();
    }

    function checkIdle() {
        if (!auth.isLoggedIn) return;
        const timeoutMinutes = auth.idleTimeoutMinutes;
        if (!timeoutMinutes || timeoutMinutes <= 0) return;

        if (Date.now() - lastActivity >= timeoutMinutes * 60 * 1000) {
            auth.logout();
            ui.toast('Du wurdest wegen Inaktivität automatisch abgemeldet.', 'info');
        }
    }

    onMounted(() => {
        auth.fetchIdleTimeout();
        ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markActivity, { passive: true }));
        intervalId = setInterval(checkIdle, CHECK_INTERVAL_MS);
    });

    onUnmounted(() => {
        ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markActivity));
        if (intervalId) clearInterval(intervalId);
    });
}
