import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { typoraPlugins } from "./scripts/plugin-build.mts";
export default defineConfig({
  publicDir: "build/public",
  plugins: [react(), typoraPlugins()],
  base: "./",
  build: { target: "es2022", rolldownOptions: { input: ["index.html", "preview.html"] } },
});
