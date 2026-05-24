import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative } from "node:path";

import { build } from "esbuild";
import { minify } from "html-minifier-terser";
import { transform } from "lightningcss";

const appDir = "app";
const distDir = "dist";
const distAppDir = join(distDir, "app");
const distServerDir = distDir;
const packageVersion = JSON.parse(readFileSync("./package.json", "utf8")).version;
const skippedStaticAssetExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const skippedMetadataFiles = new Set([".DS_Store", "Thumbs.db"]);

function readCliTarget() {
  const targetIndex = process.argv.indexOf("--target");
  if (targetIndex >= 0 && process.argv[targetIndex + 1]) {
    return process.argv[targetIndex + 1];
  }

  return "all";
}

async function buildApiTarget({ clean = false } = {}) {
  if (clean) {
    rmSync(distServerDir, { force: true, recursive: true });
  }
  mkdirSync(distServerDir, { recursive: true });
  rmSync(join(distServerDir, "cli.mjs"), { force: true });

  await build({
    banner: {
      js: "#!/usr/bin/env node\n// MikroScope - See LICENSE file for copyright and license details.",
    },
    bundle: true,
    entryPoints: {
      cli: "api/src/cli.ts",
    },
    entryNames: "[name]",
    external: [],
    format: "esm",
    mainFields: ["module", "main"],
    minify: true,
    outExtension: { ".js": ".mjs" },
    outdir: distServerDir,
    platform: "node",
    target: "node25",
    treeShaking: true,
  });
}

async function buildAppTarget({ clean = false } = {}) {
  if (clean) {
    rmSync(distAppDir, { force: true, recursive: true });
  }
  mkdirSync(distAppDir, { recursive: true });

  await build({
    banner: {
      js: `/* MikroScope Console v${packageVersion} | ${new Date().toISOString()} */`,
    },
    bundle: true,
    entryPoints: [join(appDir, "app.js")],
    format: "iife",
    minify: true,
    outfile: join(distAppDir, "app.js"),
    platform: "browser",
    sourcemap: false,
    target: ["es2024"],
    treeShaking: true,
  });

  buildCss();
  await buildHtml();
  copyStaticAssets(appDir, distAppDir);
  pruneBuildMetadata(distAppDir);
}

function buildCss() {
  for (const file of readdirSync(appDir)
    .filter((name) => name.endsWith(".css"))
    .sort()) {
    const { code } = transform({
      code: readFileSync(join(appDir, file)),
      filename: file,
      minify: true,
      sourceMap: false,
    });
    writeFileSync(join(distAppDir, file), code);
  }
}

async function buildHtml() {
  for (const file of readdirSync(appDir)
    .filter((name) => name.endsWith(".html"))
    .sort()) {
    const html = readFileSync(join(appDir, file), "utf8");
    const optimizedHtml = await minify(html, {
      collapseWhitespace: true,
      minifyCSS: false,
      minifyJS: false,
      removeComments: true,
      removeEmptyAttributes: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
    });
    writeFileSync(join(distAppDir, file), optimizedHtml);
  }
}

function copyStaticAssets(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir)) {
    if (shouldSkipStaticAsset(entry)) {
      continue;
    }

    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stats = statSync(sourcePath);

    if (stats.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyStaticAssets(sourcePath, targetPath);
      continue;
    }

    mkdirSync(targetDir, { recursive: true });
    cpSync(sourcePath, targetPath);
  }
}

function shouldSkipStaticAsset(entry) {
  if (skippedMetadataFiles.has(entry) || entry.startsWith(".")) {
    return true;
  }

  if (entry.endsWith(".d.ts")) {
    return true;
  }

  return skippedStaticAssetExtensions.has(extname(entry));
}

function pruneBuildMetadata(targetDir) {
  for (const entry of readdirSync(targetDir)) {
    const entryPath = join(targetDir, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      pruneBuildMetadata(entryPath);
      continue;
    }

    if (skippedMetadataFiles.has(entry)) {
      rmSync(entryPath, { force: true });
    }
  }
}

async function main() {
  const startedAt = Date.now();
  const target = readCliTarget();

  if (target === "all") {
    rmSync(distDir, { force: true, recursive: true });
    mkdirSync(distDir, { recursive: true });
    await buildAppTarget({ clean: false });
    await buildApiTarget({ clean: false });
  } else if (target === "app") {
    await buildAppTarget({ clean: true });
  } else if (target === "api") {
    await buildApiTarget({ clean: false });
  } else {
    throw new Error(`Unknown build target '${target}'`);
  }

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Build completed in ${durationSeconds}s`);

  if (target === "all" || target === "app") {
    console.log(`  ${relative(process.cwd(), distAppDir)}`);
  }
  if (target === "all" || target === "api") {
    console.log(`  ${relative(process.cwd(), join(distServerDir, "cli.mjs"))}`);
  }
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
