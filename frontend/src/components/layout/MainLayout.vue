<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useIdleLogout } from '@/composables/useIdleLogout';
import AppNavbar from './AppNavbar.vue';
import ToastHost from './ToastHost.vue';
import ModalHost from './ModalHost.vue';
import CommandPalette from './CommandPalette.vue';
import ModuleDrawer from './ModuleDrawer.vue';
import ParticlesBackground from './ParticlesBackground.vue';

const auth = useAuthStore();

useIdleLogout();

onMounted(() => {
    auth.fetchModuleStatus();
});
</script>

<template>
    <ParticlesBackground />
    <AppNavbar />
    <main class="m2-main-content">
        <router-view />
    </main>
    <ToastHost />
    <ModalHost />
    <CommandPalette />
    <ModuleDrawer />
</template>
