/**
 * The admin's JSONyan client. The server never has the client secret: `npm run admin`
 * (admin/dev.ts) keeps it, and hands this process a token whenever a call needs one.
 */

import { createJsonyanClientFromTokens } from '../jsonyan/client.ts';
import { endpointFromEnv } from '../jsonyan/credentials.ts';

/** What the server sends admin/dev.ts to ask for a token, and what comes back. */
export type TokenRequest = { id: number };
export type TokenReply = { id: number; token: string } | { id: number; error: string };

if (process.send === undefined) {
  throw new Error('Start the admin with npm run admin, which gives its server the tokens.');
}

const waiting = new Map<number, { resolve: (token: string) => void; reject: (error: Error) => void }>();
let nextId = 0;

process.on('message', (message) => {
  const reply = message as TokenReply;
  const request = waiting.get(reply.id);
  if (request === undefined) return;
  waiting.delete(reply.id);
  if ('token' in reply) request.resolve(reply.token);
  else request.reject(new Error(reply.error));
});

function tokenFromDev(): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    process.send?.({ id } satisfies TokenRequest);
  });
}

export const jsonyan = createJsonyanClientFromTokens({ endpoint: endpointFromEnv(process.env), getToken: tokenFromDev });
