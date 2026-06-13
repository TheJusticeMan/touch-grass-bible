import { Share2 } from "lucide";
import Plugin from "../core/Plugin";
import { MenuVan } from "@touchgrass/framework";

export default class SharePlugin extends Plugin {
  async onload() {
    this.addVerseAction({
      id: "share-verse",
      name: "Share Verse",
      description: "Copy a link to this verse to your clipboard.",
      icon: Share2,
      onTrigger: verseInfo => {
        const menu = new MenuVan();
        const verse = verseInfo.verse;
        [
          { name: "YouVersion", url: verse.YouVersionURL },
          { name: "Blue Letter Bible", url: verse.blbURL },
          { name: "Bible Gateway", url: verse.gatewayURL },
        ].forEach(link =>
          menu.addItem({
            title: `Open in ${link.name}`,
            onClick: () => window.open(link.url, "_blank"),
          }),
        );
        menu.showAtMouseEvent(verseInfo.event);
      },
    });
  }
}
