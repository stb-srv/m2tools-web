<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useUiStore } from '@/stores/ui';
import { switchLang } from '@/i18n';
import WorkspaceSwitcher from './WorkspaceSwitcher.vue';

const route = useRoute();
const router = useRouter();
const { locale } = useI18n();
const auth = useAuthStore();
const theme = useThemeStore();
const ui = useUiStore();

const isAuthPage = computed(() => route.path.includes('login.html') || route.path.includes('register.html') || route.path.includes('setup.html'));

const avatarInitial = computed(() => {
    const name = auth.user?.displayName || auth.user?.username || '';
    return name.charAt(0).toUpperCase();
});

const displayName = computed(() => auth.user?.displayName || auth.user?.username || '');

const themeIcon = computed(() => (theme.theme === 'dark' ? '☀️' : '🌙'));

function toggleLang() {
    switchLang(locale.value === 'de' ? 'en' : 'de');
}
</script>

<template>
    <nav id="m2-navbar" class="m2-navbar">
        <div id="m2-navbar-left" class="m2-nav-left">
            <router-link to="/index.html" class="m2-logo">M2 <span>TOOLS</span></router-link>
            <button class="m2-control-btn with-text" title="Module durchsuchen" @click="ui.toggleModuleDrawer()">
                🧰 <span>Module</span>
            </button>
            <WorkspaceSwitcher v-if="auth.isLoggedIn" />
        </div>

        <div class="m2-nav-right">
            <button class="m2-control-btn with-text" title="Command Palette (Strg+K)" @click="ui.toggleCommandPalette()">
                🔍 <span>Suche</span>
            </button>

            <button class="m2-control-btn with-text" title="Patch Notes" @click="router.push('/patch_notes.html')">
                ⭐ <span>{{ $t('nav.patch_notes', 'Patch Notes') }}</span>
            </button>

            <button class="m2-control-btn with-text lang-toggle-btn" title="Switch Language" @click="toggleLang">
                {{ locale === 'de' ? '🇩🇪' : '🇬🇧' }} <span>Sprache</span>
            </button>

            <button id="m2-theme-btn" class="m2-control-btn with-text theme-toggle-btn" :title="`Switch to ${theme.theme === 'dark' ? 'Light' : 'Dark'} Mode`" @click="theme.toggle()">
                {{ themeIcon }} <span>Theme</span>
            </button>

            <button
                v-if="auth.isLoggedIn && auth.user?.role === 'admin'"
                class="m2-control-btn with-text"
                title="Admin Panel (Berechtigungen)"
                @click="router.push('/admin.html')"
            >
                🛡️ <span>Admin</span>
            </button>

            <template v-if="auth.isLoggedIn">
                <div class="m2-user-profile" @click="router.push('/account.html')">
                    <div class="m2-avatar">{{ avatarInitial }}</div>
                    <span class="m2-user-name">{{ displayName }}</span>
                </div>

                <button class="m2-control-btn" title="Hilfe / Guide" @click="router.push('/guide.html')">📖</button>

                <button class="m2-control-btn with-text" title="Logout" @click="auth.logout()">
                    🚪 <span>Logout</span>
                </button>
            </template>
            <a v-else-if="!isAuthPage" href="/login.html" class="m2-btn m2-btn-primary" @click.prevent="router.push('/login.html')">
                🔑 <span>Login</span>
            </a>
        </div>
    </nav>
</template>
