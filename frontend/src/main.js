import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n, initI18n } from './i18n';
import { useThemeStore } from './stores/theme';
import './assets/shared.css';

const app = createApp(App);
app.use(createPinia());
app.use(i18n);

useThemeStore().init();

initI18n().finally(() => app.mount('#app'));
