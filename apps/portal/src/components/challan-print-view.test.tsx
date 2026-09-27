import { ROUTES } from '@ilm/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChallanPrintView } from './challan-print-view';

import { stashPrintSelection } from '@/lib/print-handoff';

/**
 * The print view, mounted the way React actually mounts it.
 *
 * This file exists because the helper underneath it was fully tested and the
 * screen was still broken. `readPrintSelection` used to delete what it read,
 * which every unit test agreed was correct — and React runs a mount effect
 * **twice** under Strict Mode, which is on in development. The first run took
 * the selection, the second found nothing, and the second is the one that set
 * the error. Somebody who had just ticked fourteen vouchers was told nothing
 * was selected.
 *
 * So every test here renders inside `<StrictMode>` deliberately. A print view
 * that only works when its effect runs once is not a print view that works.
 */

const SCHOOL = { name: 'Demo Public School', address: '14-A Gulberg III', phone: '+924235771400' };

function challan(id: string, studentName: string) {
  return {
    id,
    voucherNo: `SEP-${id}`,
    status: 'UNPAID',
    studentId: `student-${id}`,
    studentName,
    grNo: id,
    fatherName: 'A Father',
    className: 'Grade 1',
    sectionName: 'A',
    sessionId: 'session',
    sessionName: '2026-2027',
    issueDate: '2026-09-01',
    dueDate: '2026-09-15',
    validTill: '2026-09-25',
    billMonths: ['2026-09-01'],
    grossMinor: 600_000,
    discountMinor: 0,
    waiverMinor: 0,
    arrearsMinor: 0,
    netPayableMinor: 600_000,
    totalPayableMinor: 600_000,
    lateFeeMinor: 0,
    paidMinor: 0,
    balanceMinor: 600_000,
    paidOn: null,
    lateFeeAuto: true,
    cancelReason: null,
    lines: [
      {
        id: `${id}-line`,
        feeHeadId: 'head',
        kind: 'FEE',
        label: 'Tuition Fee',
        billMonth: '2026-09-01',
        amountMinor: 600_000,
        discountMinor: 0,
        sortOrder: 1,
      },
    ],
    arrears: [],
  };
}

let requests: { url: string; body: unknown }[] = [];

beforeEach(() => {
  requests = [];
  localStorage.clear();

  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'handoff-token' });

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      requests.push({ url, body });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [challan('0001', 'Ayesha Khan')] }),
      } as Response);
    }),
  );
});

afterEach(() => {
  // Explicit, because `globals: false` means testing-library never registers
  // its own afterEach — and without it every test renders into the DOM the
  // last one left behind, so the second assertion for "School copy" finds
  // three of them and fails for a reason that has nothing to do with the code.
  cleanup();
  vi.unstubAllGlobals();
});

/** Put a selection where the print view will look for it, as the list does. */
function selectAndOpen(ids: string[]): void {
  const token = stashPrintSelection(ids);
  window.history.replaceState({}, '', `/fees/vouchers/print?h=${String(token)}`);
}

describe('opening the print view with a selection', () => {
  it('loads the challans, even though the effect runs twice', async () => {
    selectAndOpen(['0001']);

    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Ayesha Khan').length).toBeGreaterThan(0);
    });

    // And the failure it used to show is nowhere on the page.
    expect(screen.queryByText(/print link has expired/i)).toBeNull();
  });

  it('asks the server once, not once per effect run', async () => {
    selectAndOpen(['0001', '0002']);

    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });

    // The heaviest request in the product. Sending it twice for every print
    // run is five hundred vouchers fetched twice, for nothing.
    expect(requests[0]?.url).toBe(ROUTES.vouchers.challans);
    expect(requests[0]?.body).toEqual({ ids: ['0001', '0002'] });
  });

  it('still works when the page is opened a second time', async () => {
    // A refresh, a back-and-forward, a remount. The ref guard inside the
    // component only spans one mount, so this is the case it cannot cover —
    // and it is the one that told a school its print link had been used up.
    selectAndOpen(['0001']);
    const url = window.location.href;

    const first = render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Ayesha Khan').length).toBeGreaterThan(0);
    });
    first.unmount();

    window.history.replaceState({}, '', url);
    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Ayesha Khan').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/print link has expired/i)).toBeNull();
  });

  it('prints three copies of each challan — school, bank, parent', async () => {
    selectAndOpen(['0001']);

    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText('School copy')).toBeDefined();
    });
    expect(screen.getByText('Bank copy')).toBeDefined();
    expect(screen.getByText('Parent copy')).toBeDefined();
  });

  it('does not print itself on load', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    selectAndOpen(['0001']);

    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Ayesha Khan').length).toBeGreaterThan(0);
    });

    // A browser that has not finished laying out fifteen hundred copies prints
    // a document that is half empty, and a school that meant to check the
    // stack first gets a dialog over a page it has not read.
    expect(print).not.toHaveBeenCalled();
  });
});

describe('opening it without one', () => {
  it('says so when there is no token at all', async () => {
    window.history.replaceState({}, '', '/fees/vouchers/print');

    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText(/print link has expired/i)).toBeDefined();
    });
    expect(requests).toHaveLength(0);
  });

  it('says so when the token names a selection that is gone', async () => {
    window.history.replaceState({}, '', '/fees/vouchers/print?h=swept-away');

    render(
      <StrictMode>
        <ChallanPrintView school={SCHOOL} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText(/print link has expired/i)).toBeDefined();
    });
  });
});
