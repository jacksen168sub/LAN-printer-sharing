<script setup lang="ts">
// mm 精确打印/预览容器:屏上预览用 transform: scale() 缩放同一份 DOM,打印时还原原尺寸。
// 布局:
//   - landscape:A4 横向 297×210mm,整张居中。
//   - portrait(无折叠):A4 纵向 210×297mm,整张居中。
//   - half-long-edge:A4 纵向,内容只渲染上半区(210×148.5mm ≈ A5 横向),下半留白折叠到背面。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Content, PrintLayout } from 'shared';
import { getTemplate } from '../templates/registry';

const props = withDefaults(
  defineProps<{ content: Content; layout: PrintLayout; autoFit?: boolean }>(),
  { autoFit: false },
);

const renderer = computed(() => getTemplate(props.content.type).Renderer);

const isLandscape = computed(() => props.layout.orientation === 'landscape');
const sheetWmm = computed(() => (isLandscape.value ? 297 : 210));
const sheetHmm = computed(() => (isLandscape.value ? 210 : 297));
const fold = computed(() => props.layout.fold === 'half-long-edge');

// 96dpi 下 1mm ≈ 3.7795px(打印时 px 与 mm 等价,故 px 尺寸即正确打印尺寸)
const MM_PX = 96 / 25.4;
const sheetWpx = computed(() => sheetWmm.value * MM_PX);
const sheetHpx = computed(() => sheetHmm.value * MM_PX);

const stage = ref<HTMLElement | null>(null);
const scale = ref(1);

function recompute() {
  if (!props.autoFit || !stage.value) {
    scale.value = 1;
    return;
  }
  const avail = stage.value.clientWidth;
  scale.value = avail > 0 ? Math.min(1, avail / sheetWpx.value) : 1;
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  recompute();
  if (props.autoFit && stage.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => recompute());
    ro.observe(stage.value);
  }
  window.addEventListener('resize', recompute);
});
onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener('resize', recompute);
});

const sheetStyle = computed(() => ({
  width: sheetWpx.value + 'px',
  height: sheetHpx.value + 'px',
  transform: `scale(${scale.value})`,
}));

const stageStyle = computed(() => ({
  height: sheetHpx.value * scale.value + 'px',
}));
</script>

<template>
  <div class="ps-stage" ref="stage" :style="autoFit ? stageStyle : undefined">
    <div class="ps-sheet" :class="{ 'is-fold': fold }" :style="sheetStyle">
      <div class="ps-area" :class="{ fold }">
        <component :is="renderer" :content="content" />
      </div>
      <div class="fold-line" v-if="fold"></div>
    </div>
  </div>
</template>

<style scoped>
.ps-stage { width: 100%; overflow: hidden; }
.ps-sheet {
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  position: relative;
  transform-origin: top left;
}
.ps-area {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10mm;
  box-sizing: border-box;
  overflow: hidden;
}
/* 折叠:只用上半 A5 区域,下半留白(折叠到背面) */
.ps-area.fold { height: 50%; }
.fold-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px dashed rgba(0, 90, 193, 0.4);
  pointer-events: none;
}
</style>
