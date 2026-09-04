#!/usr/bin/env node
// Run this AFTER `vite build`. Safe config for Vite + React output.
// npm install --save-dev javascript-obfuscator
// "scripts": { "build": "vite build && node postbuild-obfuscate.mjs" }

import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const DIST = 'dist';
const ASSETS = join(DIST, 'assets');
const MARKER = '__OBFUSCATED__'; // prevents double-obfuscation on re-runs

// Chunks to leave untouched (e.g. a vendor chunk, web workers).
// Workers especially: obfuscated worker code + self-defending patterns
// misbehave under module-worker wrappers. Adjust to taste.
const SKIP_PATTERNS = [];

function filesWithExt(dir, ext) {
if (!existsSync(dir)) return [];
return readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => join(dir, f));
}

const options = {
compact: true,
target: 'browser',
identifierNamesGenerator: 'hexadecimal',
renameGlobals: false, // keep false — renaming globals can break React

// String hiding: safe and effective
stringArray: true,
stringArrayEncoding: ['base64'],
stringArrayThreshold: 0.75,

numbersToExpressions: true,
unicodeEscapeSequence: false, // keeps output smaller

// Keep asset/dynamic-import specifiers recognizable
reservedStrings: ['\\.js$', '\\.css$', '\\.svg$', '\\.woff2?$', '^/', '^\\./'],

// ---- These stay OFF. They break minified React bundles: ----
controlFlowFlattening: false, // optional: try true + threshold 0.25 AFTER verifying base build works
deadCodeInjection: false, // huge size cost, breaks edge cases
transformObjectKeys: false, // #1 breaker of bundled code
selfDefending: false, // false-positive loops if anything reflows the file
disableConsoleOutput: false, // hides your own errors while debugging
splitStrings: false,
};

// 1. Obfuscate JS chunks (skipping already-obfuscated + explicitly skipped files)
for (const file of filesWithExt(ASSETS, '.js')) {
const code = readFileSync(file, 'utf8');
if (code.includes(MARKER) || SKIP_PATTERNS.some((p) => p.test(file))) continue;

const result = JavaScriptObfuscator.obfuscate(code, options);
writeFileSync(file, `/*${MARKER}*/` + result.getObfuscatedCode());
console.log(`obfuscated ${file}`);
}

// 2. Remove leftover .map files
for (const file of [...filesWithExt(ASSETS, '.js.map'), ...filesWithExt(ASSETS, '.css.map')]) {
unlinkSync(file);
console.log(`removed ${file}`);
}

// 3. Strip sourceMappingURL comments
for (const file of filesWithExt(ASSETS, '.js')) {
const code = readFileSync(file, 'utf8');
const cleaned = code.replace(/\/\/#\s*sourceMappingURL=.*$/gm, '');
if (cleaned !== code) writeFileSync(file, cleaned);
}

// 4. Clean index.html + stub the React DevTools hook.
const indexPath = join(DIST, 'index.html');
if (existsSync(indexPath)) {
let html = readFileSync(indexPath, 'utf8');
html = html.replace(/<meta name="generator"[^>]*>\s*/gi, '');
html = html.replace(/<!--[\s\S]*?-->/g, '');

if (!html.includes('__REACT_DEVTOOLS_GLOBAL_HOOK__')) {
// defineProperty makes the stub non-overridable; inject() returning a
// number keeps React's injectInternals() happy if it's ever reached.
const devtoolsStub =
'<script>Object.defineProperty(window,"__REACT_DEVTOOLS_GLOBAL_HOOK__",' +
'{value:{isDisabled:true,supportsFiber:true,inject:function(){return 0},' +
'onCommitFiberRoot:function(){return null},onPostCommitFiberRoot:function(){},' +
'onCommitFiberUnmount:function(){}},writable:false,configurable:false});</script>';
html = /<head[^>]*>/i.test(html)
? html.replace(/<head[^>]*>/i, (m) => m + devtoolsStub)
: devtoolsStub + html;
}

writeFileSync(indexPath, html);
console.log('cleaned index.html');
}

console.log('post-build obfuscation complete.');
