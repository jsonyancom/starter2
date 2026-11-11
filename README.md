# A word a day

A small site that gets one new word every day, with its meaning written by AI.

- **Every day**, OpenAI (`gpt-6-luna`) picks a word and explains it. A scheduled GitHub Actions
  job starts that work, collects the result, and publishes it.
- **You can add a word yourself** in a local admin: type a word, and OpenAI explains it right
  away. You can also delete any word.
- **The site** is static HTML on GitHub Pages. It shows every word, and is redeployed whenever
  the words change.

The words are stored in a [JSONyan](https://jsonyan.com) table, and JSONyan workflows do the
work with them. **Start with [START.md](START.md)**: it sets up that table and those workflows.
The rest of this file is about running the app.

## Requirements

- Node.js 24 or newer
- A project on [jsonyan.com](https://jsonyan.com)
- An [OpenAI API key](https://platform.openai.com/api-keys)
- A GitHub repository, for the daily job and GitHub Pages

## 1. Set up with START.md

1. Install, and create your `.env`:

   ```sh
   npm install
   cp .env.example .env
   ```

2. On jsonyan.com, open your project and choose **Clients**, then **Create client**. Leave
   **Limit available APIs** off. Choose **Copy .env** and paste it over the six `JSONYAN_*` lines
   of `.env`. The secret is shown only once.
3. Open your coding agent in this folder and send:

   ```text
   Read START.md and follow it.
   ```

   It downloads JSONyan's reference into `docs/`, defines the `words` table and the `dailyWord`
   and `submitWord` workflows in `jsonyan/setup/`, and creates them with `npm run setup`.

## 2. Add your OpenAI key

The key goes in two places, because two things call OpenAI:

- **In `.env`**, as `OPENAI_API_KEY`. The admin uses it when you submit a word. Only the admin's
  server reads it, on your machine; it is never sent to the browser.
- **In JSONyan**, as a secret named exactly `openAIApiKey`. On jsonyan.com, open the project,
  choose **Secrets**, then **Create secret**, enter the name `openAIApiKey` and paste the key as
  the value. The daily word uses it: JSONyan sends that batch to OpenAI itself.

## 3. Use the admin

```sh
npm run admin
```

Open http://127.0.0.1:5173/words.

- **Submit a word**: type it and choose **Explain and save**. After a few seconds the word and
  its meaning are in the list. A word that is already in the list is not added twice.
- **Delete a word**: choose **Delete** next to it.

The admin changes the JSONyan table, not the site. The site shows a change after the next daily
run; to publish sooner, run the **Daily** workflow by hand (step 6).

The admin runs only on your machine, at 127.0.0.1, and is never deployed. When you change
something in `admin/`, `jsonyan/` or `site/`, it restarts; refresh the page to see the change.

## 4. Preview the site

```sh
npm run site
```

It builds `content/words.json` into `dist/` and serves it at http://127.0.0.1:5174, building
again when `site/` or `content/` changes. It needs no keys. Change `site/pages/` and
`site/style.css` to your design.

## 5. Put it on GitHub

Push the repository to GitHub, on the branch `main`. `.env` is not pushed: Git ignores it.

### Store a JSONyan client for the daily job

The daily job runs on GitHub, so it needs a JSONyan client of its own, kept as encrypted
repository secrets. Do not reuse your local client, and never commit a client's values.

1. On jsonyan.com, create a second client (**Clients**, then **Create client**) and choose
   **Copy .env**. To limit it, turn on **Limit available APIs** and select
   `v1.startWorkflowInstance`, `v1.resumeWorkflowInstance`,
   `v1.listWorkflowInstanceContextPeeks`, `v1.listRowMetadataByUpdatedAt`,
   `v1.fetchMultipleRows`, `v1.findRow`, and the methods your agent listed when it finished
   START.md.
2. In the GitHub repository, open **Settings → Secrets and variables → Actions**, and choose
   **New repository secret** once per line of the copied text. The name is the part before `=`
   and the secret is the part after it:

   | Name                    | Secret                              |
   | ----------------------- | ----------------------------------- |
   | `JSONYAN_URL`           | The value after `JSONYAN_URL=`      |
   | `JSONYAN_API_PATH`      | The value after `JSONYAN_API_PATH=` |
   | `JSONYAN_TOKEN_URL`     | The value after `JSONYAN_TOKEN_URL=` |
   | `JSONYAN_PROJECT_ID`    | The value after `JSONYAN_PROJECT_ID=` |
   | `JSONYAN_CLIENT_ID`     | The value after `JSONYAN_CLIENT_ID=` |
   | `JSONYAN_CLIENT_SECRET` | The value after `JSONYAN_CLIENT_SECRET=` |

GitHub encrypts the secrets, hides them in logs, and never shows them again. The daily job does
not need your OpenAI key: JSONyan already has it as `openAIApiKey`.

### Turn on GitHub Pages

1. In the repository, open **Settings → Pages**, and under **Build and deployment** set
   **Source** to **GitHub Actions**.
2. Open the **Actions** tab and run **Site** by hand, or push a commit. The site is at
   `https://<owner>.github.io/<repository>/`.

GitHub Pages sites are public, even from a private repository on most plans.

## 6. The daily job

`.github/workflows/daily.yml` runs `npm run daily` on a schedule:

| Time (UTC) | What it does                                                                        |
| ---------- | ----------------------------------------------------------------------------------- |
| 00:17      | Collects finished words, starts today's word, and publishes                         |
| 03:17      | Collects finished words and publishes, so today's word usually appears the same day |

Publishing writes every word in the table to `content/words.json`. When the file changed, the job
commits it to `main` and deploys the site.

- **Run it by hand**: open the **Actions** tab, choose **Daily**, then **Run workflow**. Do this
  after adding or deleting words in the admin to publish them now.
- **A word can take a day.** OpenAI finishes a batch within 24 hours, usually much sooner. A new
  word is not started while the previous one is still unfinished.
- **Change the times** in the `cron` lines of `daily.yml`. Keep the `'17 3 * * *'` text the same
  in both places it appears.
- **GitHub turns the schedule off** in a public repository after 60 days without activity. The
  job's own commits count, so this happens only if the daily word stops; turn it back on in the
  **Actions** tab.
- **Before you push code**, run `git pull --rebase`: the job commits to `main` too.

You can also run it on your machine: `npm run daily` (or `npm run daily -- --retrieve-only` to
skip starting a word) uses `.env` and writes `content/words.json` without committing.

## What's where

| Path                 | What it is                                                                         |
| -------------------- | ---------------------------------------------------------------------------------- |
| `START.md`           | Sets up the JSONyan table and workflows, with a coding agent                       |
| `admin/`             | The admin: a small Node server on 127.0.0.1 that renders React pages               |
| `admin/openai.ts`    | Sends a submitted word's prompt to OpenAI with the OpenAI JS SDK                   |
| `ci/daily.ts`        | The daily job                                                                      |
| `site/`              | The site, rendered from React to plain HTML by `site/build.tsx`                    |
| `content/words.json` | The published words. Only the daily job writes it.                                 |
| `jsonyan/setup/`     | The table and workflow definitions, applied by `npm run setup`                     |
| `jsonyan/`           | The JSONyan client, and the IDs that setup wrote (`resources.ts`)                  |
| `.github/workflows/` | `daily.yml`, the schedule, and `site.yml`, which builds and deploys the site       |
| `.env.example`       | The names `.env` needs                                                             |

## Scripts

| Command              | What it does                                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| `npm run admin`      | Runs the admin at http://127.0.0.1:5173                                         |
| `npm run site`       | Builds the site, serves it at http://127.0.0.1:5174, and rebuilds it on changes |
| `npm run build:site` | Builds `content/` into `dist/` once, as the deploy does                         |
| `npm run setup`      | Creates or updates the table and workflows in `jsonyan/setup/`                  |
| `npm run daily`      | Runs the daily job once                                                         |
| `npm run typecheck`  | Type-checks everything                                                          |

## Keys and secrets

| What                       | Where it is kept                          | Who reads it                          |
| -------------------------- | ----------------------------------------- | ------------------------------------- |
| Your local JSONyan client  | `.env`, ignored by Git                    | `npm run admin`, `setup` and `daily`  |
| Your OpenAI key            | `.env`, and JSONyan's secret `openAIApiKey` | The admin's server, and JSONyan     |
| The job's JSONyan client   | GitHub repository secrets                 | The daily job                         |

Nothing secret is in the repository, in the site, or in any JavaScript sent to a browser. If
`.env` has no JSONyan values, `npm run admin` and `npm run setup` ask you to paste them instead.
