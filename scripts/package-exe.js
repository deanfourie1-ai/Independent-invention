/**
 * package-exe.js
 * Wraps the bundled server (server.cjs) into a single Windows .exe via pkg,
 * naming the output with the current package version, e.g.
 *   release/jobtoolAdmin-v0.2.0.exe
 *
 * Run automatically as the last step of `npm run package`.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

const output = `release/jobtoolAdmin-v${pkg.version}.exe`;
const cmd = `pkg server.cjs --target node18-win-x64 --config package.json --output ${output}`;

console.log(`Packaging ${output} ...`);
execSync(cmd, { cwd: root, stdio: 'inherit' });
console.log(`\nBuilt ${output}`);
