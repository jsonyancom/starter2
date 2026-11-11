/**
 * The admin's server, which `npm run admin` (admin/dev.ts) runs and restarts after every change.
 * A request goes to the handler admin/routes.ts lists for its path and method. Other GET requests
 * get the file of that name in admin/public/.
 *
 * It listens on 127.0.0.1 only. It answers only requests addressed to that host, and accepts form
 * posts only from its own pages, so that other websites open in your browser cannot use it.
 */

import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorPage, notFoundPage } from './page.tsx';
import { routes } from './routes.ts';

const HOST = '127.0.0.1';
const PORT = 5173;
// A web page could reach this server through its own domain name pointed at 127.0.0.1, so answer
// only requests that name this server.
const ALLOWED_HOSTS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);

const publicDir = fileURLToPath(new URL('public', import.meta.url));
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** The incoming request as a web `Request`, which is what handlers get. */
async function toRequest(incoming: IncomingMessage, host: string): Promise<Request> {
  const method = incoming.method ?? 'GET';
  const headers = new Headers();
  for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
    headers.append(incoming.rawHeaders[i] as string, incoming.rawHeaders[i + 1] as string);
  }
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(new URL(incoming.url ?? '/', `http://${host}`), { method, headers, body });
}

/** The file in admin/public/ that a path names, or undefined when there is none. */
async function publicFile(pathname: string): Promise<string | undefined> {
  try {
    const file = join(publicDir, decodeURIComponent(pathname));
    if (!file.startsWith(publicDir + sep)) return undefined;
    return (await stat(file)).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

async function respond(request: Request): Promise<Response> {
  const { method } = request;
  const { pathname } = new URL(request.url);
  const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
  if (route !== undefined) {
    const handler = method === 'GET' || method === 'HEAD' ? route.GET : method === 'POST' ? route.POST : undefined;
    if (handler === undefined) {
      return new Response('Method not allowed\n', { status: 405, headers: { allow: Object.keys(route).join(', ') } });
    }
    return handler(request);
  }
  if (method === 'GET' || method === 'HEAD') {
    const file = await publicFile(pathname);
    if (file !== undefined) {
      const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      return new Response(new Uint8Array(await readFile(file)), { headers: { 'content-type': type } });
    }
  }
  return notFoundPage();
}

const server = createServer(async (incoming, outgoing) => {
  const host = incoming.headers.host ?? '';
  const method = incoming.method ?? 'GET';
  if (!ALLOWED_HOSTS.has(host)) {
    outgoing.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end(`Open the admin at http://${HOST}:${PORT}/\n`);
    return;
  }
  if (method !== 'GET' && method !== 'HEAD' && incoming.headers.origin !== `http://${host}`) {
    outgoing.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end("The admin accepts form posts only from its own pages.\n");
    return;
  }
  let response: Response;
  try {
    response = await respond(await toRequest(incoming, host));
  } catch (error) {
    console.error(error);
    response = errorPage(error);
  }
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Stop the other server, or change PORT in admin/server.ts.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

// Stop when `npm run admin` stops.
process.on('disconnect', () => process.exit(0));

server.listen(PORT, HOST, () => {
  console.log(`Admin at http://${HOST}:${PORT}/`);
});
