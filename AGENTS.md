# Agent guide

Read these before changing anything:

- `README.md`: what the app does, how it runs, and where each part is.
- `START.md`: the JSONyan table and workflows the app needs, and how to download JSONyan's
  reference into `docs/`. Read a method in `docs/jsonyan.openrpc.json` before calling it.

## Rules

- **Keep secrets in `.env` and GitHub repository secrets only.** Never print, log or commit the
  JSONyan client's values, its token (`.jsonyan-token.json`) or the OpenAI key, and never put them
  in code or in anything sent to a browser.
- **Do not start loops, timers or background jobs that call JSONyan or OpenAI** unless the user
  asks. Every call spends the user's credits.
- **The site never calls JSONyan or OpenAI.** It reads only `content/`, which only the daily job
  writes.
- **The admin runs only on 127.0.0.1.** Keep the Host and Origin checks in `admin/server.ts`.
  `GET` handlers only read; change data in `POST` handlers.
- **Define tables and workflows in `jsonyan/setup/`** and apply them with `npm run setup`. They
  cannot be deleted, and never create them when the app or the job starts.
- **Ask the user before adding a package.**
- **Render data as React text or attributes**, never with `dangerouslySetInnerHTML`.
- Run `npm run typecheck` after changes.
