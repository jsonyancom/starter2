/**
 * `npm run daily`: what GitHub Actions runs on a schedule (.github/workflows/daily.yml), because
 * JSONyan cannot schedule anything itself. One process does every step, so they share one token.
 *
 * 1. Retrieve: resume every dailyWord instance that waits for its AI batch. An instance whose
 *    batch has ended saves its word.
 * 2. Start: start today's dailyWord instance, which submits a batch and waits. Skipped with
 *    `--retrieve-only`, and while an earlier instance still waits.
 * 3. Publish: write every word in the table to content/words.json. The workflow then commits the
 *    file and deploys the site.
 *
 * On your machine it reads .env; in GitHub Actions the same names come from repository secrets.
 */

import { writeFile } from 'node:fs/promises';
import { findAppResources, SETUP_NEEDED } from '../jsonyan/app.ts';
import { createJsonyanClient, JsonyanError, type WorkflowInstanceState } from '../jsonyan/client.ts';
import { credentialsFromEnv } from '../jsonyan/credentials.ts';
import { readWords } from '../jsonyan/words.ts';

const retrieveOnly = process.argv.includes('--retrieve-only');

const app = findAppResources();
if (app === undefined) throw new Error(SETUP_NEEDED);
const client = createJsonyanClient(credentialsFromEnv(process.env));

let failed = false;

/** Log where an instance stopped. Returns whether it still waits. */
function report(state: WorkflowInstanceState): boolean {
  const { id, status, error } = state.instance;
  if (status === 'failed') {
    failed = true;
    console.error(`instance ${id} failed${error === undefined ? '' : ` at ${error.path}: ${error.message}`}`);
  } else {
    console.log(`instance ${id} ${status === 'waiting' ? 'still waits for its batch' : 'completed'}`);
  }
  return status === 'waiting';
}

// 1. Retrieve.
let waiting = 0;
try {
  const instances = await client.listAll<{ id: string }>('v1.listWorkflowInstanceContextPeeks', {
    workflowId: app.dailyWordWorkflowId,
    status: 'waiting',
  });
  for (const { id } of instances) {
    try {
      if (report(await client.resumeWorkflow({ instanceId: id, answer: undefined }))) waiting++;
    } catch (error) {
      waiting++;
      // 409: another request has the instance. A later run picks it up.
      if (error instanceof JsonyanError && error.code === 409) {
        console.log(`instance ${id} is busy; skipped`);
      } else {
        failed = true;
        console.error(`instance ${id} could not be resumed:`, error);
      }
    }
  }
} catch (error) {
  failed = true;
  console.error('Retrieve failed:', error);
}

// 2. Start.
if (retrieveOnly) {
  console.log('Not starting a word: --retrieve-only.');
} else if (waiting > 0) {
  console.log('Not starting a word: an earlier one still waits for its batch.');
} else {
  try {
    report(await client.startWorkflow({ workflowId: app.dailyWordWorkflowId, input: undefined }));
  } catch (error) {
    failed = true;
    console.error('Start failed:', error);
  }
}

// 3. Publish. The file is written only after every read succeeded, so a failed read never
// publishes a partial list. Sorted, so each commit shows only the words added or removed.
try {
  const words = (await readWords({ client, tableId: app.wordsTableId }))
    .map(({ word, meaning }) => ({ word, meaning }))
    .sort((a, b) => {
      const [left, right] = [a.word.toLowerCase(), b.word.toLowerCase()];
      return left < right ? -1 : left > right ? 1 : a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
    });
  await writeFile(new URL('../content/words.json', import.meta.url), `${JSON.stringify(words, null, 2)}\n`);
  console.log(`Wrote content/words.json with ${words.length} word${words.length === 1 ? '' : 's'}.`);
} catch (error) {
  failed = true;
  console.error('Publish failed:', error);
}

// Show the run as failed when any step failed. The workflow still commits what was published.
if (failed) process.exit(1);
