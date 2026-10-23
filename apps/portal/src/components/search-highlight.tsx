import { Fragment } from 'react';

import { splitHighlight } from '@/lib/search-index';

/**
 * `text` with the searched words marked.
 *
 * Built from React text nodes, never `dangerouslySetInnerHTML`: the text can
 * contain a student's name or a class a school typed, and the search term is
 * user input. Marking is purely visual: the full text stays in the DOM, so a
 * screen reader reads the sentence, not fragments.
 */
export function Highlight({ text, term }: { readonly text: string; readonly term: string }) {
  return (
    <>
      {splitHighlight(text, term).map((part, index) => (
        <Fragment key={`${String(index)}-${part.text}`}>
          {part.match ? (
            <mark className="rounded-sm bg-primary/15 text-foreground">{part.text}</mark>
          ) : (
            part.text
          )}
        </Fragment>
      ))}
    </>
  );
}
