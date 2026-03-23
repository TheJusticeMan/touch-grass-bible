import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import process from "process";

const prod = process.argv.includes("production");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await esbuild.build({
  entryPoints: [resolve(__dirname, "main.ts")],
  outfile: resolve(__dirname, "main.js"),
  bundle: true,
  external: ["src/*", "@touch-grass-bible", "@touch-grass-bible/host"],
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: !prod,
  minify: prod,
  logLevel: "info",
});
