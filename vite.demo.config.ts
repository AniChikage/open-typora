import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig(({ command }) => ({
  root: project + "web",
  base: "./",
  plugins: [react(), {
    name: "demo-development-csp",
    transformIndexHtml(html) {
      return command === "serve" ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5187") : html;
    },
  }],
  resolve: { alias: { "/src": project + "src", "/design": project + "design" } },
  server: { fs: { allow: [project] } },
  build: { outDir: project + "dist-demo", emptyOutDir: true, target: "es2022" },
}));
