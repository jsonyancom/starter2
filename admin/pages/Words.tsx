import { findAppResources, SETUP_NEEDED, type AppResources } from '../../jsonyan/app.ts';
import { readWords, type WordRow } from '../../jsonyan/words.ts';
import { jsonyan } from '../jsonyan.ts';
import { answerPrompt, isPromptTask } from '../openai.ts';
import { page, redirect } from '../page.tsx';

// OpenAI's answer is checked by the workflow's ask. When it is rejected, ask OpenAI again, but
// only this many times.
const MAX_PROMPTS = 3;

/** GET /words: every word in the table, with a form to submit one and a button to delete each. */
export async function words(): Promise<Response> {
  return wordsPage({ error: undefined });
}

/** POST /words: explain the submitted word and save it, then show the list again. */
export async function submitWord(request: Request): Promise<Response> {
  const app = findAppResources();
  const word = (await request.formData()).get('word');
  if (app === undefined || typeof word !== 'string') return wordsPage({ error: undefined });
  try {
    await explainAndSave({ workflowId: app.submitWordWorkflowId, word });
  } catch (error) {
    return wordsPage({ error: error instanceof Error ? error.message : String(error) });
  }
  return redirect('/words');
}

/** POST /words/delete: delete one word's row. The next daily run removes it from the site. */
export async function deleteWord(request: Request): Promise<Response> {
  const app = findAppResources();
  const rowId = (await request.formData()).get('id');
  if (app === undefined || typeof rowId !== 'string') return wordsPage({ error: undefined });
  const { items } = await jsonyan.call<{ items: Array<{ state: 'deleted' | 'notFound' | 'failed' }> }>('v1.deleteRows', {
    tableId: app.wordsTableId,
    rows: [{ rowId }],
  });
  if (items[0]?.state === 'failed') return wordsPage({ error: 'JSONyan could not delete the word. Try again.' });
  return redirect('/words');
}

/**
 * Run the submitWord workflow for one word. The workflow checks the word, then waits at an ask
 * whose response is a prompt. This sends the prompt to OpenAI and resumes the workflow with the
 * answer; the workflow checks it and saves the row.
 */
async function explainAndSave({ workflowId, word }: { workflowId: string; word: string }): Promise<void> {
  let state = await jsonyan.startWorkflow({ workflowId, input: { word } });
  try {
    if (state.ask?.answerError !== undefined) {
      throw new Error(`The word was not accepted: ${state.ask.answerError.message}`);
    }
    for (let prompts = 0; state.instance.status === 'waiting' && state.ask !== undefined; prompts++) {
      if (prompts === MAX_PROMPTS) {
        throw new Error(`OpenAI's answer was not accepted: ${state.ask.answerError?.message ?? 'no reason given'}`);
      }
      if (!isPromptTask(state.ask.response)) {
        throw new Error('The submitWord workflow asked for something other than { model, prompt, outputSchema }. See START.md.');
      }
      const answer = await answerPrompt(state.ask.response);
      state = await jsonyan.resumeWorkflow({ instanceId: state.instance.id, answer });
    }
    if (state.instance.status === 'failed') {
      const { error } = state.instance;
      throw new Error(`The submitWord workflow failed${error === undefined ? '.' : ` at ${error.path}: ${error.message}`}`);
    }
    if (state.instance.status === 'waiting') {
      throw new Error('The submitWord workflow is taking too long. Try again.');
    }
  } finally {
    // An instance left waiting is kept, and paid for, until it is deleted.
    if (state.instance.status === 'waiting') {
      await jsonyan
        .call('v1.deleteWorkflowInstances', { instanceIds: [state.instance.id] })
        .catch((error: unknown) => console.error(error));
    }
  }
}

async function wordsPage({ error }: { error: string | undefined }): Promise<Response> {
  const app = findAppResources();
  const rows = app === undefined ? [] : await readWords({ client: jsonyan, tableId: app.wordsTableId });
  return page({
    title: 'Words',
    status: error === undefined ? 200 : 400,
    children: <Words app={app} rows={rows} error={error} />,
  });
}

function Words({ app, rows, error }: { app: AppResources | undefined; rows: WordRow[]; error: string | undefined }) {
  if (app === undefined) {
    return (
      <>
        <h1>Words</h1>
        <p className="error">{SETUP_NEEDED}</p>
      </>
    );
  }
  return (
    <>
      <h1>Words</h1>
      <form method="post" action="/words" className="row">
        <label htmlFor="word">Word</label>
        <input id="word" name="word" required autoComplete="off" />
        <button type="submit">Explain and save</button>
      </form>
      <p className="muted">
        OpenAI explains the word, which can take a few seconds. The site shows it after the next daily run.
      </p>
      {error !== undefined && <p className="error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">No words yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Word</th>
              <th>Meaning</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.word}</td>
                <td>{row.meaning}</td>
                <td>
                  <form method="post" action="/words/delete">
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
