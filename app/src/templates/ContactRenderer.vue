<script setup lang="ts">
// [地点/电话/联系人] 渲染器:三字段按规范顺序(地点→电话→联系人)纵向堆叠。
// 安全:用户文本用 v-text 输出,不做 HTML 解释,防 XSS。
import { computed } from 'vue';
import type { ContactContent, Content, FieldStyle } from 'shared';

const props = defineProps<{ content: Content }>();

const fields = computed<{ key: string; f: FieldStyle }[]>(() => {
  if (props.content.type !== 'contact') return [];
  const c = props.content as ContactContent;
  return [
    { key: 'location', f: c.location },
    { key: 'phone', f: c.phone },
    { key: 'contact', f: c.contact },
  ].filter((x) => x.f.text.trim().length > 0);
});
</script>

<template>
  <div class="contact-render">
    <div
      v-for="item in fields"
      :key="item.key"
      class="field-block"
      :style="{ textAlign: item.f.align, fontSize: item.f.fontSize + 'pt' }"
    >
      <span class="text" v-text="item.f.text"></span>
    </div>
  </div>
</template>

<style scoped>
.contact-render { width: 100%; }
.field-block { margin: 0; line-height: 1.5; }
.text { display: inline-block; white-space: pre-line; word-break: break-word; }
</style>
