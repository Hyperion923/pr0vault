#!/usr/bin/env node
// Bump version in package.json + manifest.json, commit, tag, push.
// Usage: node scripts/release.mjs <patch|minor|major|0.2.0>

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/release.mjs <patch|minor|major|x.y.z>");
  process.exit(1);
}

function run(cmd) {
  return execSync(cmd, { stdio: ["inherit", "pipe", "inherit"] }).toString().trim();
}

const status = run("git status --porcelain");
if (status) {
  console.error("Working tree dirty. Commit or stash first.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const current = pkg.version;

function bump(v, type) {
  const [maj, min, pat] = v.split(".").map(Number);
  if (type === "major") return `${maj + 1}.0.0`;
  if (type === "minor") return `${maj}.${min + 1}.0`;
  if (type === "patch") return `${maj}.${min}.${pat + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  throw new Error(`Invalid version: ${type}`);
}

const next = bump(current, arg);
console.log(`Bumping ${current} → ${next}`);

pkg.version = next;
manifest.version = next;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

run(`git add package.json manifest.json`);
run(`git commit -m "chore(release): v${next}"`);
run(`git tag -a "v${next}" -m "v${next}"`);

console.log(`\n✓ Committed and tagged v${next}`);
console.log(`\nTo trigger the release workflow:`);
console.log(`  git push origin main --follow-tags`);
