// src/externalPlugins/example/main.ts
import Plugin from "src/core/Plugin";

// src/externalPlugins/example/testView.ts
import { View } from "src/external/Workspace";
var TestView = class extends View {
};

// src/externalPlugins/example/main.ts
var manifest = {
  id: "simple-plugin-example",
  name: "Simple Plugin Example",
  description: `Example external plugin using host API`,
  version: "1.0.0"
};
var SimplePlugin = class extends Plugin {
  async onload() {
    this.registerView("test-view", (leaf) => new TestView(leaf));
  }
};
export {
  SimplePlugin as default,
  manifest
};
//# sourceMappingURL=main.js.map
