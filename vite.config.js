import { defineConfig } from "vite";
import pugPlugin from "vite-plugin-pug";
import { fileURLToPath } from "node:url";

// Допоміжна функція: шлях до html-файлу в корені проєкту
const page = (name) => fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  plugins: [pugPlugin(undefined, { pagesUrl: "./src/pages/" })],
  build: {
    rollupOptions: {
      // Усі сторінки сайту (кожна — окремий html-файл у корені)
      input: {
        index: page("index"),
        trends: page("trends"),
        results: page("results"),
      },
    },
  },
});
