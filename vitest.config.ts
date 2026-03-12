import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@platform": path.resolve(__dirname, "src/platform/current.ts"),
      // Redirect external/App imports to a lightweight stub that avoids DOM-heavy
      // and circular dependencies (external/App.ts imports ../main which imports CSS, plugins, etc.)
      "./external/App": path.resolve(__dirname, "src/__mocks__/external-App.stub.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
