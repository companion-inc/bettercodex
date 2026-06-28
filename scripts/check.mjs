import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", ".wrangler", "dist", "coverage"]);
const files = [];

walk(root);

for (const file of files.sort()) {
  execFileSync(process.execPath, ["--check", file], {stdio: "inherit"});
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (ignored.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
}
