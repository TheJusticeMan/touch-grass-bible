import type { PanelContainerSerialized } from "@touchgrass/framework";

export function createDefaultWorkspaceLayout(): PanelContainerSerialized {
  return {
    type: "panel",
    direction: "horizontal",
    activeIndex: 1,
    size: 1,
    children: [
      {
        size: 1,
        type: "view",
        isPersistent: true,
        activeIndex: 0,
        children: [{ viewType: "journal-panel", title: "Journal", state: "" }],
      },
      {
        size: 3,
        type: "view",
        isPersistent: true,
        activeIndex: 0,
        children: [{ viewType: "verse-screen", title: "Scripture", state: "" }],
      },
      {
        size: 2,
        type: "view",
        isPersistent: true,
        activeIndex: 0,
        children: [{ viewType: "knowledge-base-index", title: "Knowledge Base", state: "" }],
      },
    ],
  };
}
