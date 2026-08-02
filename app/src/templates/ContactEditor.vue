<script setup lang="ts">
// [地点/电话/联系人] 编辑器:粘贴框 + 智能识别 → 三字段;每字段复用 FieldEditor。
import { computed, ref } from 'vue';
import type { ContactContent, Content, FieldStyle } from 'shared';
import { smartParse } from '../lib/smart-parse';
import FieldEditor from '../components/FieldEditor.vue';

const props = defineProps<{ modelValue: Content }>();
const emit = defineEmits<{ 'update:modelValue': [Content] }>();

const EMPTY: ContactContent = {
  type: 'contact',
  location: { text: '', align: 'center', fontSize: 18 },
  phone: { text: '', align: 'center', fontSize: 18 },
  contact: { text: '', align: 'center', fontSize: 18 },
};

const c = computed<ContactContent>(() =>
  props.modelValue.type === 'contact' ? (props.modelValue as ContactContent) : EMPTY,
);

function patch(field: 'location' | 'phone' | 'contact', v: FieldStyle) {
  emit('update:modelValue', { ...c.value, [field]: v } as ContactContent);
}

const pasteText = ref('');

/** 智能识别:把粘贴文本拆到三框,仅覆盖识别到的字段。 */
function applyParse() {
  if (!pasteText.value.trim()) return;
  const p = smartParse(pasteText.value);
  // 仅覆盖识别到的字段,未识别到的保留原值:避免重复追加,也不会清空已有内容。
  const next = { ...c.value };
  if (p.location) next.location = { ...c.value.location, text: p.location };
  if (p.phone) next.phone = { ...c.value.phone, text: p.phone };
  if (p.contact) next.contact = { ...c.value.contact, text: p.contact };
  emit('update:modelValue', next as ContactContent);
  pasteText.value = '';
}
</script>

<template>
  <div class="contact-editor">
    <div class="paste-box">
      <div class="field-label">粘贴文本 · 智能识别</div>
      <textarea v-model="pasteText" rows="3" placeholder="把随手复制的 地点/电话/联系人 混排文本粘进来,点识别自动拆分到下方三框"></textarea>
      <button type="button" class="btn btn-primary" @click="applyParse">识别并填入</button>
    </div>

    <FieldEditor :model-value="c.location" @update:model-value="patch('location', $event)" label="地点" placeholder="XX省XX市XX路XX号" />
    <FieldEditor :model-value="c.phone" @update:model-value="patch('phone', $event)" label="电话" placeholder="138XXXXXXXX / 0XXX-XXXXXXX" />
    <FieldEditor :model-value="c.contact" @update:model-value="patch('contact', $event)" label="联系人" placeholder="姓名" />
  </div>
</template>

<style scoped>
.contact-editor { display: flex; flex-direction: column; }
.paste-box { margin-bottom: 12px; padding: 10px; border: 1px dashed rgba(0,90,193,0.5); border-radius: 8px; background: rgba(0,90,193,0.04); }
.field-label { font-size: 12px; color: #666; margin-bottom: 4px; }
.paste-box textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 8px; border: 1px solid rgba(127,127,127,0.4); border-radius: 6px; font: 14px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; color: inherit; background: transparent; }
.paste-box textarea:focus { outline: 2px solid #005ac1; border-color: #005ac1; }
.paste-box .btn { margin-top: 6px; }
</style>
