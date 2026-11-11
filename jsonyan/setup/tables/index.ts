import type { TableDefinition } from '../types.ts';

/**
 * The project's tables, by key. `npm run setup` creates or updates each one and writes its ID to
 * jsonyan/resources.ts under the same key. Tables can be changed but never deleted.
 *
 * START.md describes the table this app needs, under the key `words`:
 *
 *   words: {
 *     name: 'words',
 *     schema: { content: { type: 'object', ... } },
 *   },
 */
export const tables = {} satisfies Record<string, TableDefinition>;
