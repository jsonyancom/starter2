import { resources } from '../../jsonyan/resources.ts';
import { jsonyan } from '../jsonyan.ts';
import { page } from '../page.tsx';

type Listed = { id: string; name: string; updatedAt: number };
type Page = { items: Listed[]; continuation?: string };
type ResourceList = { items: Array<Listed & { fromSetup: boolean }>; hasMore: boolean };

/** GET /: shows that the admin reaches the project, with its tables and workflows. */
export async function home(): Promise<Response> {
  const [tables, workflows] = await Promise.all([
    jsonyan.call<Page>('v1.listTables', { limit: 100 }),
    jsonyan.call<Page>('v1.listWorkflows', { limit: 100 }),
  ]);
  // Widened, so this compiles both before setup has written any IDs and after.
  const written: { projectId: string | null; tables: Record<string, string>; workflows: Record<string, string> } =
    resources;
  const fromSetup = new Set([...Object.values(written.tables), ...Object.values(written.workflows)]);
  const view = (listed: Page): ResourceList => ({
    items: listed.items.map(({ id, name, updatedAt }) => ({ id, name, updatedAt, fromSetup: fromSetup.has(id) })),
    hasMore: listed.continuation !== undefined,
  });
  return page({
    title: 'Connected',
    children: (
      <Home
        projectId={jsonyan.projectId}
        resourcesForOtherProject={written.projectId !== null && written.projectId !== jsonyan.projectId}
        tables={view(tables)}
        workflows={view(workflows)}
      />
    ),
  });
}

function Home({
  projectId,
  resourcesForOtherProject,
  tables,
  workflows,
}: {
  projectId: string;
  resourcesForOtherProject: boolean;
  tables: ResourceList;
  workflows: ResourceList;
}) {
  return (
    <>
      <h1>Connected</h1>
      <p>
        Project <code>{projectId}</code>. Submit and delete words on <a href="/words">Words</a>.
      </p>
      {resourcesForOtherProject && (
        <p className="error">
          jsonyan/resources.ts was written for another project. Run <code>npm run setup</code> with this client.
        </p>
      )}
      <ResourceTable
        title="Tables"
        list={tables}
        empty="No tables yet. Follow START.md, then run npm run setup."
      />
      <ResourceTable
        title="Workflows"
        list={workflows}
        empty="No workflows yet. Follow START.md, then run npm run setup."
      />
    </>
  );
}

function ResourceTable({ title, list, empty }: { title: string; list: ResourceList; empty: string }) {
  return (
    <section>
      <h2>{title}</h2>
      {list.items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Updated</th>
              <th>In resources.ts</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <code>{item.id}</code>
                </td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
                <td>{item.fromSetup ? 'yes' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.hasMore && <p className="muted">Showing the first 100.</p>}
    </section>
  );
}
