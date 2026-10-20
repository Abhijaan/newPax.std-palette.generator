/**
 * Syntax-check every JavaScript module in the repository without installing dependencies.
 * The checker intentionally uses Node's parser only; browser integration still needs a browser.
 */
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirectories = new Set(['.git', 'node_modules']);
const javascriptFiles = [];

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectJavaScriptFiles(fullPath);
    } else if (entry.isFile() && /\.(?:m?js|cjs)$/.test(entry.name)) {
      javascriptFiles.push(fullPath);
    }
  }
}

await collectJavaScriptFiles(projectRoot);
let hasErrors = false;

for (const filePath of javascriptFiles.sort()) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });

  if (result.status !== 0) {
    hasErrors = true;
    console.error(`\nSyntax error: ${path.relative(projectRoot, filePath)}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (hasErrors) process.exitCode = 1;
else console.log(`Syntax check passed for ${javascriptFiles.length} JavaScript files.`);
