import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // @material/web 自定义元素以 md- 开头,Vue 不要当未知组件警告
          isCustomElement: (tag) => tag.startsWith('md-'),
        },
      },
    }),
  ],
  server: { port: 5173 },
});
