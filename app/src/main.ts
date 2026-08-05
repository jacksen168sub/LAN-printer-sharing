import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { startNetwork } from './stores/network';
import { initContentStore } from './stores/content-db';
import { i18n } from './i18n';
import './styles/print.css';

// @material/web 组件(按需,导入即注册 custom element)
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';
import '@material/web/icon/icon.js';

const app = createApp(App);
app.use(router);
app.use(i18n);
// 启动期预热:IDB 读取 + 旧 localStorage 迁移,完成后再挂载(几毫秒~几十毫秒)
// IDB 不可用时 finally 仍挂载,缓存 null,UI 显示无内容,优雅降级
initContentStore().finally(() => {
  app.mount('#app');
  startNetwork();
});
