import { home } from './pages/Home.tsx';
import { deleteWord, submitWord, words } from './pages/Words.tsx';
import type { Route } from './page.tsx';

/** The admin's pages, by path. `GET` handlers only read; `POST` handlers change data. */
export const routes: Record<string, Route> = {
  '/': { GET: home },
  '/words': { GET: words, POST: submitWord },
  '/words/delete': { POST: deleteWord },
};
