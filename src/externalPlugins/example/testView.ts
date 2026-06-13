import { View } from "@touch-grass-bible";

export class TestView extends View {
  readonly viewTypeId = "test-view";

  constructor() {
    super("Test View", {});
  }

  create(): HTMLElement {
    return document.createElement("div");
  }
}
