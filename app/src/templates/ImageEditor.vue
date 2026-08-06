<script setup lang="ts">
// 图片编辑器:本地上传单图。FileReader 读 dataURL,Image 读自然尺寸。
// 原画质不做前端压缩;20MB 硬上限防浏览器内存压力。
import { computed, ref } from 'vue';
import type { Content, ImageContent } from 'shared';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ modelValue: Content }>();
const emit = defineEmits<{ 'update:modelValue': [Content] }>();
const { t } = useI18n();

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

const c = computed<ImageContent>(() =>
  props.modelValue.type === 'image'
    ? (props.modelValue as ImageContent)
    : { type: 'image', dataUrl: '', mime: '', width: 0, height: 0 },
);

const error = ref('');
const busy = ref(false);

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // 允许重复选同一文件
  if (!file) return;
  error.value = '';

  if (!ACCEPTED.includes(file.type)) {
    error.value = t('editor.imageBadType');
    return;
  }
  if (file.size > MAX_BYTES) {
    error.value = t('editor.imageTooLarge', { max: 20 });
    return;
  }

  busy.value = true;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    const img = new Image();
    img.onload = () => {
      emit('update:modelValue', {
        type: 'image',
        dataUrl,
        mime: file.type,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
      });
      busy.value = false;
    };
    img.onerror = () => {
      error.value = t('editor.imageBadType');
      busy.value = false;
    };
    img.src = dataUrl;
  };
  reader.onerror = () => {
    error.value = t('editor.imageReadFail');
    busy.value = false;
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  emit('update:modelValue', {
    type: 'image',
    dataUrl: '',
    mime: '',
    width: 0,
    height: 0,
  });
  error.value = '';
}
</script>

<template>
  <div class="image-editor">
    <label class="upload-btn">
      {{ t('editor.uploadImage') }}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        @change="onFile"
      />
    </label>
    <div v-if="c.dataUrl" class="preview">
      <img :src="c.dataUrl" :alt="c.name" class="thumb" />
      <div class="meta">
        <div class="meta-name">{{ c.name }}</div>
        <div class="meta-dims">{{ c.width }}×{{ c.height }} · {{ c.mime.split('/')[1]?.toUpperCase() }}</div>
      </div>
      <button type="button" class="mini-btn" @click="clearImage">{{ t('editor.clearImage') }}</button>
    </div>
    <div v-else-if="busy" class="hint">{{ t('editor.imageLoading') }}</div>
    <div v-else class="hint">{{ t('editor.imageHint') }}</div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<style scoped>
.image-editor { display: flex; flex-direction: column; gap: 10px; }
.upload-btn {
  display: inline-block;
  font: inherit;
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: transparent;
  color: #005ac1;
  cursor: pointer;
  align-self: flex-start;
  transition: background 0.12s;
}
.upload-btn:hover { background: rgba(0, 90, 193, 0.08); }
.preview { display: flex; gap: 12px; align-items: center; }
.thumb { max-width: 120px; max-height: 120px; object-fit: contain; border-radius: 6px; border: 1px solid rgba(0, 0, 0, 0.1); }
.meta { flex: 1; min-width: 0; }
.meta-name { font-size: 13px; font-weight: 600; word-break: break-all; }
.meta-dims { font-size: 12px; color: #888; margin-top: 2px; }
.hint { font-size: 12px; color: #999; }
.error { font-size: 12px; color: #d32f2f; }
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
}
.mini-btn:hover { background: rgba(0, 90, 193, 0.08); }
</style>
