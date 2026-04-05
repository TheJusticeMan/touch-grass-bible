import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
      "@platform": path.resolve(__dirname, "src/platform/current.ts"),
      "@touchgrass/framework": path.resolve(__dirname, "packages/framework/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
