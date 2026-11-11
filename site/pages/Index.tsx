import { Layout } from './Layout.tsx';

/** One word, as the daily job writes it to content/words.json. */
export type Word = { word: string; meaning: string };

/**
 * The home page: every word with its meaning. Replace it with your own design. Render
 * values as text or attributes, which React escapes; never pass them to dangerouslySetInnerHTML.
 */
export function Index({ words }: { words: Word[] }) {
  return (
    <Layout>
      <h1>Words</h1>
      {words.length === 0 ? (
        <p>
          Nothing is published yet. The daily job writes the words to <code>content/words.json</code>; see{' '}
          <code>README.md</code> in the repository.
        </p>
      ) : (
        <dl>
          {words.map(({ word, meaning }, index) => (
            <div key={index}>
              <dt>{word}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </Layout>
  );
}
