import { defineConfig } from 'vite';

// 打包时用相对路径：网页放在 GitHub Pages 的子路径（/id-card/）下面也能找到字体和代码
export default defineConfig({
  base: './',
});
