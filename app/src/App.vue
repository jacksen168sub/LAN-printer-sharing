<script setup lang="ts"></script>

<template>
  <div class="app">
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style>
:root {
  font-family: 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; background: #f4f4f5; }
.content { padding: 16px; max-width: 960px; margin: 0 auto; }

/* 操作按钮:@material/web 按钮在自动化/部分场景下点击不稳,按 plan §7 回退为 M3 风格自写按钮。 */
.btn {
  font: inherit;
  font-size: 14px;
  padding: 7px 16px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: transparent;
  color: #005ac1;
  transition: background 0.12s;
}
.btn:hover { background: rgba(0, 90, 193, 0.08); }
.btn:active { background: rgba(0, 90, 193, 0.16); }
.btn-primary { background: #005ac1; color: #fff; border-color: #005ac1; }
.btn-primary:hover { background: #004a9e; }
.btn-primary:active { background: #003d82; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
