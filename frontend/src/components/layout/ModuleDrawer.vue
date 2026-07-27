<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const searchQuery = ref('');
const searchInputRef = ref(null);

// Same grouping/ordering as the Dashboard and Admin panel - one category
// scheme used everywhere modules are listed.
const CATEGORY_ORDER = ['System', 'Admin', 'Database', 'Development'];

const links = computed(() => auth.modules.filter(m =>
    m.id !== 'dashboard' && m.id !== 'item_manager' && m.id !== 'server_connections' && auth.canAccess(m.access_level)
));

const filteredLinks = computed(() => {
    const q = searchQuery.value.toLowerCase();
    if (!q) return links.value;
    return links.value.filter(m => m.name.toLowerCase().includes(q));
});

const groupedLinks = computed(() => {
    const groups = {};
    for (const m of filteredLinks.value) {
        const cat = m.category || 'Sonstiges';
        (groups[cat] = groups[cat] || []).push(m);
    }
    return Object.keys(groups)
        .sort((a, b) => {
            const ai = CATEGORY_ORDER.indexOf(a);
            const bi = CATEGORY_ORDER.indexOf(b);
            if (ai === -1 && bi === -1) return a.localeCompare(b);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        })
        .map(category => ({ category, items: groups[category] }));
});

function isActive(m) {
    return route.path === m.url || (m.url !== '/' && route.path.startsWith(m.url));
}

function close() {
    ui.moduleDrawerOpen = false;
}

function onKeydown(e) {
    if (e.key === 'Escape') close();
}

watch(() => ui.moduleDrawerOpen, async (open) => {
    if (open) {
        searchQuery.value = '';
        await nextTick();
        searchInputRef.value?.focus();
    }
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <Transition name="m2-drawer">
        <div v-if="ui.moduleDrawerOpen" class="m2-drawer-overlay" @click.self="close">
            <aside class="m2-module-drawer">
                <div class="m2-drawer-header">
                    <h3>🧰 Module</h3>
                    <button class="m2-drawer-close" title="Schließen (Esc)" @click="close">✕</button>
                </div>
                <input
                    ref="searchInputRef"
                    v-model="searchQuery"
                    type="text"
                    class="m2-input m2-drawer-search"
                    placeholder="Modul suchen..."
                    autocomplete="off"
                >
                <div class="m2-drawer-body">
                    <div v-if="filteredLinks.length === 0" class="m2-drawer-empty">Keine Module gefunden.</div>
                    <div v-for="group in groupedLinks" :key="group.category" class="m2-drawer-group">
                        <div class="m2-drawer-group-title">{{ group.category }}</div>
                        <router-link
                            v-for="m in group.items"
                            :key="m.id"
                            :to="m.url"
                            class="m2-drawer-item"
                            :class="{ active: isActive(m) }"
                            @click="close"
                        >
                            <span class="m2-drawer-item-icon">{{ m.icon || '🛠️' }}</span>
                            <span class="m2-drawer-item-name">{{ $t(`nav.${m.id}`, m.name) }}</span>
                        </router-link>
                    </div>
                </div>
            </aside>
        </div>
    </Transition>
</template>

<style scoped>
.m2-drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 6000; /* above the navbar (5000) and sub-elements */
    display: flex;
    justify-content: flex-end;
}

.m2-module-drawer {
    width: 360px;
    max-width: 90vw;
    height: 100%;
    background: var(--bg-card);
    border-left: 1px solid var(--border-color);
    box-shadow: -20px 0 50px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(20px);
}

.m2-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px 15px;
    border-bottom: 1px solid var(--border-color);
}
.m2-drawer-header h3 {
    font-family: var(--font-heading);
    color: var(--gold-primary);
    font-size: 1.2rem;
    letter-spacing: 1px;
}
.m2-drawer-close {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: var(--transition);
}
.m2-drawer-close:hover { border-color: var(--gold-border); color: var(--gold-primary); background: var(--bg-hover); }

.m2-drawer-search {
    margin: 15px 20px;
    width: calc(100% - 40px);
}

.m2-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 0 12px 20px;
}

.m2-drawer-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 30px 10px;
    font-size: 0.9rem;
    font-style: italic;
}

.m2-drawer-group { margin-bottom: 15px; }
.m2-drawer-group-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-muted);
    padding: 10px 12px 6px;
}

.m2-drawer-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 600;
    transition: var(--transition);
}
.m2-drawer-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.m2-drawer-item.active { background: rgba(195, 163, 74, 0.1); color: var(--gold-primary); }
.m2-drawer-item-icon { font-size: 1.2rem; width: 24px; text-align: center; }

/* Backdrop fade + panel slide, driven off the same v-if transition. */
.m2-drawer-enter-active, .m2-drawer-leave-active { transition: opacity 0.25s ease; }
.m2-drawer-enter-from, .m2-drawer-leave-to { opacity: 0; }
.m2-drawer-enter-active .m2-module-drawer, .m2-drawer-leave-active .m2-module-drawer { transition: transform 0.3s ease; }
.m2-drawer-enter-from .m2-module-drawer, .m2-drawer-leave-to .m2-module-drawer { transform: translateX(100%); }
</style>
