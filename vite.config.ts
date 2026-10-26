// 画面 (React Router) とサーバー (src/server/worker.ts) を Cloudflare Workers 向けに組み立てる
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" }, inspectorPort: false }), reactRouter(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  ssr: {
    resolve: { conditions: ["workerd", "worker", "browser"] },
    noExternal: true,
  },
});
