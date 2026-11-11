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

1. Install:

   ```sh
   npm install
   ```

2. On jsonyan.com, open your project and choose **Clients**, then **Create client**. Leave
   **Limit available APIs** off. Choose **Copy .env** and paste it into a new file named
   `.jsonyan.env` in this folder (`.jsonyan.env.example` shows what it holds). The secret is
   shown only once.
3. Open your coding agent in this folder and send:

   ```text
   Read START.md and follow it.
   ```

   It downloads JSONyan's reference into `docs/`, defines the `words` table and the `dailyWord`
   and `submitWord` workflows in `jsonyan/setup/`, and creates them with `npm run setup`.

## 2. Add your OpenAI key

The key goes in two places, because two things call OpenAI:

- **In `.local.env`**, as `OPENAI_API_KEY`: copy `.local.env.example` to `.local.env` and add the
  key. The admin uses it when you submit a word. Only the admin's server reads it, on your
  machine; it is never sent to the browser or to GitHub.
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

Push the repository to GitHub, on the branch `main`. `.jsonyan.env` and `.local.env` are not
pushed: Git ignores them.

### Give the daily job its JSONyan client

The daily job runs on GitHub, so GitHub needs the JSONyan client's values. One command saves
them in your repository's settings:

```sh
npm run github:env
```

It reads `.jsonyan.env`, shows which repository it will change, and asks before sending:

| Name                    | Saved as                                                        |
| ----------------------- | --------------------------------------------------------------- |
| `JSONYAN_CLIENT_SECRET` | A repository secret: encrypted, hidden in logs, never shown again |
| The other five `JSONYAN_*` values | Repository variables, which are not secret            |

It sends only those six names and never reads `.local.env`, so your OpenAI key does not go to
GitHub. The daily job does not need it: JSONyan already has it as `openAIApiKey`.

The command needs the [GitHub CLI](https://cli.github.com), signed in with `gh auth login`.
Without it, add the same names by hand under **Settings → Secrets and variables → Actions**:
`JSONYAN_CLIENT_SECRET` on the **Secrets** tab, the other five on the **Variables** tab.

To give the job a client of its own with fewer permissions, create a second client with
**Limit available APIs** on, select `v1.startWorkflowInstance`, `v1.resumeWorkflowInstance`,
`v1.listWorkflowInstanceContextPeeks`, `v1.listRowMetadataByUpdatedAt`, `v1.fetchMultipleRows`,
`v1.findRow` and the methods your agent listed when it finished START.md, paste its **Copy .env**
into another file such as `.ci.env`, and run `npm run github:env -- .ci.env`.

### Turn on GitHub Pages

1. In the repository, open **Settings → Pages**, and under **Build and deployment** set
   **Source** to **GitHub Actions**.
2. Open the **Actions** tab, choose **Site**, then **Run workflow**. The site is at
   `https://<owner>.github.io/<repository>/`.

GitHub Pages sites are public, even from a private repository on most plans.

### Deploy on every push

Nothing in the starter runs by itself: a push does not deploy the site until you turn that on.
The daily job deploys the site whenever the words change, so you need this only to publish
changes you make to `site/` without running **Site** by hand. Edit `.github/workflows/site.yml`
and remove the `# ` in front of these two lines, keeping their indentation:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

Commit and push. Every push to `main` then deploys the site.

## 6. The daily job

`.github/workflows/daily.yml` runs `npm run daily` on GitHub. Each run collects finished words,
writes every word in the table to `content/words.json`, and, when the file changed, commits it to
`main` and deploys the site.

### Try it by hand first

Open the **Actions** tab, choose **Daily**, then **Run workflow**. The run must end green: it
starts today's word and publishes the words you added in the admin. If it fails, its log names
what is missing, usually the JSONyan client's values from step 5.

Run it by hand again whenever you want to publish now, for example after adding or deleting words
in the admin.

### Turn on the schedule

The schedule is off in the starter, so nothing runs by itself until the app is set up. To turn
it on, edit `.github/workflows/daily.yml` and remove the `# ` in front of these three lines,
keeping their indentation:

```yaml
on:
  schedule:
    - cron: '17 0 * * *'
    - cron: '17 3 * * *'
  workflow_dispatch:
```

Commit and push. The job then runs every day:

| Time (UTC) | What it does                                                                        |
| ---------- | ----------------------------------------------------------------------------------- |
| 00:17      | Collects finished words, starts today's word, and publishes                         |
| 03:17      | Collects finished words and publishes, so today's word usually appears the same day |

To turn it off again, put the `# ` back, or choose **Disable workflow** in the **Daily**
workflow's "…" menu in the **Actions** tab.

- **A word can take a day.** OpenAI finishes a batch within 24 hours, usually much sooner. A new
  word is not started while the previous one is still unfinished.
- **Change the times** in the `cron` lines of `daily.yml`. Keep the `'17 3 * * *'` text the same
  in both places it appears.
- **GitHub turns the schedule off** in a public repository after 60 days without activity. The
  job's own commits count, so this happens only if the daily word stops; turn it back on in the
  **Actions** tab.
- **Before you push code**, run `git pull --rebase`: the job commits to `main` too.

You can also run it on your machine: `npm run daily` (or `npm run daily -- --retrieve-only` to
skip starting a word) uses `.jsonyan.env` and writes `content/words.json` without committing.

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
| `ci/github-env.ts`   | Sends the JSONyan client's values to your GitHub repository                        |
| `.jsonyan.env.example`, `.local.env.example` | What `.jsonyan.env` and `.local.env` hold                  |

## Scripts

| Command              | What it does                                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| `npm run admin`      | Runs the admin at http://127.0.0.1:5173                                         |
| `npm run site`       | Builds the site, serves it at http://127.0.0.1:5174, and rebuilds it on changes |
| `npm run build:site` | Builds `content/` into `dist/` once, as the deploy does                         |
| `npm run setup`      | Creates or updates the table and workflows in `jsonyan/setup/`                  |
| `npm run daily`      | Runs the daily job once                                                         |
| `npm run github:env` | Saves the JSONyan client in `.jsonyan.env` to your GitHub repository            |
| `npm run typecheck`  | Type-checks everything                                                          |

## Keys and secrets

| What                       | Where it is kept                          | Who reads it                          |
| -------------------------- | ----------------------------------------- | ------------------------------------- |
| Your JSONyan client        | `.jsonyan.env`, ignored by Git            | `npm run admin`, `setup` and `daily`  |
| The same client, on GitHub | A repository secret and five variables    | The daily job                         |
| Your OpenAI key            | `.local.env`, ignored by Git, and JSONyan's secret `openAIApiKey` | The admin's server, and JSONyan |
| The client's token         | `.jsonyan-token.json`, ignored by Git     | `npm run admin`, `setup` and `daily`  |

Nothing secret is in the repository, in the site, or in any JavaScript sent to a browser. If
`.jsonyan.env` is missing, `npm run admin` and `npm run setup` ask you to paste its values instead.

The token file is why running a command again costs nothing extra. A JSONyan token works for one
hour, and asking for a new one while the last has more than 5 minutes left costs credits, so the
commands save the token and share it. It gives the same access as the client for that hour, so
treat it like `.jsonyan.env`. Delete the file to make the next command ask for a new token.
