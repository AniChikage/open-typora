import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { typoraPlugins } from "./scripts/plugin-build.mjs";
export default defineConfig({
  plugins: [react(), typoraPlugins()],
  base: "./",
  build: { target: "es2022" },
});
