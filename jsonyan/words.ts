/** Reads the `words` table. The admin lists the words with it, and the daily job publishes them. */

import type { JsonyanClient } from './client.ts';

/** One row of the table: its ID, and the content START.md's schema requires. */
export type WordRow = { id: string; word: string; meaning: string };

type Row = { id: string; content?: unknown };

// v1.fetchMultipleRows takes up to 100 IDs.
const ROWS_PER_READ = 100;

function toWordRow(row: Row): WordRow | undefined {
  const content = row.content as { word?: unknown; meaning?: unknown } | null | undefined;
  if (typeof content !== 'object' || content === null) return undefined;
  if (typeof content.word !== 'string' || typeof content.meaning !== 'string') return undefined;
  return { id: row.id, word: content.word, meaning: content.meaning };
}

/** Every word in the table, most recently saved first. */
export async function readWords({ client, tableId }: { client: JsonyanClient; tableId: string }): Promise<WordRow[]> {
  // Lists return rows without their content, so list the IDs first, then read the content.
  const listed = await client.listAll<{ id: string }>('v1.listRowMetadataByUpdatedAt', { tableId, order: 'desc' });
  const words: WordRow[] = [];
  for (let start = 0; start < listed.length; start += ROWS_PER_READ) {
    const rowIds = listed.slice(start, start + ROWS_PER_READ).map(({ id }) => id);
    const { items } = await client.call<{ items: Array<Row | null> }>('v1.fetchMultipleRows', { tableId, rowIds });
    for (const [index, item] of items.entries()) {
      // This read can miss a row saved a moment ago. v1.findRow always sees the latest row.
      const row =
        item ?? (await client.call<{ row: Row | null }>('v1.findRow', { tableId, rowId: rowIds[index] as string })).row;
      const word = row === null ? undefined : toWordRow(row);
      if (word !== undefined) words.push(word);
    }
  }
  return words;
}
