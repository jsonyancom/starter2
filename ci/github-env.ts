/**
 * `npm run github:env`: give the daily job on GitHub its JSONyan client, so you do not add six
 * values by hand. It reads .jsonyan.env (or the file you name: `npm run github:env -- other.env`)
 * and saves, in the GitHub repository this folder pushes to:
 *
 * - JSONYAN_CLIENT_SECRET as a repository secret, which GitHub encrypts and never shows again;
 * - the other five JSONYAN_* values as repository variables, which are not secret.
 *
 * It sends those six names and nothing else, and never reads .local.env, so your OpenAI key
 * cannot reach GitHub. It needs the GitHub CLI, signed in: https://cli.github.com
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseEnv } from 'node:util';
import { CREDENTIAL_VARIABLES, credentialsFromEnv, type JsonyanCredentials } from '../jsonyan/credentials.ts';

const SECRET: keyof JsonyanCredentials = 'clientSecret';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const file = args.find((arg) => !arg.startsWith('--')) ?? '.jsonyan.env';

/** Run the GitHub CLI and return what it printed. `input` goes to its standard input. */
function gh(ghArgs: string[], input?: string): string {
  const result = spawnSync('gh', ghArgs, { input, encoding: 'utf8' });
  if (result.error !== undefined) {
    throw new Error('The GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run gh auth login.');
  }
  if (result.status !== 0) {
    throw new Error(`gh ${ghArgs.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

let text: string;
try {
  text = readFileSync(file, 'utf8');
} catch {
  throw new Error(`${file} does not exist. Create it with the JSONyan client's Copy .env (see .jsonyan.env.example).`);
}
// Only what the file holds is sent: nothing from the shell, and nothing from .local.env.
const credentials = credentialsFromEnv(parseEnv(text));

const repository = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
console.log(`This sends the JSONyan client in ${file} (project ${credentials.projectId}) to github.com/${repository}:`);
for (const [key, name] of Object.entries(CREDENTIAL_VARIABLES)) {
  console.log(`  ${name}  ${key === SECRET ? 'repository secret' : 'repository variable'}`);
}
if (!yes) {
  if (!process.stdin.isTTY) throw new Error('Run it in a terminal to confirm, or pass --yes.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Continue? [y/N] ');
  prompt.close();
  if (answer !== 'y' && answer !== 'Y') {
    console.log('Nothing was sent.');
    process.exit(1);
  }
}

for (const [key, name] of Object.entries(CREDENTIAL_VARIABLES) as Array<[keyof JsonyanCredentials, string]>) {
  if (key === SECRET) {
    // Passed on standard input, so the secret is never in a command line that other programs can see.
    gh(['secret', 'set', name, '--repo', repository], credentials[key]);
  } else {
    gh(['variable', 'set', name, '--repo', repository, '--body', credentials[key]]);
  }
  console.log(`set ${name}`);
}
console.log('Done. Run the Daily workflow from the Actions tab to try it.');
