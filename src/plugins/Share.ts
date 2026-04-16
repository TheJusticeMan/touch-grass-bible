import { Button } from "@touchgrass/framework";
import { Share2 } from "lucide";
import Plugin from "../core/Plugin";

export default class SharePlugin extends Plugin {
  async onload() {
    this.addVerseAction({
      id: "share-verse",
      name: "Share Verse",
      description: "Copy a link to this verse to your clipboard.",
      icon: Share2,
      onTrigger: verseInfo => {
        const verse = verseInfo.verse;
        [
          { name: "YouVersion", url: verse.YouVersionURL },
          { name: "Blue Letter Bible", url: verse.blbURL },
          { name: "Bible Gateway", url: verse.gatewayURL },
        ].forEach(link =>
          new Button(verseInfo.element)
            .setButtonText(`Open in ${link.name}`)
            .on("click", () => window.open(link.url, "_blank")),
        );
      },
    });
  }
}
