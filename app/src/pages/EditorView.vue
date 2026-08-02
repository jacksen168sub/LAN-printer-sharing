<script setup lang="ts">
// 编辑器:类型选择 → 模板 Editor(粘贴智能识别 + 字段编辑)→ 布局 → 保存 / 预览打印。
// 右侧实时预览(所见即所打),移动端折叠到下方。
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ContactContent, Content, ContentType, PeerContent, PrintLayout, TextContent } from 'shared';
import { getOwnContent, setOwnContent } from '../stores/identity';
import { broadcastContent } from '../stores/network';
import { computeGoldenFontSize } from '../lib/auto-font';
import { TEMPLATES, defaultContent, defaultLayout, getTemplate } from '../templates/registry';
import PrintSheet from '../components/PrintSheet.vue';

const router = useRouter();

const own = getOwnContent();
const content = ref<Content>(own?.content ?? defaultContent('contact'));
const layout = ref<PrintLayout>(own?.layout ?? defaultLayout(content.value.type));

const contentType = computed<ContentType>(() => content.value.type);
const editor = computed(() => getTemplate(contentType.value).Editor);

function switchType(t: ContentType) {
  if (t === contentType.value) return;
  content.value = defaultContent(t);
  layout.value = defaultLayout(t);
}

function setOrientation(o: PrintLayout['orientation']) {
  // 折叠模式锁定纵向
  if (layout.value.fold === 'half-long-edge') return;
  layout.value = { ...layout.value, orientation: o };
  applyAutoFontSize(); // 纸宽变化,重算黄金分割字号
}

function setFold(fold: PrintLayout['fold']) {
  if (fold === 'half-long-edge') {
    // A4 长边对折 → A5 展示区,必须纵向
    layout.value = { ...layout.value, fold: 'half-long-edge', orientation: 'portrait' };
  } else {
    layout.value = { ...layout.value, fold: 'none' };
  }
  applyAutoFontSize(); // 对折切换影响展示区,重算字号
}

/**
 * 黄金分割自适应字号:取所有字段中最长的一行,算使其宽度 = 纸宽 / φ 的字号,
 * 全部字段统一采用该字号。无文本时不动(保留当前字号)。
 */
function applyAutoFontSize() {
  const fs = computeGoldenFontSize(content.value, layout.value);
  if (fs == null) return;
  const clamped = Math.max(6, Math.min(200, Math.round(fs)));
  if (content.value.type === 'contact') {
    const c = content.value as ContactContent;
    content.value = {
      ...c,
      location: { ...c.location, fontSize: clamped },
      phone: { ...c.phone, fontSize: clamped },
      contact: { ...c.contact, fontSize: clamped },
    };
  } else {
    const c = content.value as TextContent;
    content.value = { ...c, text: { ...c.text, fontSize: clamped } };
  }
}

// 挂载时把默认字号设为黄金分割值(有文本才生效;空内容保留 18pt 默认)
onMounted(applyAutoFontSize);

const saved = ref(false);
function save() {
  const pc: PeerContent = { content: content.value, layout: layout.value, updatedAt: Date.now() };
  setOwnContent(pc);
  broadcastContent(pc); // 让在线对端 PeerView 看到最新内容
  saved.value = true;
  setTimeout(() => (saved.value = false), 1500);
}

/** 打印:先持久化当前编辑内容,再跳转。否则 PrintView 会读到 LocalStorage 里的旧内容。 */
function saveAndPrint() {
  const pc: PeerContent = { content: content.value, layout: layout.value, updatedAt: Date.now() };
  setOwnContent(pc);
  broadcastContent(pc);
  router.push('/print');
}
</script>

<template>
  <div class="editor">
    <div class="toolbar no-print">
      <button type="button" class="btn" @click="router.back()">返回</button>
      <span class="toolbar-title">编辑</span>
    </div>
    <div class="edit-grid">
    <section class="card edit-form no-print">
      <div class="label">内容类型</div>
      <div class="seg type-seg">
        <button
          v-for="t in (Object.keys(TEMPLATES) as ContentType[])"
          :key="t"
          type="button"
          :class="{ active: contentType === t }"
          @click="switchType(t)"
        >{{ TEMPLATES[t].label }}</button>
      </div>

      <component :is="editor" :model-value="content" @update:model-value="content = $event" />

      <div class="label layout-label">布局</div>
      <div class="layout-row">
        <div class="control">
          <span class="control-label">方向</span>
          <div class="seg">
            <button type="button" :class="{ active: layout.orientation === 'landscape' }" :disabled="layout.fold === 'half-long-edge'" @click="setOrientation('landscape')">横向</button>
            <button type="button" :class="{ active: layout.orientation === 'portrait' }" :disabled="layout.fold === 'half-long-edge'" @click="setOrientation('portrait')">纵向</button>
          </div>
        </div>
        <div class="control">
          <span class="control-label">折叠</span>
          <div class="seg">
            <button type="button" :class="{ active: layout.fold === 'none' }" @click="setFold('none')">不折叠</button>
            <button type="button" :class="{ active: layout.fold === 'half-long-edge' }" @click="setFold('half-long-edge')">对折→A5</button>
          </div>
        </div>
        <div class="control">
          <span class="control-label">字号</span>
          <button type="button" class="btn" @click="applyAutoFontSize" title="按最长行 × 纸宽黄金分割自适应">自适应</button>
        </div>
      </div>
      <div class="hint" v-if="layout.fold === 'half-long-edge'">对折模式:A4 纵向,内容只印上半 A5 区域,下半留白折叠到背面。</div>

      <div class="actions">
        <button type="button" class="btn btn-primary" @click="save">{{ saved ? '已保存 ✓' : '保存' }}</button>
        <button type="button" class="btn" @click="saveAndPrint">打印</button>
      </div>
    </section>

    <section class="card edit-preview no-print">
      <div class="label">预览(所见即所打)</div>
      <PrintSheet :content="content" :layout="layout" :auto-fit="true" />
    </section>
    </div>
  </div>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: 12px; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.toolbar-title { font-size: 14px; color: #666; }
/* minmax(0,1fr):允许列宽收缩到内容以下,否则 PrintSheet 的固定 px 宽度会把预览列撑爆、挤压表单列。 */
.edit-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
@media (max-width: 860px) { .edit-grid { grid-template-columns: 1fr; } .edit-preview { position: static !important; } }
.card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 0; }
/* 桌面端:表单较高,让预览吸顶跟随滚动,始终可见。 */
.edit-preview { position: sticky; top: 12px; }
.label { font-size: 12px; color: #666; margin-bottom: 6px; }
.layout-label { margin-top: 12px; }
.seg { display: inline-flex; border: 1px solid rgba(127,127,127,0.4); border-radius: 6px; overflow: hidden; }
.seg button { border: none; border-right: 1px solid rgba(127,127,127,0.4); background: transparent; padding: 6px 12px; cursor: pointer; font-size: 13px; color: inherit; }
.seg button:last-child { border-right: none; }
.seg button:hover { background: rgba(127,127,127,0.12); }
.seg button.active { background: #005ac1; color: #fff; }
.seg button:disabled { opacity: 0.4; cursor: not-allowed; }
.type-seg { margin-bottom: 12px; }
.layout-row { display: flex; gap: 16px; flex-wrap: wrap; }
.control { display: flex; flex-direction: column; gap: 4px; }
.control-label { font-size: 11px; color: #888; }
.hint { font-size: 12px; color: #888; margin-top: 8px; }
.actions { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
</style>
