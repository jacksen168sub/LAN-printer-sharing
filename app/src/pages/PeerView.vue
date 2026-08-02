<script setup lang="ts">
// 对端内容预览/打印页:进入时主动 req-content 拉取,收到后用 PrintSheet 渲染。
// 打印前按对方布局方向注入 @page size,打印时 .no-print 隐藏界面、只输出纸张。
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { PrintLayout } from 'shared';
import PrintSheet from '../components/PrintSheet.vue';
import { network, requestContent } from '../stores/network';
import { useI18n } from 'vue-i18n';
import { peerStateLabel } from '../i18n';

const props = defineProps<{ id: string }>();
const router = useRouter();
const { t } = useI18n();

const peerContent = computed(() => network.peerContents[props.id] ?? null);
const peerStateLabel_ = computed(() => peerStateLabel(network.peerStates[props.id]));

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
      <button type="button" class="btn" @click="router.back()">{{ t('common.back') }}</button>
      <span class="toolbar-title">{{ t('peer.deviceTitle', { id }) }}</span>
      <span class="peer-state">{{ t('home.channel') }}:{{ peerStateLabel_ }}</span>
      <button v-if="peerContent" type="button" class="btn btn-primary" @click="doPrint">{{ t('common.print') }}</button>
    </div>

    <div v-if="peerContent" class="sheet-area">
      <PrintSheet :content="peerContent.content" :layout="peerContent.layout" :auto-fit="true" />
    </div>

    <section v-else class="card no-print">
      <div class="empty">{{ t('peer.waitingContent') }}</div>
      <div class="hint">{{ t('home.channel') }}: {{ peerStateLabel_ }}. {{ t('peer.waitingHint') }}</div>
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
