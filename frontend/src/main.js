import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { i18n, initI18n } from './i18n';
import { useThemeStore } from './stores/theme';
import './assets/shared.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(i18n);

useThemeStore().init();

initI18n().finally(() => app.mount('#app'));
