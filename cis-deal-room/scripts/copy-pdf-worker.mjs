// scripts/copy-pdf-worker.mjs
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pdfjsEntry = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = resolve(process.cwd(), 'public/pdf.worker.min.mjs');
await mkdir(dirname(dest), { recursive: true });
await copyFile(pdfjsEntry, dest);
console.log(`[pdf-worker] copied to ${dest}`);
