# Start here

This file is for a coding agent. It sets up the JSONyan side of this app: one table and two
workflows in the user's JSONyan project. The code that uses them is already in the repository, and
`README.md` describes the app. Do the steps in order.

## 1. Check the environment

- `node_modules/` exists. If not, run `npm install`.
- `.env` exists and gives a value to every `JSONYAN_*` name in `.env.example`. Check this without
  printing the values, and never print, log or commit them. If the file or a value is missing,
  stop and ask the user to do step 1 of `README.md`.

## 2. Download the JSONyan reference

```sh
mkdir -p docs
curl -fL "https://jsonyan.com/docs/jsonyan.md" -o docs/jsonyan.md
```

Read `docs/jsonyan.md` and run the downloads it lists. Then, in `docs/jsonyan.openrpc.json`, read
`info.description` and these methods with their examples: `v1.createTable`, `v1.createWorkflow`,
`v1.createRows`, `v1.startWorkflowInstance`, `v1.resumeWorkflowInstance`, `v1.openaiSubmitBatch`
and `v1.openaiRetrieveBatch`, plus any row method your workflows call. The specification is the
source of truth for every field you write below.

## 3. Define the table

In `jsonyan/setup/tables/index.ts`, add one table under the key `words`:

- `name`: `words`
- `schema.content`:

  ```json
  {
    "type": "object",
    "properties": {
      "word": { "type": "string", "minLength": 1, "maxLength": 64 },
      "meaning": { "type": "string", "minLength": 1, "maxLength": 1000 }
    },
    "required": ["word", "meaning"],
    "additionalProperties": false
  }
  ```

- No `schema.metadata`.

Every row the workflows create has this shape, so that one key query tells whether a word is
already in the table:

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `partitionKey` | The word, the same string as `content.word`                           |
| `sortInt`      | `0`. A key query leaves out rows without the sort value it reads.     |
| `content`      | `{ "word": …, "meaning": … }`                                         |

## 4. Define the workflows

In `jsonyan/setup/workflows/index.ts`, add two workflows under the keys `dailyWord` and
`submitWord`, named the same. Each is a function of the table IDs, so it can use
`tableIds.words`. Their states, actions and CEL are yours to design from the specification. The
app relies only on what this section states.

For both:

- The model is `gpt-6-luna`.
- The meaning is one or two plain sentences that explain the word to a general reader.
- A word gets one row. When the table already has the word, do not create another row.
- Set `completedInstanceTTL` and `failedInstanceTTL`, so finished instances are not kept forever.

### `dailyWord`: a batch, because nobody waits

`ci/daily.ts` starts it once a day with no input, and later resumes it.

- OpenAI picks one English word that the table does not have yet, and explains it.
- It calls OpenAI through a batch: the workflow actions `v1.openaiSubmitBatch` and
  `v1.openaiRetrieveBatch`, with `secretName` set to `openAIApiKey`.
- Every time the instance waits, a resume with no answer must be valid. The daily job resumes
  every waiting instance of this workflow with no answer and does not look at its state.
- While the batch is still running, a resume goes back to waiting. When it has ended with a usable
  answer, the workflow saves the row and completes.
- It must not wait forever: when the batch failed, or its answer is unusable, the instance ends
  without saving a row.

### `submitWord`: an ask, because someone waits

The admin's form starts it (`admin/pages/Words.tsx`), and the user waits for the result. A request
to JSONyan gets 20 seconds, so the workflow does not call OpenAI itself. It stops at an ask, and
the admin's server sends the prompt with the OpenAI JS SDK (`admin/openai.ts`).

1. The admin starts it with the input `{ "word": "<the word as typed>" }`. So the initial state is
   an ask whose `inputValidation` accepts exactly that object. When it rejects the input, the admin
   shows the user `ask.answerError.message`.
2. When the table already has the word, the workflow completes without asking anything.
3. Otherwise it waits at an ask whose response is exactly this object:

   ```json
   {
     "model": "gpt-6-luna",
     "prompt": "<the whole prompt, sent as the only user message>",
     "outputSchema": { "<a JSON Schema object for the answer>": "…" }
   }
   ```

   The admin sends `prompt` to OpenAI's chat completions with `outputSchema` as a strict structured
   output, parses the answer as JSON, and resumes the instance with that JSON as the answer. OpenAI
   requires a strict schema: every object lists all its properties in `required` and sets
   `additionalProperties` to `false`. Use the same schema as this ask's `inputValidation`.
4. When the ask rejects the answer, the instance waits at the same ask, and the admin sends the
   prompt again, up to three times. Then it deletes the instance.
5. With an accepted answer, the workflow saves the row and completes.

## 5. Apply and check

Tables and workflows can be changed but not deleted, and JSONyan checks CEL only when an instance
reaches it. So read your definitions against the specification before creating anything.

```sh
npm run setup       # creates or updates them by name, and writes jsonyan/resources.ts
npm run typecheck
```

Then run each workflow once. Both call OpenAI with the user's key and spend JSONyan credits, so
tell the user first. They need step 2 of `README.md`: `OPENAI_API_KEY` in `.env`, and the secret
`openAIApiKey` in the project. If that is not done, ask the user to do it, or finish without these
two checks and say so.

- **`submitWord`**: run `npm run admin` in the background and submit a word:

  ```sh
  curl -i -X POST http://127.0.0.1:5173/words -H 'Origin: http://127.0.0.1:5173' -d 'word=serendipity'
  ```

  A `303` means the word was saved. A `400` page holds the reason. Submit the same word again to
  check that no second row appears on http://127.0.0.1:5173/words.
- **`dailyWord`**: run `npm run daily`. It starts an instance, which must be left waiting for its
  batch. Run `npm run daily -- --retrieve-only` a few minutes later, and again until the instance
  completes; a batch can take from minutes to hours. The new word is then in `content/words.json`.

When an instance fails, the output shows the state and the message. Fix the definition, run
`npm run setup` again, and start a new instance: a failed instance cannot be resumed.

## 6. Finish

Tell the user:

- what you created, and what each check showed;
- which `v1` methods the actions of `dailyWord` call, because the GitHub Actions client needs
  them (step 5 of `README.md`);
- to continue with `README.md`.
