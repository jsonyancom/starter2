/**
 * What a handler returns. Each page is React rendered to HTML on the server, so the admin sends
 * the browser no JavaScript, unless a page adds a script from admin/public/.
 */

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Answers one request: it gets the web `Request` and returns a web `Response`. */
export type Handler = (request: Request) => Promise<Response>;

/** A path's handlers: `GET` shows the page (and answers HEAD), `POST` handles its forms. */
export type Route = { GET?: Handler; POST?: Handler };

/** A full page, with the admin's header and styles. React escapes every text and attribute value. */
export function page({ title, status = 200, children }: { title: string; status?: number; children: ReactNode }): Response {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · JSONyan admin`}</title>
        <link rel="stylesheet" href="/admin.css" />
      </head>
      <body>
        <header className="top">
          <a href="/">JSONyan admin</a>
          <a href="/words">Words</a>
        </header>
        <main>{children}</main>
      </body>
    </html>,
  );
  return new Response(`<!doctype html>\n${html}\n`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/** After a form post, send the browser to a page, so that reloading it does not post again. */
export function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

export function notFoundPage(): Response {
  return page({
    title: 'Not found',
    status: 404,
    children: (
      <>
        <h1>Not found</h1>
        <p>
          No page here. Pages are listed in <code>admin/routes.ts</code>.
        </p>
      </>
    ),
  });
}

/** The admin runs only on your machine, so errors show their details. */
export function errorPage(error: unknown): Response {
  return page({
    title: 'Error',
    status: 500,
    children: (
      <>
        <h1>Something went wrong</h1>
        <p className="error">{error instanceof Error ? error.message : String(error)}</p>
        {error instanceof Error && error.stack !== undefined && <pre>{error.stack}</pre>}
      </>
    ),
  });
}
