<script setup lang="ts">
// 打印/预览页:全屏渲染 PrintSheet,点打印调用浏览器打印对话框。
// 打印前按布局方向动态注入 @page size,确保纸张方向正确。
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { PrintLayout } from 'shared';
import PrintSheet from '../components/PrintSheet.vue';
import { getOwnContent } from '../stores/identity';

const router = useRouter();
const own = getOwnContent();
const content = computed(() => own?.content ?? null);
const layout = computed(() => own?.layout ?? null);

function ensurePageStyle(orient: PrintLayout['orientation']) {
  let el = document.getElementById('lps-print-page') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'lps-print-page';
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: A4 ${orient}; margin: 0; }`;
}

function doPrint() {
  if (!layout.value) return;
  ensurePageStyle(layout.value.orientation);
  // 下一帧触发,确保 @page 样式已应用
  requestAnimationFrame(() => window.print());
}
</script>

<template>
  <section v-if="own && content && layout">
    <div class="toolbar no-print">
      <button type="button" class="btn" @click="router.back()">返回</button>
      <button type="button" class="btn btn-primary" @click="doPrint">打印</button>
    </div>
    <div class="hint no-print">提示:打印对话框里选 A4、无边距、关闭页眉页脚。</div>
    <PrintSheet :content="content" :layout="layout" :auto-fit="true" />
  </section>
  <section v-else class="card no-print">
    <p>尚未保存内容,<router-link to="/edit">去编辑</router-link>。</p>
  </section>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 8px; justify-content: space-between; }
.hint { font-size: 12px; color: #888; margin-bottom: 8px; }
.card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
</style>
