<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useUiStore } from '@/stores/ui';

const router = useRouter();
const auth = useAuthStore();
const theme = useThemeStore();
const ui = useUiStore();

const query = ref('');
const selectedIndex = ref(0);
const inputRef = ref(null);
const resultsRef = ref(null);

const commands = computed(() => {
    const list = [
        { id: 'changelog', title: 'Changelog / Neues ansehen', icon: '⭐', action: () => router.push('/patch_notes.html') },
        { id: 'theme', title: 'Erscheinungsbild wechseln (Dark/Light)', icon: '🌓', action: () => theme.toggle() },
        { id: 'dashboard', title: 'Zum Dashboard', icon: '🏠', action: () => router.push('/index.html') }
    ];

    auth.modules.forEach(m => {
        if (m.id === 'dashboard' || m.id === 'item_manager') return;
        if (!auth.canAccess(m.access_level)) return;
        list.push({ id: 'mod_' + m.id, title: m.name + ' öffnen', icon: m.icon || '🛠️', shortcut: 'Modul', action: () => router.push(m.url) });
    });

    if (auth.isLoggedIn) {
        if (auth.user?.role === 'admin') {
            list.push({ id: 'admin', title: 'Admin Panel', icon: '🛡️', shortcut: 'Admin', action: () => router.push('/admin.html') });
        }
        list.push({ id: 'account', title: 'Einstellungen / Profil', icon: '👤', action: () => router.push('/account.html') });
        list.push({ id: 'logout', title: 'Sicher abmelden', icon: '🚪', action: () => auth.logout() });
    }

    return list;
});

const filtered = computed(() => {
    const q = query.value.toLowerCase();
    if (!q) return commands.value;
    return commands.value.filter(c => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
});

function close() {
    ui.commandPaletteOpen = false;
}

function run(cmd) {
    close();
    cmd.action();
}

function onKeydown(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex.value = (selectedIndex.value + 1) % filtered.value.length; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex.value = (selectedIndex.value - 1 + filtered.value.length) % filtered.value.length; }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered.value[selectedIndex.value]) run(filtered.value[selectedIndex.value]); }
}

function onOverlayClick(e) {
    if (e.target === e.currentTarget) close();
}

function onGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.commandPaletteOpen = !ui.commandPaletteOpen;
    }
}

watch(query, () => { selectedIndex.value = 0; });

watch(() => ui.commandPaletteOpen, async (open) => {
    if (open) {
        query.value = '';
        selectedIndex.value = 0;
        await nextTick();
        inputRef.value?.focus();
    }
});

watch(selectedIndex, async () => {
    await nextTick();
    resultsRef.value?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
});

onMounted(() => window.addEventListener('keydown', onGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown));
</script>

<template>
    <div v-if="ui.commandPaletteOpen" class="m2-cmd-overlay" @click="onOverlayClick">
        <div class="m2-cmd-palette">
            <div class="m2-cmd-header">
                <span class="m2-cmd-icon">🔍</span>
                <input
                    ref="inputRef"
                    v-model="query"
                    type="text"
                    class="m2-cmd-input"
                    placeholder="Womit kann ich helfen? (Modul, Settings...)"
                    autocomplete="off"
                    @keydown="onKeydown"
                >
            </div>
            <div ref="resultsRef" class="m2-cmd-results">
                <div v-if="filtered.length === 0" class="m2-cmd-empty">Kein passendes Kommando gefunden.</div>
                <div
                    v-for="(cmd, idx) in filtered"
                    :key="cmd.id"
                    class="m2-cmd-item"
                    :class="{ selected: idx === selectedIndex }"
                    @mouseenter="selectedIndex = idx"
                    @click="run(cmd)"
                >
                    <span class="m2-cmd-item-icon">{{ cmd.icon }}</span>
                    <span class="m2-cmd-item-text">{{ cmd.title }}</span>
                    <span v-if="cmd.shortcut" class="m2-cmd-item-shortcut">{{ cmd.shortcut }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
