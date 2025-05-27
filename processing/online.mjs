import { get } from "https";
import { writeFileSync, createWriteStream, unlinkSync, write } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Open } from "unzipper";

const _dirname = dirname(fileURLToPath(import.meta.url));
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

function downloadZip(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, (res) => {
      if (res.statusCode !== 200)
        return reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => reject(err));
  });
}

async function unzipFirstFileAsString(zipPath) {
  const dir = await Open.file(zipPath);
  return (await dir.files[0].buffer()).toString("utf8");
}

(async () => {
  try {
    for (const f of files) await downloadZip(f.url, f.path);
    const [topicsRaw, crossrefsRaw] = await Promise.all(
      files.map((f) => unzipFirstFileAsString(f.path))
    );
    console.log("File 1:", topicsRaw.slice(0, 500));
    console.log("File 2:", crossrefsRaw.slice(0, 500));
    const topics = {};
    topicsRaw
      .split("\n")
      .slice(1)
      .forEach((line) => {
        const [Topic, OSIS, QualityScore] = line.split("\t");
        if (!Topic || !OSIS || !QualityScore) return; // Skip invalid lines
        if (!topics[Topic]) topics[Topic] = [];
        topics[Topic].push([OSIS, Number(QualityScore)]);
      });
    writeFileSync(join(_dirname, "topics.json"), JSON.stringify(topics));
    writeFileSync(
      join(_dirname, "topicsSample.json"),
      JSON.stringify(
        Object.fromEntries(
          Object.keys(topics)
            .slice(0, 10)
            .map((k) => [k, topics[k]])
        )
      )
    );
    writeFileSync(join(_dirname, "topics.txt"), topicsRaw);
    const crossrefs = {};
    crossrefsRaw
      .split("\n")
      .slice(1)
      .forEach((line) => {
        const [FromVerse, ToVerse, Votes] = line.split("\t");
        if (!FromVerse || !ToVerse || !Votes) return; // Skip invalid lines
        if (!crossrefs[FromVerse]) crossrefs[FromVerse] = [];
        crossrefs[FromVerse].push([ToVerse, Number(Votes)]);
      });
    writeFileSync(join(_dirname, "crossrefs.json"), JSON.stringify(crossrefs));
    writeFileSync(
      join(_dirname, "crossrefsSample.json"),
      JSON.stringify(
        Object.fromEntries(
          Object.keys(crossrefs)
            .slice(0, 10)
            .map((k) => [k, crossrefs[k]])
        )
      )
    );
    writeFileSync(join(_dirname, "crossrefs.txt"), crossrefsRaw);

    files.forEach((f) => unlinkSync(f.path));
    // Use data/data2 as needed
  } catch (err) {
    console.error("Error:", err);
  }
})();
