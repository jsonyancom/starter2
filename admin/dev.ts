/**
 * `npm run admin`: read the client's credentials from .jsonyan.env, or ask for them when they are
 * missing, then run the admin's server (admin/server.ts) at http://127.0.0.1:5173. Whenever
 * something in admin/, jsonyan/ or site/ changes, it restarts the server; refresh the page to see
 * the change.
 *
 * This process keeps the client secret and the token, in memory only. The server gets neither: it
 * asks this process for a token whenever a call needs one. So every restart reuses the same token,
 * and asking for a new token while the last still has more than 5 minutes left costs credits.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTokenSource } from '../jsonyan/client.ts';
import { askForMissingCredentials, withoutClientCredentials } from '../jsonyan/credentials.ts';
import type { TokenReply, TokenRequest } from './jsonyan.ts';

const WATCHED_FOLDERS = ['admin', 'jsonyan', 'site'];
const RESTART_DELAY_MS = 100;

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const credentials = await askForMissingCredentials();
const getToken = createTokenSource(credentials);
const serverEnv = withoutClientCredentials(process.env);

let server: ChildProcess | undefined;
let restarting = false;

function reply(child: ChildProcess, message: TokenReply): void {
  if (child.connected) child.send(message);
}

function start(): void {
  const child = spawn(process.execPath, ['--import', 'tsx', join('admin', 'server.ts')], {
    cwd: projectRoot,
    env: serverEnv,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  child.on('message', (message) => {
    const { id } = message as TokenRequest;
    getToken().then(
      (token) => reply(child, { id, token }),
      (error: unknown) => reply(child, { id, error: error instanceof Error ? error.message : String(error) }),
    );
  });
  child.on('exit', (code) => {
    if (server === child) server = undefined;
    if (!restarting && code !== 0) console.error('The admin server stopped. Save a fix and it starts again.');
  });
  server = child;
}

/** Stop the server, then start it again. Changes saved meanwhile are in the new one. */
function restart(): void {
  if (restarting) return;
  const old = server;
  if (old === undefined) {
    start();
    return;
  }
  restarting = true;
  old.once('exit', () => {
    restarting = false;
    start();
  });
  old.kill();
}

// Editors save in several steps, so wait until the changes stop before restarting.
let restartTimer: NodeJS.Timeout | undefined;
for (const folder of WATCHED_FOLDERS) {
  watch(join(projectRoot, folder), { recursive: true }, () => {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(restart, RESTART_DELAY_MS);
  });
}
start();
