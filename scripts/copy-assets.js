import { cpSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = new URL('../src/hooks/dangerous-patterns.json', import.meta.url).pathname;
const dst = new URL('../dist/hooks/dangerous-patterns.json', import.meta.url).pathname;
mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst);
console.log('[build] Copied dangerous-patterns.json');
