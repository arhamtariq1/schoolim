import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

/**
 * The dialog's scroll contract.
 *
 * ## What these can and cannot prove
 *
 * jsdom has no layout engine: nothing here has a height, so "does a long form
 * scroll" is not a question it can answer. What it *can* answer is whether the
 * boxes that do the scrolling are still arranged the way the fix arranged them
 * — and that is the thing that actually broke.
 *
 * The bug was not subtle once found. `DialogContent` is a flex column and
 * `DialogBody` is its `flex-1 overflow-y-auto` middle, which is correct — but
 * every form dialog in this product wraps the three parts in a `<form>`, so the
 * *form* was the flex item and the body was an ordinary block inside it with no
 * flex parent to size it against. The body grew past `max-h`, and a form taller
 * than the window simply could not be scrolled.
 *
 * So these assert class names, which is testing an implementation — and is the
 * right trade here. The alternative is no test at all on a fix whose entire
 * content is four utility classes, which somebody will tidy away in a year.
 */

function renderDialog(children: React.ReactNode) {
  return render(
    <Dialog open>
      <DialogContent>{children}</DialogContent>
    </Dialog>,
  );
}

function content(): HTMLElement {
  const node = screen.getByRole('dialog');
  return node;
}

describe('the dialog is a column with a scrolling middle', () => {
  it('constrains itself to the window rather than growing past it', () => {
    renderDialog(
      <>
        <DialogHeader>
          <DialogTitle>A title</DialogTitle>
        </DialogHeader>
        <DialogBody>body</DialogBody>
      </>,
    );

    const box = content();
    expect(box.className).toContain('flex');
    expect(box.className).toContain('flex-col');
    expect(box.className).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('makes a `form` child the column too, which is how every form dialog is built', () => {
    renderDialog(
      <form>
        <DialogHeader>
          <DialogTitle>A form</DialogTitle>
        </DialogHeader>
        <DialogBody>body</DialogBody>
        <DialogFooter>footer</DialogFooter>
      </form>,
    );

    // Without these four, the form is the flex item and the body below has no
    // flex parent — which is exactly the state a dialog taller than the window
    // could not be scrolled in.
    for (const rule of [
      '[&>form]:flex',
      '[&>form]:min-h-0',
      '[&>form]:flex-1',
      '[&>form]:flex-col',
    ]) {
      expect(content().className).toContain(rule);
    }
  });

  it('gives the body the two properties that make it the scrollport', () => {
    renderDialog(
      <form>
        <DialogHeader>
          <DialogTitle>A form</DialogTitle>
        </DialogHeader>
        <DialogBody data-testid="body">body</DialogBody>
      </form>,
    );

    const body = screen.getByTestId('body');
    // `overflow-y-auto` alone is not enough: a flex item's default `min-height:
    // auto` refuses to shrink below its content, so the box grows instead of
    // scrolling. `min-h-0` is the half everybody forgets.
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
    expect(body.className).toContain('flex-1');
  });

  it('keeps the header and footer out of the scroll', () => {
    renderDialog(
      <form>
        <DialogHeader data-testid="header">
          <DialogTitle>A form</DialogTitle>
        </DialogHeader>
        <DialogBody>body</DialogBody>
        <DialogFooter data-testid="footer">footer</DialogFooter>
      </form>,
    );

    // Both `shrink-0`, so a long body never pushes the Save button off the
    // bottom of a laptop screen — which is the other half of the same bug.
    expect(screen.getByTestId('header').className).toContain('shrink-0');
    expect(screen.getByTestId('footer').className).toContain('shrink-0');
  });
});
