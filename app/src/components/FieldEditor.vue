<script setup lang="ts">
// 单个字段(地点/电话/联系人/纯文本)的编辑器:多行文本 + 对齐 + 字号。
// 用自写轻量控件而非 @material/web 表单组件,规避 lit/Vue 互操作摩擦(plan §7 回退策略)。
import { computed } from 'vue';
import type { Align, FieldStyle } from 'shared';

const props = defineProps<{ modelValue: FieldStyle; label?: string; placeholder?: string }>();
const emit = defineEmits<{ 'update:modelValue': [FieldStyle] }>();

const text = computed({
  get: () => props.modelValue.text,
  set: (v: string) => emit('update:modelValue', { ...props.modelValue, text: v }),
});
const align = computed({
  get: () => props.modelValue.align,
  set: (v: Align) => emit('update:modelValue', { ...props.modelValue, align: v }),
});
const fontSize = computed({
  get: () => props.modelValue.fontSize,
  set: (v: number) => emit('update:modelValue', { ...props.modelValue, fontSize: Number.isFinite(v) ? v : 12 }),
});

const aligns: Align[] = ['left', 'center', 'right'];
const alignLabel: Record<Align, string> = { left: '左', center: '中', right: '右' };
</script>

<template>
  <div class="field">
    <label class="field-label" v-if="label">{{ label }}</label>
    <div class="field-controls">
      <div class="seg">
        <button
          v-for="a in aligns"
          :key="a"
          type="button"
          :class="{ active: align === a }"
          :title="a === 'left' ? '左对齐' : a === 'center' ? '居中' : '右对齐'"
          @click="align = a"
        >{{ alignLabel[a] }}</button>
      </div>
      <label class="size">字号
        <input type="number" min="6" max="200" v-model.number="fontSize" /> pt
      </label>
    </div>
    <textarea v-model="text" rows="2" :placeholder="placeholder"></textarea>
  </div>
</template>

<style scoped>
.field { margin-bottom: 10px; }
.field-label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; }
.field-controls { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
.seg { display: inline-flex; border: 1px solid rgba(127,127,127,0.4); border-radius: 6px; overflow: hidden; }
.seg button { border: none; border-right: 1px solid rgba(127,127,127,0.4); background: transparent; padding: 4px 10px; cursor: pointer; font-size: 13px; color: inherit; }
.seg button:last-child { border-right: none; }
.seg button:hover { background: rgba(127,127,127,0.12); }
.seg button.active { background: #005ac1; color: #fff; }
.seg button:disabled { opacity: 0.4; cursor: not-allowed; }
.size { font-size: 12px; color: #666; display: inline-flex; align-items: center; gap: 4px; }
.size input { width: 52px; padding: 3px 4px; border: 1px solid rgba(127,127,127,0.4); border-radius: 4px; font-size: 13px; color: inherit; background: transparent; }
textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; border: 1px solid rgba(127,127,127,0.4); border-radius: 6px; font: 14px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; color: inherit; background: transparent; }
textarea:focus { outline: 2px solid #005ac1; border-color: #005ac1; }
</style>
