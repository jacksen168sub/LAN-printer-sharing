<script setup lang="ts">
// 图片渲染器:contain 保持比例居中(可能留白)。
// dataUrl 形态:本机 base64 dataURL / peer blob URL,二者 <img> 均可直接显示。
// loading 态:元数据已到(transferId 有值)但 blob 未收齐(dataUrl 空),显示 spinner + 进度。
import { computed, inject, type Ref } from 'vue';
import type { Content, ImageContent } from 'shared';
import { network } from '../stores/network';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ content: Content }>();
const { t } = useI18n();

const c = computed<ImageContent | null>(() =>
  props.content.type === 'image' && props.content.dataUrl
    ? (props.content as ImageContent) : null,
);

// 图片传输中:元数据已到(transferId 有值)但二进制未收齐(dataUrl 空)
const loading = computed(() =>
  props.content.type === 'image' &&
  (props.content as ImageContent).transferId != null &&
  !(props.content as ImageContent).dataUrl,
);

// peer 预览页注入 peer id,据此读传输进度;本机预览(PrintView)无注入 → 不显示百分比
const peerId = inject<Ref<string> | null>('peer-id', null);
const percent = computed(() => {
  if (!peerId?.value) return null;
  const p = network.peerImageProgress[peerId.value];
  return p ? Math.round((p.received / p.total) * 100) : null;
});
</script>

<template>
  <img v-if="c" :src="c.dataUrl" class="img-render" :alt="c.name ?? ''" />
  <div v-else-if="loading" class="img-loading">
    <div class="spinner" />
    <div class="loading-text">{{ t('peer.imageLoading') }}<span v-if="percent != null">{{ ' ' + percent + '%' }}</span></div>
  </div>
</template>

<style scoped>
.img-render {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.img-loading {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #888;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(0, 90, 193, 0.15);
  border-top-color: #005ac1;
  border-radius: 50%;
  animation: lps-spin 0.8s linear infinite;
}
.loading-text { font-size: 13px; }
@keyframes lps-spin { to { transform: rotate(360deg); } }
</style>
