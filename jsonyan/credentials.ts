/**
 * The project client's credentials. Each script reads them from JSONYAN_* variables: on your
 * machine the npm scripts load them from .env, which Git ignores, and GitHub Actions passes
 * repository secrets under the same names. A script run in a terminal asks you to paste the
 * client's **Copy .env** for any that are missing, and keeps what you paste in memory only.
 */

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

export type JsonyanCredentials = {
  /** Origin of the API, for example https://api.jsonyan.com. */
  url: string;
  /** Path of the API on that origin. */
  apiPath: string;
  /** Full URL of the token endpoint. */
  tokenUrl: string;
  /** The project's ID, sent as projectId in every call. */
  projectId: string;
  clientId: string;
  clientSecret: string;
};

/** The variable that holds each credential, as the client's Copy .env names them. */
const VARIABLES = {
  url: 'JSONYAN_URL',
  apiPath: 'JSONYAN_API_PATH',
  tokenUrl: 'JSONYAN_TOKEN_URL',
  projectId: 'JSONYAN_PROJECT_ID',
  clientId: 'JSONYAN_CLIENT_ID',
  clientSecret: 'JSONYAN_CLIENT_SECRET',
} as const satisfies Record<keyof JsonyanCredentials, string>;

const NAMES: readonly string[] = Object.values(VARIABLES);

/** Where calls go: the part of the credentials that is not secret. */
export type JsonyanEndpoint = Pick<JsonyanCredentials, 'url' | 'apiPath' | 'projectId'>;

function missingNames(env: NodeJS.ProcessEnv): string[] {
  return NAMES.filter((name) => env[name] === undefined || env[name] === '');
}

function readVariables<K extends keyof JsonyanCredentials>(env: NodeJS.ProcessEnv, keys: readonly K[]) {
  const missing = keys.map((key) => VARIABLES[key]).filter((name) => env[name] === undefined || env[name] === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. Put the client's Copy .env in .env (see .env.example).`,
    );
  }
  return Object.fromEntries(keys.map((key) => [key, env[VARIABLES[key]] as string])) as Pick<JsonyanCredentials, K>;
}

/** Read the credentials from the environment. Throws when one is missing. */
export function credentialsFromEnv(env: NodeJS.ProcessEnv): JsonyanCredentials {
  return readVariables(env, Object.keys(VARIABLES) as (keyof JsonyanCredentials)[]);
}

/** Read only the endpoint from the environment, for a process that gets its tokens another way. */
export function endpointFromEnv(env: NodeJS.ProcessEnv): JsonyanEndpoint {
  return readVariables(env, ['url', 'apiPath', 'projectId']);
}

/** A copy of the environment without the client's ID and secret, for a process that must not have them. */
export function withoutClientCredentials(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env };
  delete copy[VARIABLES.clientId];
  delete copy[VARIABLES.clientSecret];
  return copy;
}

/** One `NAME=value` line of a Copy .env, also accepting `export` and quotes. */
function parseLine(line: string): [string, string] | undefined {
  const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (match === null) {
    return undefined;
  }
  const [, name, raw] = match as unknown as [string, string, string];
  const quoted = /^(["'])(.*)\1$/.exec(raw);
  return [name, quoted === null ? raw : (quoted[2] as string)];
}

/** Read pasted lines without echoing them, until every credential is in or an empty line. */
async function readPastedCredentials(missing: string[]): Promise<Map<string, string>> {
  process.stdout.write(
    `Paste the client's Copy .env (from the project's Clients page on jsonyan.com).\n` +
      `Nothing is shown while you paste, and nothing is saved. Missing: ${missing.join(', ')}\n> `,
  );
  const silent = new Writable({ write: (_chunk, _encoding, done) => done() });
  const lines = createInterface({ input: process.stdin, output: silent, terminal: true });
  lines.on('SIGINT', () => {
    lines.close();
    process.stdout.write('\n');
    process.exit(130);
  });
  const values = new Map<string, string>();
  for await (const line of lines) {
    const entry = parseLine(line);
    if (entry !== undefined && NAMES.includes(entry[0])) {
      values.set(entry[0], entry[1]);
    }
    const done = missing.every((name) => values.has(name));
    if (done || (line.trim() === '' && values.size > 0)) {
      break;
    }
  }
  lines.close();
  process.stdin.pause();
  process.stdout.write('\n');
  return values;
}

/**
 * Make sure process.env has every credential. When some are missing and this runs in a
 * terminal, ask for the client's Copy .env and put the values in process.env, in memory only.
 */
export async function askForMissingCredentials(): Promise<JsonyanCredentials> {
  const missing = missingNames(process.env);
  if (missing.length > 0 && process.stdin.isTTY) {
    for (const [name, value] of await readPastedCredentials(missing)) {
      process.env[name] = value;
    }
  }
  const credentials = credentialsFromEnv(process.env);
  console.log(`JSONyan project ${credentials.projectId} at ${credentials.url}`);
  return credentials;
}
