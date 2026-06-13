import { Plugin } from "@touch-grass-bible";
import { TestView } from "./testView";

export const manifest = {
  id: "simple-plugin-example",
  name: "Simple Plugin Example",
  description: `Example external plugin using host API`,
  version: "1.0.0",
};

export default class SimplePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView("test-view", () => new TestView());
  }
}
