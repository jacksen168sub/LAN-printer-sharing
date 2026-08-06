<script setup lang="ts">
// 内容值卡片:把 Content 拍平为字段列表,每字段独立显示 + 独立操作(复制/下载)。
// 不再"一坨显示 + 一键全复制"——电话、地址等可单独取用。
//
// 扩展点(预留未来新类型):
//   1. 新模板类型 → toFields() switch 加 case
//   2. 新字段操作 → FieldItem.kind 加值 + 模板加 v-else-if 分支
// 当前预留:text(复制) / image(下载) 两种 kind。
import { computed, ref } from 'vue';
import type { Content, ImageContent } from 'shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ content: Content }>();
const { t } = useI18n();

/** 字段项:统一抽象,渲染层据 kind 决定操作。 */
interface FieldItem {
  key: string;
  label: string;
  value: string;
  kind: 'text' | 'image'; // 预留:image 走下载
}

/**
 * 拍平 Content → FieldItem[]。新增模板类型在此 switch 加 case,
 * 渲染层与操作层无需改动(只要 FieldItem 能描述)。
 */
function toFields(c: Content): FieldItem[] {
  switch (c.type) {
    case 'text':
      return [{ key: 'text', label: t('peer.contentValue'), value: c.text.text, kind: 'text' }];
    case 'contact': {
      const f: FieldItem[] = [];
      if (c.location.text) f.push({ key: 'location', label: t('peer.fieldLocation'), value: c.location.text, kind: 'text' });
      if (c.phone.text)    f.push({ key: 'phone',    label: t('peer.fieldPhone'),    value: c.phone.text,    kind: 'text' });
      if (c.contact.text)  f.push({ key: 'contact',  label: t('peer.fieldContact'),  value: c.contact.text,  kind: 'text' });
      return f;
    }
    case 'image': {
      const f: FieldItem[] = [];
      if (c.dataUrl) f.push({ key: 'img', label: t('peer.fieldImage'), value: c.dataUrl, kind: 'image' });
      return f;
    }
    default:
      return [];
  }
}

const fields = computed(() => toFields(props.content));

// 图片传输中(与 ImageRenderer 一致判断):此态下底部卡片显示"加载中"而非"无内容"
const imageLoading = computed(() =>
  props.content.type === 'image' &&
  (props.content as ImageContent).transferId != null &&
  !(props.content as ImageContent).dataUrl,
);

// 每字段独立复制状态:key → 是否刚复制(1.5s 内显示"已复制")
const copiedKey = ref<string | null>(null);
function copyField(f: FieldItem) {
  if (!f.value) return;
  navigator.clipboard?.writeText(f.value)
    .then(() => {
      copiedKey.value = f.key;
      setTimeout(() => { if (copiedKey.value === f.key) copiedKey.value = null; }, 1500);
    })
    .catch(() => { /* 剪贴板不可用,忽略 */ });
}

// 预留:图片字段下载
function downloadField(f: FieldItem) {
  if (f.kind !== 'image' || !f.value) return;
  const a = document.createElement('a');
  a.href = f.value;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
</script>

<template>
  <section class="no-print value-card">
    <div class="value-head">
      <span class="label">{{ t('peer.contentValue') }}</span>
    </div>
    <div v-if="fields.length" class="fields">
      <div v-for="f in fields" :key="f.key" class="field">
        <div class="field-label">{{ f.label }}</div>
        <div v-if="f.kind === 'image' && f.value" class="field-image">
          <img :src="f.value" :alt="f.label" />
        </div>
        <div v-else class="field-value">{{ f.value }}</div>
        <button
          v-if="f.kind === 'text'"
          type="button"
          class="mini-btn"
          :disabled="!f.value"
          @click="copyField(f)"
        >{{ copiedKey === f.key ? t('common.copied') : t('common.copy') }}</button>
        <button
          v-else-if="f.kind === 'image'"
          type="button"
          class="mini-btn"
          :disabled="!f.value"
          @click="downloadField(f)"
        >{{ t('common.download') }}</button>
      </div>
    </div>
    <div v-else-if="imageLoading" class="empty">{{ t('peer.imageLoading') }}</div>
    <div v-else class="empty">{{ t('peer.emptyText') }}</div>
  </section>
</template>

<style scoped>
.value-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.value-head { margin-bottom: 8px; }
.label { font-size: 12px; color: #666; }
.fields { display: flex; flex-direction: column; gap: 8px; }
.field { display: flex; gap: 10px; align-items: baseline; }
.field-label { font-size: 12px; color: #888; flex: none; min-width: 48px; font-weight: 500; }
.field-value { flex: 1; min-width: 0; font-size: 13px; color: #333; word-break: break-all; white-space: pre-wrap; }
.field-image { flex: 1; min-width: 0; }
.field-image img { max-width: 100%; max-height: 120px; object-fit: contain; border-radius: 4px; }
.mini-btn {
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: transparent;
  color: #005ac1;
  cursor: pointer;
  flex: none;
  transition: background 0.12s;
}
.mini-btn:hover:not(:disabled) { background: rgba(0, 90, 193, 0.08); }
.mini-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.empty { color: #999; padding: 4px 0; }
</style>
