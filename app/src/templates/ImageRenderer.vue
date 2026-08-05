<script setup lang="ts">
// 图片渲染器:contain 保持比例居中(可能留白)。
// dataUrl 形态:本机 base64 dataURL / peer blob URL,二者 <img> 均可直接显示。
import { computed } from 'vue';
import type { Content, ImageContent } from 'shared';

const props = defineProps<{ content: Content }>();
const c = computed<ImageContent | null>(() =>
  props.content.type === 'image' && props.content.dataUrl
    ? (props.content as ImageContent) : null,
);
</script>

<template>
  <img v-if="c" :src="c.dataUrl" class="img-render" :alt="c.name ?? ''" />
</template>

<style scoped>
.img-render {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
</style>
