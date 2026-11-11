/**
 * Sends one prompt to OpenAI for the submitWord workflow. A workflow request gets 20 seconds, too
 * short to wait for an AI answer, so the workflow stops at an ask whose response holds the prompt,
 * and the admin's server sends it. The server reads OPENAI_API_KEY from .local.env; the browser never
 * gets it.
 */

import OpenAI from 'openai';

/** What the workflow's ask asks for. START.md fixes this shape. */
export type PromptTask = {
  /** The OpenAI model to use. */
  model: string;
  /** Sent as the only user message. */
  prompt: string;
  /** A strict JSON Schema for the answer, which is also what the ask accepts. */
  outputSchema: Record<string, unknown>;
};

export function isPromptTask(value: unknown): value is PromptTask {
  const task = value as Partial<PromptTask> | null;
  return (
    typeof task === 'object' &&
    task !== null &&
    typeof task.model === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.outputSchema === 'object' &&
    task.outputSchema !== null
  );
}

/** Send the prompt and return OpenAI's answer as parsed JSON, to resume the workflow with. */
export async function answerPrompt(task: PromptTask): Promise<unknown> {
  if (process.env.OPENAI_API_KEY === undefined || process.env.OPENAI_API_KEY === '') {
    throw new Error('Add your OpenAI API key to .local.env as OPENAI_API_KEY, then run npm run admin again.');
  }
  const openai = new OpenAI();
  const completion = await openai.chat.completions.create({
    model: task.model,
    messages: [{ role: 'user', content: task.prompt }],
    response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: task.outputSchema } },
  });
  const message = completion.choices[0]?.message;
  if (message?.content === null || message?.content === undefined) {
    throw new Error(`OpenAI gave no answer${message?.refusal ? `: ${message.refusal}` : '.'}`);
  }
  return JSON.parse(message.content);
}
