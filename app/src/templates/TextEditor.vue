<script setup lang="ts">
// 纯文本编辑器:单个 FieldEditor。
import { computed } from 'vue';
import type { Content, FieldStyle, TextContent } from 'shared';
import FieldEditor from '../components/FieldEditor.vue';

const props = defineProps<{ modelValue: Content }>();
const emit = defineEmits<{ 'update:modelValue': [Content] }>();

const c = computed<TextContent>(() =>
  props.modelValue.type === 'text'
    ? (props.modelValue as TextContent)
    : { type: 'text', text: { text: '', align: 'left', fontSize: 14 } },
);

function patch(v: FieldStyle) {
  emit('update:modelValue', { type: 'text', text: v });
}
</script>

<template>
  <FieldEditor :model-value="c.text" @update:model-value="patch" label="文本" placeholder="任意文本…(可多行)" />
</template>
