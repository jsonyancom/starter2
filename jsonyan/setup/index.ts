/**
 * `npm run setup`: create or update the tables and workflows defined in jsonyan/setup/ in the
 * client's project, then write their IDs to jsonyan/resources.ts.
 *
 * Resources are matched by name, so running it again updates them instead of making copies, and
 * leaves unchanged ones alone. Tables and workflows cannot be deleted. Use the local client: CI's
 * client should not be allowed to create or change them.
 */

import { writeFile } from 'node:fs/promises';
import { createJsonyanClient, type JsonyanClient } from '../client.ts';
import { askForMissingCredentials } from '../credentials.ts';
import { tables } from './tables/index.ts';
import type { TableDefinition, TableIds, WorkflowDefinition } from './types.ts';
import { workflows } from './workflows/index.ts';

type Named = { id: string; name: string };

/** Existing resources' IDs by name. Names must be unique, or matching by name is ambiguous. */
async function idsByName(client: JsonyanClient, method: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const { id, name } of await client.listAll<Named>(method)) {
    if (ids.has(name)) {
      throw new Error(`Two resources are named "${name}". Rename one on jsonyan.com, then run setup again.`);
    }
    ids.set(name, id);
  }
  return ids;
}

/** JSON with sorted keys and no undefined fields, to compare what is saved with what is defined. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

/** The fields of `saved` that `defined` sets, to compare only what the definition controls. */
function pickDefined(saved: Record<string, unknown>, defined: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(defined)
      .filter((key) => defined[key] !== undefined)
      .map((key) => [key, saved[key]]),
  );
}

async function applyTable(client: JsonyanClient, existing: Map<string, string>, table: TableDefinition): Promise<string> {
  const id = existing.get(table.name);
  if (id === undefined) {
    const created = await client.call<{ id: string }>('v1.createTable', table);
    console.log(`created   table    ${table.name}`);
    return created.id;
  }
  const saved = await client.call<Record<string, unknown>>('v1.getTable', { tableId: id });
  const { name: _name, ...defined } = table;
  if (canonical(pickDefined(saved, defined)) === canonical(defined)) {
    console.log(`unchanged table    ${table.name}`);
    return id;
  }
  await client.call('v1.updateTable', {
    tableId: id,
    ...(table.description === undefined ? {} : { description: table.description }),
    // null removes a part whose schema is no longer defined.
    schema: { content: table.schema.content ?? null, metadata: table.schema.metadata ?? null },
  });
  console.log(`updated   table    ${table.name}`);
  return id;
}

async function applyWorkflow(
  client: JsonyanClient,
  existing: Map<string, string>,
  workflow: WorkflowDefinition,
): Promise<string> {
  const id = existing.get(workflow.name);
  if (id === undefined) {
    const created = await client.call<{ id: string }>('v1.createWorkflow', workflow);
    console.log(`created   workflow ${workflow.name}`);
    return created.id;
  }
  // v1.getWorkflow returns actions, initial, states and contextPeekCel under `definition`, and the
  // other fields at the top.
  const saved = await client.call<{ definition: Record<string, unknown> } & Record<string, unknown>>('v1.getWorkflow', {
    workflowId: id,
  });
  const { name: _name, ...defined } = workflow;
  if (canonical(pickDefined({ ...saved, ...saved.definition }, defined)) === canonical(defined)) {
    console.log(`unchanged workflow ${workflow.name}`);
    return id;
  }
  await client.call('v1.updateWorkflow', { workflowId: id, ...defined });
  console.log(`updated   workflow ${workflow.name}`);
  return id;
}

async function main(): Promise<void> {
  const tableEntries = Object.entries(tables) as Array<[string, TableDefinition]>;
  const workflowEntries = Object.entries(workflows) as Array<[string, (ids: TableIds) => WorkflowDefinition]>;
  if (tableEntries.length === 0 && workflowEntries.length === 0) {
    console.log('Nothing to set up yet. START.md says which table and workflows to define in jsonyan/setup/.');
    return;
  }

  const credentials = await askForMissingCredentials();
  const client = createJsonyanClient(credentials);

  const existingTables = await idsByName(client, 'v1.listTables');
  const tableIds: Record<string, string> = {};
  for (const [key, table] of tableEntries) {
    tableIds[key] = await applyTable(client, existingTables, table);
  }

  const existingWorkflows = await idsByName(client, 'v1.listWorkflows');
  const workflowIds: Record<string, string> = {};
  for (const [key, build] of workflowEntries) {
    // Every key of `tables` now has an ID.
    workflowIds[key] = await applyWorkflow(client, existingWorkflows, build(tableIds as TableIds));
  }

  const resources = { projectId: credentials.projectId, tables: tableIds, workflows: workflowIds };
  await writeFile(
    new URL('../resources.ts', import.meta.url),
    '// Written by `npm run setup`: the IDs of the tables and workflows defined in jsonyan/setup/, and\n' +
      '// the project they belong to. The IDs are not secret, so commit this file. Do not edit it by hand.\n' +
      `export const resources = ${JSON.stringify(resources, null, 2)} as const;\n`,
  );
  console.log('Wrote jsonyan/resources.ts');
}

await main();
