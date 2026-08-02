<script setup lang="ts">
// 轻量 tooltip:原生 title 太丑,@material/web 未提供 md-tooltip 组件(token 有、组件无)。
// 自实现 M3 plain tooltip 风格:inverse surface 深底 + inverse on-surface 白字、4px 圆角、微 elevation。
// hover/focus 显隐,默认朝下展开(避开页面顶部裁切);bubble 不拦截指针、不挤布局。
defineProps<{ text: string }>();
</script>

<template>
  <span class="tip" tabindex="0">
    <slot />
    <span class="tip-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<style scoped>
.tip { position: relative; display: inline-flex; }
.tip-bubble {
  position: absolute;
  top: calc(100% + 6px);
  left: 100%;
  transform: translateX(-50%) translateY(-4px);
  background: #313033;        /* M3 inverse surface */
  color: #f3f3f3;             /* M3 inverse on-surface */
  font-size: 12px;
  line-height: 16px;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: normal;
  word-break: break-all;
  max-width: min(360px, 90vw);
  min-width: 240px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.12s ease, transform 0.12s ease;
  z-index: 20;
}
.tip:hover .tip-bubble,
.tip:focus-within .tip-bubble {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}
</style>
