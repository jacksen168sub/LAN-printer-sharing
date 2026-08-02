<script setup lang="ts">
// 对端内容预览/打印页:进入时主动 req-content 拉取,收到后用 PrintSheet 渲染。
// 打印前按对方布局方向注入 @page size,打印时 .no-print 隐藏界面、只输出纸张。
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { PrintLayout } from 'shared';
import PrintSheet from '../components/PrintSheet.vue';
import { network, requestContent } from '../stores/network';

const props = defineProps<{ id: string }>();
const router = useRouter();

const peerContent = computed(() => network.peerContents[props.id] ?? null);
const peerState = computed(() => network.peerStates[props.id] || '未知');

onMounted(() => {
  // 主动拉一次:补 push-on-connect 漏掉的情形(如先连后改内容、或本次会话尚未推送)
  requestContent(props.id);
});

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
  if (!peerContent.value) return;
  ensurePageStyle(peerContent.value.layout.orientation);
  requestAnimationFrame(() => window.print());
}
</script>

<template>
  <div class="editor">
    <div class="toolbar no-print">
      <button type="button" class="btn" @click="router.back()">返回</button>
      <span class="toolbar-title">设备 {{ id }}</span>
      <span class="peer-state">通道:{{ peerState }}</span>
      <button v-if="peerContent" type="button" class="btn btn-primary" @click="doPrint">打印</button>
    </div>

    <div v-if="peerContent" class="sheet-area">
      <PrintSheet :content="peerContent.content" :layout="peerContent.layout" :auto-fit="true" />
    </div>

    <section v-else class="card no-print">
      <div class="empty">尚未收到该设备的内容…</div>
      <div class="hint">通道状态:{{ peerState }}。若长时间无内容,请确认对方已编辑并保存,且双方都在同一局域网、信令已连接。</div>
    </section>
  </div>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.toolbar-title { font-size: 14px; color: #666; font-family: ui-monospace, monospace; }
.peer-state { font-size: 12px; color: #999; margin-left: auto; }
.sheet-area { min-width: 0; }
.card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.empty { color: #999; padding: 12px 0; }
.hint { font-size: 12px; color: #888; margin-top: 8px; }
</style>
