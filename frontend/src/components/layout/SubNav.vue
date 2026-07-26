<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const auth = useAuthStore();

const links = computed(() => auth.modules.filter(m =>
    m.id !== 'dashboard' && m.id !== 'item_manager' && m.id !== 'server_connections' && auth.canAccess(m.access_level)
));

function isActive(m) {
    return route.path === m.url || (m.url !== '/' && route.path.startsWith(m.url));
}
</script>

<template>
    <div v-if="links.length" id="m2-sub-navbar" class="m2-sub-navbar">
        <div class="m2-sub-nav-links">
            <router-link
                v-for="m in links"
                :key="m.id"
                :to="m.url"
                class="m2-sub-nav-item"
                :class="{ active: isActive(m) }"
            >
                {{ m.icon }}&nbsp;<span>{{ $t(`nav.${m.id}`, m.name) }}</span>
            </router-link>
        </div>
    </div>
</template>
