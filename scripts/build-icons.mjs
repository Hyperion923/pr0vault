// pr0Vault — Icon Build Pipeline
// Converts pr0vault-logo.webp (329×329) to 16×16, 48×48, 128×128 PNGs

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcFile = resolve(__dirname, "../src/icons/pr0vault-logo.webp");
const outDir = resolve(__dirname, "../dist-icons");
mkdirSync(outDir, { recursive: true });

async function buildIcon(size) {
  await sharp(srcFile)
    .resize(size, size, { kernel: "lanczos3" })
    .png()
    .toFile(resolve(outDir, `icon${size}.png`));
}

async function main() {
  const meta = await sharp(srcFile).metadata();
  console.log(`Source: ${meta.width}×${meta.height} WebP`);

  for (const size of [16, 48, 128]) {
    await buildIcon(size);
    console.log(`  → icon${size}.png`);
  }

  // Also copy 48 to src/icons so popup can reference it during dev
  const srcIconsDir = resolve(__dirname, "../src/icons");
  mkdirSync(srcIconsDir, { recursive: true });
  await sharp(srcFile)
    .resize(48, 48, { kernel: "lanczos3" })
    .png()
    .toFile(resolve(srcIconsDir, "icon48.png"));
  console.log("  → src/icons/icon48.png (dev reference)");
}

main().catch((err) => {
  console.error("Icon build failed:", err);
  process.exit(1);
});
