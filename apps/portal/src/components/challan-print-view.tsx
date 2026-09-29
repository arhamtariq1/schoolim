'use client';

import { ROUTES, type Challan, type VoucherSettings } from '@ilm/contracts';
import { Button } from '@ilm/ui';
import { ExportIcon, ICON_SIZE, PrintIcon } from '@ilm/ui/icons';
import { useEffect, useRef, useState } from 'react';

import { VoucherChallan } from './voucher-challan';

import { readPrintSelection } from '@/lib/print-handoff';

/**
 * A stack of challans, laid out for a printer.
 *
 * ## Why the selection arrives through a handoff token
 *
 * Five hundred ids is eighteen kilobytes, well past what a browser will carry
 * on a request line. The list is stashed by the tab that opened this one and
 * fetched here by a short token — see `print-handoff`, which also explains why
 * it is not `sessionStorage`, the mechanism that looked obvious and silently
 * did not survive `noopener`.
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
  settings,
}: {
  readonly school: {
    name: string;
    address?: string | undefined;
    phone?: string | undefined;
    logoVersion?: string | undefined;
    bankLogoVersion?: string | undefined;
    accentColor?: string | undefined;
  };
  readonly settings: VoucherSettings;
}) {
  const [challans, setChallans] = useState<Challan[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // Strict Mode runs this twice on mount, and the request behind it is the
  // heaviest in the product — five hundred vouchers with their lines. Once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const ids = readPrintSelection(new URLSearchParams(window.location.search).get('h'));

    if (ids.length === 0) {
      setError(
        'That print link has expired, or the selection was not passed across. Go back to the voucher list, tick what you want, and press Print again.',
      );
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
        {/* Two buttons for one browser dialog, because they are two different
            intentions and a school should not have to know that Chrome treats
            "save a PDF" as a kind of printer. The hint is what makes the
            second one honest: there is no server-side PDF writer yet, so this
            is the browser's, and it needs the destination changed once. */}
        <span className="ms-auto flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Prints on A4 — choose <strong className="font-medium">Save as PDF</strong> as the
            destination to download.
          </span>

          <Button
            tone="outline"
            onClick={() => {
              window.print();
            }}
          >
            <ExportIcon className={ICON_SIZE.inline} aria-hidden />
            Download PDF
          </Button>

          <Button
            onClick={() => {
              window.print();
            }}
          >
            <PrintIcon className={ICON_SIZE.inline} aria-hidden />
            Print
          </Button>
        </span>
      </div>

      <div className="print-stack space-y-4 p-4">
        {challans.map((challan) => (
          <VoucherChallan key={challan.id} voucher={challan} school={school} settings={settings} />
        ))}
      </div>
    </div>
  );
}
