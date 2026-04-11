import { createWriteStream, readFileSync, unlinkSync, writeFileSync } from "fs";
import { get } from "https";
import { dirname, join } from "path";
import { Open } from "unzipper";
import { fileURLToPath } from "url";

const _dirname = dirname(fileURLToPath(import.meta.url));
const _dest = "./dist";
const files = [
  {
    url: "https://a.openbible.info/data/topic-scores.zip",
    path: join(_dirname, "topic-scores.zip"),
  },
  {
    url: "https://a.openbible.info/data/cross-references.zip",
    path: join(_dirname, "cross-references.zip"),
  },
];

function downloadZip(url, dist) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dist);
    get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", err => reject(err));
  });
}

async function unzipFirstFileAsString(zipPath) {
  const dir = await Open.file(zipPath);
  return (await dir.files[0].buffer()).toString("utf8");
}

(async () => {
  try {
    for (const f of files) await downloadZip(f.url, f.path);
    const [topicsRaw, crossrefsRaw] = await Promise.all(files.map(f => unzipFirstFileAsString(f.path)));
    const topics = {};
    topicsRaw
      .split("\n")
      .slice(1)
      .forEach(line => {
        const [Topic, OSIS, QualityScore] = line.split("\t");
        if (!Topic || !OSIS || !QualityScore) return; // Skip invalid lines
        if (!topics[Topic]) topics[Topic] = [];
        topics[Topic].push([OSIS, Number(QualityScore)]);
      });
    writeFileSync(join(_dest, "topics.json"), JSON.stringify(topics));
    const crossrefs = {};
    crossrefsRaw
      .split("\n")
      .slice(1)
      .forEach(line => {
        const [FromVerse, ToVerse, Votes] = line.split("\t");
        if (!FromVerse || !ToVerse || !Votes) return; // Skip invalid lines
        if (!crossrefs[FromVerse]) crossrefs[FromVerse] = [];
        crossrefs[FromVerse].push([ToVerse, Number(Votes)]);
      });
    writeFileSync(join(_dest, "crossrefs.json"), JSON.stringify(crossrefs));
    const naves = readFileSync(join("./data", "parsed-nave.json"), "utf8"); // Verify it exists and is valid JSON
    writeFileSync(join(_dest, "parsed-nave.json"), JSON.stringify(JSON.parse(naves)));
    //copyFileSync(join("./data", "parsed-nave.json"), join(_dest, "parsed-nave.json"));

    files.forEach(f => unlinkSync(f.path));
    // Use data/data2 as needed
    console.log("Data processing completed successfully.");
  } catch (err) {
    console.error("Error:", err);
  }
})();
