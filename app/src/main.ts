import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { startNetwork } from './stores/network';
import './styles/print.css';

// @material/web 组件(按需,导入即注册 custom element)
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/icon/icon.js';

const app = createApp(App);
app.use(router);
app.mount('#app');
startNetwork();
