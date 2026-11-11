# content/

What the site shows. `words.json` holds every word in the JSONyan table, as an array of
`{ "word": …, "meaning": … }` sorted by word, and `npm run build:site` turns it into the site's
page.

Only the daily job (`npm run daily`) writes here. It copies the words from JSONyan, and its GitHub
Actions workflow commits the change, so this folder's history is the history of what went live. Do
not edit these files by hand: the next run overwrites them.
