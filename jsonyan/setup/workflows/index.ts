import type { TableIds, WorkflowDefinition } from '../types.ts';

/**
 * The project's workflows, by key. Each is a function of the tables' IDs, so a workflow can read
 * and write the tables in tables/index.ts. `npm run setup` creates or updates each one and writes
 * its ID to jsonyan/resources.ts under the same key. Workflows can be changed but never deleted,
 * and a change applies to waiting instances from their next resume.
 *
 * START.md describes the two workflows this app needs, under the keys `dailyWord` and
 * `submitWord`. v1.createWorkflow in docs/jsonyan.openrpc.json has the fields and examples.
 */
export const workflows = {} satisfies Record<string, (tableIds: TableIds) => WorkflowDefinition>;
