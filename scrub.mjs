#!/usr/bin/env node
// scrub-sourcemaps.mjs — replaces .map files with minimal VALID empty maps
// and strips sourceMappingURL references (incl. inline data: URIs).
//
// Usage:
// node scrub-sourcemaps.mjs # scrubs ./dist
// node scrub-sourcemaps.mjs node_modules # scrubs ./node_modules recursively
// node scrub-sourcemaps.mjs dist node_modules

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const MAP_EXTS = ['.js.map', '.mjs.map', '.cjs.map', '.css.map'];
const CODE_EXTS = ['.js', '.mjs', '.cjs', '.css'];

// Valid empty sourcemap. NOT bare {} — invalid maps cause DevTools warnings
// and hard errors in strict consumers (Sentry, source-map pkg, bundlers).
const EMPTY_MAP = (name) =>
JSON.stringify({
version: 3,
file: name,
sources: [],
sourcesContent: [],
names: [],
mappings: '',
});

// Matches `//# sourceMappingURL=x` and `/*# sourceMappingURL=x */` on their own line
const COMMENT_RE =
/^[ \t]*(?:\/\/[#@][ \t]*sourceMappingURL=.+?|\/\*[#@][ \t]*sourceMappingURL=.+?\*\/)[ \t]*$/gm;

function* walk(dir) {
for (const entry of readdirSync(dir, { withFileTypes: true })) {
const p = join(dir, entry.name);
if (entry.isDirectory()) yield* walk(p);
else if (entry.isFile()) yield p;
}
}

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['dist'];
let emptied = 0;
let stripped = 0;

for (const root of roots) {
if (!existsSync(root)) {
console.log(`skip (missing): ${root}`);
continue;
}
for (const file of walk(root)) {
if (MAP_EXTS.some((e) => file.endsWith(e))) {
const out = EMPTY_MAP(basename(file).replace(/\.map$/, ''));
if (readFileSync(file, 'utf8') !== out) {
writeFileSync(file, out);
emptied++;
}
} else if (CODE_EXTS.some((e) => file.endsWith(e))) {
const code = readFileSync(file, 'utf8');
const cleaned = code.replace(COMMENT_RE, '');
if (cleaned !== code) {
writeFileSync(file, cleaned);
stripped++;
}
}
}
}

console.log(`done: ${emptied} map file(s) emptied, ${stripped} sourceMappingURL comment(s) stripped`);