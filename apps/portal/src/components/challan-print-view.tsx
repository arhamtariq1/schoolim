'use client';

import { ROUTES, type Challan } from '@ilm/contracts';
import { Button } from '@ilm/ui';
import { useEffect, useState } from 'react';

import { VoucherChallan } from './voucher-challan';

/**
 * A stack of challans, laid out for a printer.
 *
 * ## Why the selection arrives through `sessionStorage`
 *
 * Five hundred ids is thirty kilobytes, which is well past what any browser
 * will carry on a request line and past what most proxies accept in a URL. A
 * print view is also not a link anybody shares — it is a step between pressing
 * Print and holding paper — so the tab that opened it handing the list over
 * directly is both the smallest mechanism and the honest one.
 *
 * ## Why it fetches once and renders plain
 *
 * One request for the whole selection, and the result is rendered as static
 * markup with no per-row state, no handlers and nothing interactive. At five
 * hundred vouchers this page is fifteen hundred challan copies; anything
 * per-row — a memo, a callback, a piece of state — is fifteen hundred of them,
 * and that is the difference between a page that prints and a tab that hangs.
 *
 * ## Why printing is not automatic
 *
 * The temptation is to call `window.print()` on load. Do not: a school that
 * meant to check the stack first gets a print dialog over a page they have not
 * read, and a browser that has not finished laying out fifteen hundred copies
 * prints a document that is half empty. The button waits for them.
 */
export function ChallanPrintView({
  school,
}: {
  readonly school: { name: string; address?: string | undefined; phone?: string | undefined };
}) {
  const [challans, setChallans] = useState<Challan[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(sessionStorage.getItem('ilm:print-vouchers') ?? '[]') as string[];
    } catch {
      ids = [];
    }

    if (ids.length === 0) {
      setError('Nothing was selected. Go back, tick the vouchers you want, and press Print.');
      return;
    }

    void (async () => {
      const response = await fetch(ROUTES.vouchers.challans, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        setError('Could not load those challans. Go back and try again.');
        return;
      }

      const body = (await response.json()) as { data: Challan[] };
      setChallans(body.data);
    })();
  }, []);

  if (error !== undefined) {
    return <p className="p-8 text-sm text-danger">{error}</p>;
  }

  if (challans === undefined) {
    return <p className="p-8 text-sm text-muted-foreground">Loading challans…</p>;
  }

  return (
    <div className="bg-background">
      {/* Hidden on paper: it is the control, not the document. */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-card p-4">
        <span className="text-sm font-medium text-foreground">
          {challans.length} {challans.length === 1 ? 'challan' : 'challans'}, in class order
        </span>
        <Button
          className="ms-auto"
          onClick={() => {
            window.print();
          }}
        >
          Print
        </Button>
      </div>

      <div className="print-stack space-y-4 p-4">
        {challans.map((challan) => (
          <VoucherChallan key={challan.id} voucher={challan} school={school} />
        ))}
      </div>
    </div>
  );
}
