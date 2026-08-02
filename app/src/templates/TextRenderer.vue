<script setup lang="ts">
// 纯文本渲染器。安全:v-text 输出。
import { computed } from 'vue';
import type { Content, TextContent } from 'shared';

const props = defineProps<{ content: Content }>();
const c = computed<TextContent | null>(() =>
  props.content.type === 'text' ? (props.content as TextContent) : null,
);
</script>

<template>
  <div v-if="c" class="text-render" :style="{ textAlign: c.text.align, fontSize: c.text.fontSize + 'pt' }">
    <span class="text" v-text="c.text.text"></span>
  </div>
</template>

<style scoped>
.text-render { width: 100%; line-height: 1.5; }
.text { display: inline-block; white-space: pre-line; word-break: break-word; }
</style>
