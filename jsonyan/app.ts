/**
 * The table and workflows this app uses, by the keys START.md gives them in jsonyan/setup/.
 * `npm run setup` writes their IDs to jsonyan/resources.ts.
 */

import { resources } from './resources.ts';

export type AppResources = {
  /** The `words` table: one row per word, with its meaning. */
  wordsTableId: string;
  /** The workflow the daily job starts: AI picks a word and explains it, through a batch. */
  dailyWordWorkflowId: string;
  /** The workflow the admin's form starts: it asks the admin to explain the submitted word. */
  submitWordWorkflowId: string;
};

export const SETUP_NEEDED =
  'The words table and the dailyWord and submitWord workflows are not set up yet. Follow START.md, then run npm run setup.';

/** The IDs, or undefined while setup has not created all three. */
export function findAppResources(): AppResources | undefined {
  // Widened, so this compiles both before setup has written any IDs and after.
  const written: { tables: Record<string, string>; workflows: Record<string, string> } = resources;
  const wordsTableId = written.tables.words;
  const dailyWordWorkflowId = written.workflows.dailyWord;
  const submitWordWorkflowId = written.workflows.submitWord;
  if (wordsTableId === undefined || dailyWordWorkflowId === undefined || submitWordWorkflowId === undefined) {
    return undefined;
  }
  return { wordsTableId, dailyWordWorkflowId, submitWordWorkflowId };
}
