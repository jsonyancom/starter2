import type { ReactNode } from 'react';

const SITE_NAME = 'A word a day';

/**
 * The document around the page. Links are relative, so the site works on GitHub Pages under
 * /<repository>/, on any host, and from disk.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{SITE_NAME}</title>
        <link rel="stylesheet" href="style.css" />
      </head>
      <body>
        <header>
          <a href="./">{SITE_NAME}</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
