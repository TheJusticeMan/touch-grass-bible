import { Share } from "lucide";
import { Button } from "src/external/UIComponents";
import Plugin from "../core/Plugin";

export default class SharePlugin extends Plugin {
  async onload() {
    this.addVerseAction({
      id: "share-verse",
      name: "Share Verse",
      description: "Copy a link to this verse to your clipboard.",
      icon: Share,
      onTrigger: verseInfo => {
        const verse = verseInfo.verse;
        const links = [
          { name: "YouVersion", url: verse.YouVersionURL },
          { name: "Blue Letter Bible", url: verse.blbURL },
          { name: "Bible Gateway", url: verse.gatewayURL },
        ];
        links.forEach(link => {
          new Button(verseInfo.element).setButtonText(`Open in ${link.name}`).on("click", e => {
            e.stopPropagation();
            window.open(link.url, "_blank");
          });
        });
      },
    });
  }
}
