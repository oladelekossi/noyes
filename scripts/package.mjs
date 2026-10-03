import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const directory = resolve('extension');
const output = resolve('dist/wheel-0.1.0.zip');
mkdirSync(resolve('dist'), { recursive: true });
rmSync(output, { force: true });
execFileSync('zip', ['-q', output, ...readdirSync(directory)], { cwd: directory });
console.log(output);
