import { createApp } from 'vue';
import App from './App.vue';
import { currentLocale, t } from './i18n';
import router from './router';
import './styles.css';

document.documentElement.lang = currentLocale;
document.title = t('app.title');
createApp(App).use(router).mount('#app');
