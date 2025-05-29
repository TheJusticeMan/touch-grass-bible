import fs from "fs/promises";
import path from "path";
import { glob } from "glob";

// Source and destination directories
const srcDir = path.resolve("./src");
const destDir = "/home/justice/Documents/dev/TestVault/data";

// Helper to get file extension as code block language
function getLang(ext) {
  // Map some common extensions to markdown code block languages
  const map = {
    js: "javascript",
    mjs: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    py: "python",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
    sh: "bash",
    yml: "yaml",
    yaml: "yaml",
    c: "c",
    cpp: "cpp",
    h: "c",
    java: "java",
    go: "go",
    rs: "rust",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    dart: "dart",
    xml: "xml",
  };
  return map[ext] || ext;
}

// Find all files in ./src/*
(async () => {
  try {
    // Find all files recursively in srcDir and subfolders
    const files = await glob(`${srcDir}/**/*`, { nodir: true });

    for (const file of files) {
      // Skip json files bigger than 1MB
      if (path.extname(file) === ".json" && (await fs.stat(file)).size > 1 * 1024 * 1024) {
        console.log(`Skipping large JSON file: ${file}`);
        continue;
      }
      const relPath = path.relative(srcDir, file);
      const destFileDir = path.join(destDir, path.dirname(relPath));
      await fs.mkdir(destFileDir, { recursive: true });

      const content = await fs.readFile(file, "utf8");
      const ext = path.extname(file).slice(1);
      const lang = getLang(ext);

      const mdContent = `# ${relPath}

\`\`\`${lang}
${content}
\`\`\`
    `;

      const mdFileName = `${path.basename(file)}.md`;
      const destPath = path.join(destFileDir, mdFileName);

      await fs.writeFile(destPath, mdContent, "utf8");
      console.log(`Saved: ${destPath}`);
    }
  } catch (err) {
    console.error("Error processing files:", err);
  }
})();
