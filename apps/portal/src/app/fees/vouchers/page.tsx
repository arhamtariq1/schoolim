import {
  DEFAULT_VOUCHER_SETTINGS,
  MAX_PAGE_LIMIT,
  ROUTES,
  type AcademicSession,
  type ClassLevel,
  type FeeHead,
  type SchoolLogoInfo,
  type SchoolSettings,
  type VoucherSettings,
  type VoucherSummary,
  type VoucherTotals,
} from '@ilm/contracts';
import type { Metadata } from 'next';

import { VouchersView } from '@/components/vouchers-view';
import { apiFetch } from '@/lib/api';
import { clampInt, readParam } from '@/lib/search-params';
import { getSession } from '@/lib/session';

/**
 * Fees › Vouchers.
 *
 * Filters and paging live in the query string, so "unpaid vouchers for Grade 5"
 * is a link, and the server does the filtering — this screen must stay fast on
 * a school with four years of history behind it.
 */
export const metadata: Metadata = { title: 'Fee vouchers' };

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = {
    q: readParam(params, 'q'),
    grNo: readParam(params, 'grNo'),
    sessionId: readParam(params, 'sessionId'),
    classLevelId: readParam(params, 'classLevelId'),
    status: readParam(params, 'status'),
    from: readParam(params, 'from'),
    to: readParam(params, 'to'),
  };

  const limit = clampInt(params['limit'], 25, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const [
    session,
    listResult,
    sessionsResult,
    academicsResult,
    headsResult,
    schoolResult,
    voucherSettingsResult,
    logoResult,
    bankLogoResult,
  ] = await Promise.all([
    getSession(),
    apiFetch<{
      data: VoucherSummary[];
      meta: { page: { total: number; limit: number; offset: number }; totals: VoucherTotals };
    }>(`${ROUTES.vouchers.list}?${query.toString()}`),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevel[] } }>(
      ROUTES.academics.setup,
    ),
    // The fee catalogue, for the "add a fee" picker in the edit dialog. Fetched
    // with the page rather than when the dialog opens: it is small, it is the
    // same for every row, and a request per dialog is a request per row edited.
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
    // The challan preview shows the same document the printer will, so it
    // needs the same three things the print page fetches. They go out with
    // everything else rather than when the dialog opens: a preview that
    // assembles itself after a click is a preview that flickers.
    apiFetch<{ data: SchoolSettings }>(ROUTES.school.settings),
    apiFetch<{ data: VoucherSettings }>(ROUTES.school.voucherSettings),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.schoolLogo.info),
    apiFetch<{ data: SchoolLogoInfo }>(ROUTES.bankLogo.info),
  ]);

  const emptyTotals: VoucherTotals = {
    count: 0,
    netPayableMinor: 0,
    paidMinor: 0,
    outstandingMinor: 0,
  };

  return (
    <VouchersView
        rows={listResult.ok ? listResult.data.data : []}
        sessions={sessionsResult.ok ? sessionsResult.data.data : []}
        classes={academicsResult.ok ? academicsResult.data.data.classes : []}
        heads={headsResult.ok ? headsResult.data.data : []}
        totals={listResult.ok ? listResult.data.meta.totals : emptyTotals}
        total={listResult.ok ? listResult.data.meta.page.total : 0}
        limit={listResult.ok ? listResult.data.meta.page.limit : limit}
        offset={listResult.ok ? listResult.data.meta.page.offset : offset}
        filters={filters}
        school={{
          name: schoolResult.ok ? schoolResult.data.data.name : (session?.school.name ?? ''),
          address: schoolResult.ok ? (schoolResult.data.data.address ?? undefined) : undefined,
          phone: schoolResult.ok ? (schoolResult.data.data.phone ?? undefined) : undefined,
          logoVersion:
            logoResult.ok && logoResult.data.data.present
              ? (logoResult.data.data.version ?? '')
              : undefined,
          bankLogoVersion:
            bankLogoResult.ok && bankLogoResult.data.data.present
              ? (bankLogoResult.data.data.version ?? '')
              : undefined,
          accentColor: schoolResult.ok
            ? (schoolResult.data.data.primaryColor ?? undefined)
            : (session?.school.primaryColor ?? undefined),
        }}
        voucherSettings={
          voucherSettingsResult.ok ? voucherSettingsResult.data.data : DEFAULT_VOUCHER_SETTINGS
        }
        error={listResult.ok ? undefined : listResult.message}
        canCollect={session?.permissions.includes('fees.payment.create') ?? false}
        canCancel={session?.permissions.includes('fees.voucher.cancel') ?? false}
        canEdit={session?.permissions.includes('fees.voucher.generate') ?? false}
        canConfigureChallan={session?.permissions.includes('settings.school.configure') ?? false}
      />
  );
}
