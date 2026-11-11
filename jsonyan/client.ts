/**
 * A small JSONyan v1 client: it reuses each token until it nearly expires, calls methods, lists
 * every page, and starts and resumes workflow instances. It needs only `fetch`.
 *
 * Method names, inputs, results and errors are in docs/jsonyan.openrpc.json, and what each call
 * costs is in docs/jsonyan-client-credit.md. START.md says how to download both.
 */

import type { JsonyanCredentials, JsonyanEndpoint } from './credentials.ts';

/** An error JSONyan returned: `code` is the HTTP status and `errorName` identifies the error. */
export class JsonyanError extends Error {
  readonly code: number;
  readonly errorName: string;
  readonly data: unknown;

  constructor({ code, errorName, message, data }: { code: number; errorName: string; message: string; data: unknown }) {
    super(`${errorName}: ${message}`);
    this.code = code;
    this.errorName = errorName;
    this.data = data;
  }
}

/** What a start or resume returns: v1.startWorkflowInstance in docs/jsonyan.openrpc.json. */
export type WorkflowInstanceState = {
  instance: {
    id: string;
    workflowId: string;
    status: 'waiting' | 'completed' | 'failed';
    state: string;
    createdAt: number;
    updatedAt: number;
    error?: { name: string; path: string; message: string };
  };
  /** Present while the instance waits at an ask: its question and the schema of the answer. */
  ask?: { response: unknown; inputValidation: unknown; answerError?: { message: string } };
  /** The final state's response, once the instance has completed. */
  response?: unknown;
};

type Page<T> = { items: T[]; continuation?: string };

// A token lasts one hour. Asking for a new one while the last has more than 5 minutes left costs
// the project credits, so keep each token until 4 minutes are left, inside the free window.
const REFRESH_BEFORE_EXPIRY_MS = 4 * 60 * 1000;

// Each start or resume gets 20 seconds. An instance that runs out of time stops before its next
// action and waits without an ask, to be resumed with no answer. Stop after this many resumes, so
// one call never runs for minutes.
const MAX_TIME_LIMIT_RESUMES = 5;

/** fetch, with an error that names the URL when the request cannot be sent at all. */
async function post(url: URL | string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, method: 'POST' });
  } catch (cause) {
    throw new Error(`Could not reach ${String(url)}. Check JSONYAN_URL and JSONYAN_TOKEN_URL.`, { cause });
  }
}

/**
 * A function that returns a valid token, and asks JSONyan for a new one only when the last is
 * about to expire. Calls that need a token at the same time share one request.
 */
export function createTokenSource(credentials: JsonyanCredentials): () => Promise<string> {
  let token: { value: string; expiresAt: number } | undefined;
  let pendingToken: Promise<string> | undefined;

  async function requestToken(): Promise<string> {
    const response = await post(credentials.tokenUrl, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'api/access',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    });
    if (!response.ok) {
      throw new Error(`The JSONyan token request failed with status ${response.status}.`);
    }
    const body = (await response.json()) as { access_token: string; expires_in?: number };
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  return function getToken(): Promise<string> {
    if (token !== undefined && token.expiresAt - Date.now() > REFRESH_BEFORE_EXPIRY_MS) {
      return Promise.resolve(token.value);
    }
    pendingToken ??= requestToken().finally(() => {
      pendingToken = undefined;
    });
    return pendingToken;
  };
}

/** A client that requests its own tokens, for a process that has the credentials. */
export function createJsonyanClient(credentials: JsonyanCredentials) {
  return createJsonyanClientFromTokens({ endpoint: credentials, getToken: createTokenSource(credentials) });
}

/**
 * A client that gets its tokens from elsewhere, as the admin's server gets them from admin/dev.ts.
 */
export function createJsonyanClientFromTokens({
  endpoint,
  getToken,
}: {
  endpoint: JsonyanEndpoint;
  getToken: () => Promise<string>;
}) {
  const apiUrl = new URL(endpoint.apiPath, endpoint.url);

  /** Call one v1 method. The project's ID is added to the input. */
  async function call<T>(method: string, input: Record<string, unknown> = {}): Promise<T> {
    const response = await post(apiUrl, {
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'gzip',
        authorization: `Bearer ${await getToken()}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method,
        params: [{ projectId: endpoint.projectId, ...input }],
      }),
    });
    const text = await response.text();
    let body: { result?: T; error?: { code: number; message: string; data?: { name?: string } } };
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`JSONyan answered ${method} with status ${response.status} and no JSON.`);
    }
    if (body.error !== undefined) {
      throw new JsonyanError({
        code: body.error.code,
        errorName: body.error.data?.name ?? 'UnknownError',
        message: body.error.message,
        data: body.error.data,
      });
    }
    return body.result as T;
  }

  /** Call a list method page by page and return every item. */
  async function listAll<T>(method: string, input: Record<string, unknown> = {}): Promise<T[]> {
    const items: T[] = [];
    let continuation: string | undefined;
    do {
      const page: Page<T> = await call<Page<T>>(method, continuation === undefined ? input : { ...input, continuation });
      items.push(...page.items);
      continuation = page.continuation;
    } while (continuation !== undefined);
    return items;
  }

  /** Resume while the instance waits without an ask, which means it stopped at the time limit. */
  async function continueAfterTimeLimit(state: WorkflowInstanceState): Promise<WorkflowInstanceState> {
    let current = state;
    for (
      let resumes = 0;
      resumes < MAX_TIME_LIMIT_RESUMES && current.instance.status === 'waiting' && current.ask === undefined;
      resumes++
    ) {
      current = await call<WorkflowInstanceState>('v1.resumeWorkflowInstance', { instanceId: current.instance.id });
    }
    return current;
  }

  return {
    projectId: endpoint.projectId,
    call,
    listAll,

    /** Start an instance with its first answer, and run it until it waits at an ask or ends. */
    async startWorkflow({ workflowId, input }: { workflowId: string; input: unknown }): Promise<WorkflowInstanceState> {
      const state = await call<WorkflowInstanceState>('v1.startWorkflowInstance', { workflowId, input });
      return continueAfterTimeLimit(state);
    },

    /**
     * Resume a waiting instance, with an answer to its ask or with none (`answer: undefined`), as
     * when checking an AI batch. Runs it until it waits at an ask again or ends.
     */
    async resumeWorkflow({ instanceId, answer }: { instanceId: string; answer: unknown }): Promise<WorkflowInstanceState> {
      const input = answer === undefined ? { instanceId } : { instanceId, answer };
      const state = await call<WorkflowInstanceState>('v1.resumeWorkflowInstance', input);
      return continueAfterTimeLimit(state);
    },
  };
}

export type JsonyanClient = ReturnType<typeof createJsonyanClientFromTokens>;
