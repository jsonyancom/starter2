/**
 * Keeps the client's current token in .jsonyan-token.json, so commands share it. Without this,
 * every `npm run setup`, `npm run daily` or `npm run admin` would ask JSONyan for a new token,
 * and a token requested while the last one has more than 5 minutes left costs credits.
 *
 * A token works for one hour and gives the client's access, so the file is as secret as .env.
 * Git ignores it, and only you can read it. Delete it to make the next command ask for a new token.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';

export type Token = { value: string; expiresAt: number };

/** Whose token it is. A token saved for another client, or another JSONyan, is not used. */
type Owner = { clientId: string; tokenUrl: string };

const FILE = '.jsonyan-token.json';
const file = new URL(`../${FILE}`, import.meta.url);

/** The saved token of this client, or undefined when there is none. It may have expired. */
export async function readSavedToken(owner: Owner): Promise<Token | undefined> {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as Partial<Token & Owner>;
    if (saved.clientId !== owner.clientId || saved.tokenUrl !== owner.tokenUrl) return undefined;
    if (typeof saved.value !== 'string' || typeof saved.expiresAt !== 'number') return undefined;
    return { value: saved.value, expiresAt: saved.expiresAt };
  } catch {
    return undefined;
  }
}

/** Save the token for the next command. A failure only means that command asks for its own. */
export async function saveToken({ owner, token }: { owner: Owner; token: Token }): Promise<void> {
  // Written beside the file, then renamed, so another command never reads half a file.
  const temporary = new URL(`../${FILE}.${process.pid}`, import.meta.url);
  try {
    await writeFile(temporary, `${JSON.stringify({ ...owner, ...token })}\n`, { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    console.warn(`Could not save the JSONyan token to ${FILE}:`, error);
  }
}
