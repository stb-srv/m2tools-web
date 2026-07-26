<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const isOpen = ref(false);
const workspaces = ref([]);
const activeId = ref(null);
const limit = ref(0);

const activeWorkspace = computed(() => workspaces.value.find(w => w.id === activeId.value) || { name: 'Persönlich' });
// Quota is per workspace, not account-wide - the bar shows the *active*
// workspace's own usage against its own limit (see storageService.checkQuota()).
const usage = computed(() => activeWorkspace.value.usage || 0);
const usageMb = computed(() => (usage.value / 1024 / 1024).toFixed(1));
const limitMb = computed(() => (limit.value / 1024 / 1024).toFixed(0));
const isDanger = computed(() => usage.value > limit.value * 0.9);
const usagePercent = computed(() => Math.min(100, (usage.value / (limit.value || 1)) * 100));

async function load() {
    try {
        const res = await auth.authFetch('/api/workspaces');
        const data = await res.json();
        workspaces.value = data?.workspaces || [];
        activeId.value = data?.activeId ?? null;
        limit.value = data?.limit || 0;
    } catch (e) {
        console.error('[WorkspaceSwitcher] load error:', e);
    }
}

async function selectWorkspace(id) {
    const res = await auth.authFetch('/api/workspaces/select', {
        method: 'POST',
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        ui.toast('Workspace gewechselt', 'success');
        // A full reload is deliberate here: workspace selection scopes
        // data across every module (items, mobs, quests, ...), and a
        // reload is the simplest way to guarantee nothing keeps
        // showing stale, previous-workspace state.
        setTimeout(() => window.location.reload(), 500);
    }
    isOpen.value = false;
}

function onDocumentClick() {
    isOpen.value = false;
}

onMounted(() => {
    load();
    document.addEventListener('click', onDocumentClick);
});
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
    <div class="m2-dropdown m2-ws-switcher-wrapper" @click.stop>
        <button id="m2-ws-toggle" class="m2-btn-dropdown" @click="isOpen = !isOpen">
            <i class="fas fa-project-diagram"></i>
            <span>{{ activeWorkspace.name }}</span>
            <i class="fas fa-chevron-down"></i>
        </button>
        <div id="m2-ws-menu" class="m2-dropdown-menu" :class="{ show: isOpen }">
            <div class="m2-dropdown-header">Workspaces</div>
            <a
                v-for="w in workspaces"
                :key="w.id"
                href="#"
                class="m2-dropdown-item"
                :class="{ active: w.id === activeId }"
                @click.prevent="selectWorkspace(w.id)"
            >
                {{ w.team_id ? '👥' : '👤' }} {{ w.name }}
            </a>

            <div class="m2-dropdown-divider"></div>

            <div class="m2-storage-status">
                <div class="m2-storage-label">
                    <span>Speicherplatz ({{ activeWorkspace.name }})</span>
                    <span>{{ usageMb }}MB / {{ limitMb }}MB</span>
                </div>
                <div class="m2-storage-bar">
                    <div class="m2-storage-fill" :class="{ danger: isDanger }" :style="{ width: usagePercent + '%' }"></div>
                </div>
            </div>

            <div class="m2-dropdown-divider"></div>
            <router-link to="/workspaces.html" class="m2-dropdown-item"><i class="fas fa-cog"></i> Workspaces verwalten</router-link>
            <router-link to="/teams.html" class="m2-dropdown-item"><i class="fas fa-users"></i> Teams verwalten</router-link>
        </div>
    </div>
</template>
