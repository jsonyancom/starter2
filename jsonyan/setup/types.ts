/**
 * What jsonyan/setup/ defines. The fields are sent as they are to v1.createTable and
 * v1.createWorkflow, so docs/jsonyan.openrpc.json is the source of truth for them.
 */

import type { tables } from './tables/index.ts';

export type JsonSchema = boolean | { [keyword: string]: unknown };

export type TableDefinition = {
  /** Matched by name: setup creates the table when no table has it, and updates it otherwise. */
  name: string;
  description?: string;
  /** JSON Schemas for each row's content and metadata. A part without a schema is not used. */
  schema: { content?: JsonSchema; metadata?: JsonSchema };
};

export type WorkflowDefinition = {
  /** Matched by name, like a table's. */
  name: string;
  description?: string;
  actions: Record<string, unknown>;
  initial: string;
  states: Record<string, unknown>;
  contextPeekCel?: string;
  /** Any other field v1.createWorkflow takes. */
  [field: string]: unknown;
};

/** The ID of each table in tables/index.ts, by its key, for workflows that read or write it. */
export type TableIds = { [key in keyof typeof tables]: string };
