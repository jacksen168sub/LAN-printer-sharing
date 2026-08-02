import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './pages/HomeView.vue';
import PeerView from './pages/PeerView.vue';
import EditorView from './pages/EditorView.vue';
import PrintView from './pages/PrintView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/peer/:id', name: 'peer', component: PeerView, props: true },
    { path: '/edit', name: 'edit', component: EditorView },
    { path: '/print', name: 'print', component: PrintView },
  ],
});
