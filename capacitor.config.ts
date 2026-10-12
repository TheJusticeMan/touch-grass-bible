import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.touch_grass_bible",
  appName: "Touch Grass Bible",
  webDir: "dist",
  plugins: {
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
