/**
 * `npm run site`: build the site into dist/, serve it at http://127.0.0.1:5174, and build it again
 * whenever something in site/ or content/ changes. Refresh the page to see a change.
 *
 * It serves the same files the deploy uploads, and it needs no credentials, so it can run next to
 * the admin (port 5173).
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 5174;
const REBUILD_DELAY_MS = 100;

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(projectRoot, 'dist');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

/**
 * Run site/build.tsx in a new process, so it imports the pages as they are now. Resolves to
 * whether the build succeeded.
 */
function build(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join('site', 'build.tsx')], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.on('error', (error) => {
      console.error(error);
      resolve(false);
    });
    child.on('exit', (code) => resolve(code === 0));
  });
}

let building = false;
let changedWhileBuilding = false;

async function rebuild(): Promise<void> {
  if (building) {
    changedWhileBuilding = true;
    return;
  }
  building = true;
  do {
    changedWhileBuilding = false;
    if (!(await build())) console.error('The build failed. Fix it and save again.');
  } while (changedWhileBuilding);
  building = false;
}

let rebuildTimer: NodeJS.Timeout | undefined;

/** Editors save in several steps, so wait until the changes stop before building. */
function scheduleRebuild(): void {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => void rebuild(), REBUILD_DELAY_MS);
}

/** The file in dist/ that a request path names, or undefined when it names nothing in dist/. */
async function fileFor(url: string): Promise<string | undefined> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, `http://${HOST}`).pathname);
  } catch {
    return undefined;
  }
  let file = join(distDir, pathname);
  if (file !== distDir && !file.startsWith(distDir + sep)) return undefined;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    return (await stat(file)).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const file = await fileFor(request.url ?? '/');
  if (file === undefined) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found\n');
    return;
  }
  const body = await readFile(file);
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Stop the other server, or change PORT in site/dev.ts.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

await rebuild();
for (const folder of ['site', 'content']) {
  watch(join(projectRoot, folder), { recursive: true }, scheduleRebuild);
}
server.listen(PORT, HOST, () => {
  console.log(`Serving dist/ at http://${HOST}:${PORT}/ and rebuilding when site/ or content/ changes.`);
});
