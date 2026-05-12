import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
    ],
    environmentMatchGlobs: [
      ["client/src/**", "jsdom"],
      ["server/**", "node"],
    ],
    setupFiles: ["./client/src/test-setup.ts"],
    server: {
      deps: {
        inline: ["streamdown"],
      },
    },
  },
});
