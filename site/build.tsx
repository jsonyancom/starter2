/**
 * `npm run build:site`: render the site to plain HTML in dist/ from content/words.json, the
 * words that the daily job writes. `npm run site` runs it on every change and serves the result.
 *
 * The site reads only content/, never JSONyan, so building it needs no credentials.
 */

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { Index, type Word } from './pages/Index.tsx';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(projectRoot, 'dist');

function isWord(value: unknown): value is Word {
  const entry = value as Partial<Word> | null;
  return typeof entry === 'object' && entry !== null && typeof entry.word === 'string' && typeof entry.meaning === 'string';
}

const words: unknown = JSON.parse(await readFile(join(projectRoot, 'content', 'words.json'), 'utf8'));
if (!Array.isArray(words) || !words.every(isWord)) {
  throw new Error('content/words.json must be an array of { "word": string, "meaning": string }.');
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir);
// React escapes every text and attribute value, so content cannot add HTML to the page.
await writeFile(join(distDir, 'index.html'), `<!doctype html>\n${renderToStaticMarkup(<Index words={words} />)}\n`);
await copyFile(join(projectRoot, 'site', 'style.css'), join(distDir, 'style.css'));
console.log(`Built dist/ with ${words.length} word${words.length === 1 ? '' : 's'}.`);
