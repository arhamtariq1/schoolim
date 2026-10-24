'use client';

import { PAYMENT_METHODS } from '@ilm/contracts';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import {
  ASSESSMENTS,
  ASSESSMENT_TYPES,
  ASSIGNEES,
  CLASSES,
  CLASSES_WITH_SECTIONS,
  CLASS_OPTIONS,
  CLASS_OVERVIEW,
  DASHBOARD,
  DEFAULTERS,
  EXPENSES,
  EXPENSE_CATEGORIES,
  FEE_HEADS,
  FEE_INCREMENTS,
  HOLIDAYS,
  REQUESTS,
  REQUEST_SUMMARY,
  SALARIES,
  SECURITY_DEPOSITS,
  SESSION,
  SESSIONS,
  STAFF,
  STAFF_MONTHLY,
  STAFF_ROSTER,
  STUDENTS,
  SUBJECTS,
  TIMETABLES,
  TIMETABLE_OPTIONS,
  TODAY,
  VOUCHERS,
  VOUCHER_SETTINGS,
  VOUCHER_TOTALS,
  can,
} from './fixtures';

/**
 * Which real portal screen the preview shows for each sidebar destination —
 * ADR-0022.
 *
 * Each entry renders the same view component the portal's page renders, with
 * the props that page would build, from `fixtures.ts` instead of the API. The
 * wrappers (`space-y-6`, the admission page's header) are copied from the
 * pages so the spacing matches as well.
 *
 * ## Loaded on demand
 *
 * Every screen is a `next/dynamic` import, so the landing page downloads the
 * dashboard and nothing else until a visitor chooses another page. The real
 * screens are large — the voucher list alone is a few thousand lines with its
 * dialogs — and the hero must not pay for screens nobody opens.
 */

const LIST = { limit: 25, offset: 0 } as const;
const CURRENT_SESSION = SESSIONS[0]?.id;

const loading = () => <div className="h-96 animate-pulse rounded-2xl bg-muted/60" />;

const HomeDashboard = dynamic(
  () => import('@/components/dashboard/home-dashboard').then((m) => m.HomeDashboard),
  { loading },
);
const WorkspacePageHeader = dynamic(() =>
  import('@/components/workspace-page-header').then((m) => m.WorkspacePageHeader),
);
const AdmissionForm = dynamic(
  () => import('@/components/admission-form').then((m) => m.AdmissionForm),
  { loading },
);
const StudentsTable = dynamic(
  () => import('@/components/students-table').then((m) => m.StudentsTable),
  { loading },
);
const VouchersView = dynamic(
  () => import('@/components/vouchers-view').then((m) => m.VouchersView),
  { loading },
);
const GenerateFee = dynamic(() => import('@/components/generate-fee').then((m) => m.GenerateFee), {
  loading,
});
const DefaultersView = dynamic(
  () => import('@/components/defaulters-view').then((m) => m.DefaultersView),
  { loading },
);
const FeeIncrementsView = dynamic(
  () => import('@/components/fee-increments-view').then((m) => m.FeeIncrementsView),
  { loading },
);
const SecurityDepositsView = dynamic(
  () => import('@/components/security-deposits-view').then((m) => m.SecurityDepositsView),
  { loading },
);
const AttendanceClassOverviewTable = dynamic(
  () =>
    import('@/components/attendance-class-overview-table').then(
      (m) => m.AttendanceClassOverviewTable,
    ),
  { loading },
);
const StaffAttendanceRosterView = dynamic(
  () => import('@/components/staff-attendance-roster').then((m) => m.StaffAttendanceRosterView),
  { loading },
);
const AttendanceClassReportTable = dynamic(
  () =>
    import('@/components/attendance-class-report-table').then((m) => m.AttendanceClassReportTable),
  { loading },
);
const MonthlyAttendanceReportView = dynamic(
  () =>
    import('@/components/monthly-attendance-report-view').then(
      (m) => m.MonthlyAttendanceReportView,
    ),
  { loading },
);
const MarksListView = dynamic(
  () => import('@/components/marks-list-view').then((m) => m.MarksListView),
  { loading },
);
const ClassesManager = dynamic(
  () => import('@/components/classes-manager').then((m) => m.ClassesManager),
  { loading },
);
const SessionsManager = dynamic(
  () => import('@/components/sessions-manager').then((m) => m.SessionsManager),
  { loading },
);
const PromoteStudents = dynamic(
  () => import('@/components/promote-students').then((m) => m.PromoteStudents),
  { loading },
);
const HolidaysManager = dynamic(
  () => import('@/components/holidays-manager').then((m) => m.HolidaysManager),
  { loading },
);
const TimetablesView = dynamic(
  () => import('@/components/timetables-view').then((m) => m.TimetablesView),
  { loading },
);
const StaffTable = dynamic(() => import('@/components/staff-table').then((m) => m.StaffTable), {
  loading,
});
const SalariesView = dynamic(
  () => import('@/components/salaries-view').then((m) => m.SalariesView),
  { loading },
);
const ExpensesView = dynamic(
  () => import('@/components/expenses-view').then((m) => m.ExpensesView),
  { loading },
);
const RequestsView = dynamic(
  () => import('@/components/requests-view').then((m) => m.RequestsView),
  { loading },
);

const NO_FEE_FILTERS = { q: '', classLevelId: '', status: '', gender: '' } as const;

/** Screens by the sidebar href they stand in for. */
export const SCREENS: Readonly<Record<string, ComponentType>> = {
  '/': () => <HomeDashboard session={SESSION} snapshot={DASHBOARD} tenantSlug={undefined} />,

  '/students/new': () => (
    <div className="w-full space-y-8">
      <WorkspacePageHeader
        title="New admission"
        description="Capture a new admission, guardian contact, and opening fees."
      />
      <AdmissionForm
        today={TODAY}
        sessionId={CURRENT_SESSION ?? null}
        sessions={SESSIONS.filter((s) => s.status !== 'CLOSED')}
        classes={CLASSES_WITH_SECTIONS}
        catalogue={FEE_HEADS}
        canSetFees={can('fees.discount.create')}
        grConfigured
        canConfigureGr={can('settings.school.configure')}
      />
    </div>
  ),

  '/students': () => (
    <StudentsTable
      rows={STUDENTS}
      total={486}
      aggregates={{}}
      search=""
      status=""
      classLevelId=""
      classes={CLASS_OPTIONS}
      isFiltered={false}
      {...LIST}
      sort="createdAt"
      order="desc"
      can={{
        create: can('students.student.create'),
        update: can('students.student.update'),
        delete: can('students.student.delete'),
      }}
    />
  ),

  '/fees/vouchers': () => (
    <VouchersView
      rows={VOUCHERS}
      sessions={SESSIONS}
      classes={CLASSES}
      heads={FEE_HEADS}
      totals={VOUCHER_TOTALS}
      total={486}
      {...LIST}
      filters={{ q: '', sessionId: '', classLevelId: '', status: '', from: '', to: '' }}
      sort="issueDate"
      order="desc"
      school={{ name: SESSION.school.name, bankLogos: [] }}
      voucherSettings={VOUCHER_SETTINGS}
      canCollect={can('fees.payment.create')}
      canCancel={can('fees.voucher.cancel')}
      canEdit={can('fees.voucher.generate')}
      canConfigureChallan={can('settings.school.configure')}
    />
  ),

  '/fees/generate': () => (
    <GenerateFee
      sessions={SESSIONS}
      classes={CLASSES}
      heads={FEE_HEADS}
      currentSessionId={CURRENT_SESSION}
      canGenerate={can('fees.voucher.generate')}
      schoolName={SESSION.school.name}
    />
  ),

  '/fees/defaulters': () => (
    <DefaultersView
      page={DEFAULTERS}
      classes={CLASSES}
      {...LIST}
      sort="amount"
      order="desc"
      filters={{ ...NO_FEE_FILTERS, months: '', from: '', to: '' }}
    />
  ),

  '/fees/increments': () => (
    <FeeIncrementsView
      page={FEE_INCREMENTS}
      sessions={SESSIONS}
      classes={CLASSES}
      total={FEE_INCREMENTS.total}
      {...LIST}
      sort="name"
      order="asc"
      filters={{ ...NO_FEE_FILTERS, sessionId: '' }}
      canApply={can('fees.plan.update')}
    />
  ),

  '/fees/security-deposits': () => (
    <SecurityDepositsView
      page={SECURITY_DEPOSITS}
      classes={CLASSES}
      {...LIST}
      sort="receivedOn"
      order="desc"
      filters={{ q: '', classLevelId: '', status: '', state: '' }}
      canRefund={can('fees.deposit.refund')}
    />
  ),

  '/attendance/mark/students': () => (
    <div className="space-y-6">
      <AttendanceClassOverviewTable
        overview={CLASS_OVERVIEW}
        hrefPrefix="/attendance/mark/students"
        actionLabel="Mark attendance"
        reviewLabel="View / Edit"
        title="Mark student attendance"
        description="Pick a class. Everyone starts present, so you only tap the exceptions."
        basePath="/attendance/mark/students"
        reportHrefPrefix="/attendance/reports/students"
      />
    </div>
  ),

  '/attendance/mark/teachers': () => (
    <div className="space-y-6">
      <StaffAttendanceRosterView roster={STAFF_ROSTER} canMark={can('attendance.staff.mark')} />
    </div>
  ),

  '/attendance/reports/students': () => (
    <div className="space-y-6">
      <AttendanceClassReportTable
        overview={CLASS_OVERVIEW}
        hrefPrefix="/attendance/reports/students"
        title="Student attendance report"
        description="A month at a time, per class, with the percentage worked out against the days each child could actually have attended."
      />
    </div>
  ),

  '/attendance/reports/teachers': () => (
    <div className="space-y-6">
      <MonthlyAttendanceReportView
        variant="staff"
        report={STAFF_MONTHLY}
        basePath="/attendance/reports/teachers"
        filters={{ month: STAFF_MONTHLY.month, q: '' }}
      />
    </div>
  ),

  '/marks': () => (
    <MarksListView
      items={ASSESSMENTS}
      classes={CLASS_OPTIONS}
      subjects={SUBJECTS}
      types={ASSESSMENT_TYPES}
      filters={{ classLevelId: '', subjectId: '', assessmentTypeId: '' }}
      can={{ enter: can('exams.mark.enter'), setup: can('exams.assessment.configure') }}
      error={undefined}
    />
  ),

  '/classes': () => (
    <ClassesManager
      classes={CLASSES}
      sessions={SESSIONS}
      activeSessionId={CURRENT_SESSION}
      canConfigure={can('academics.structure.configure')}
      canRenumber={false}
      enabledSchoolLevels={['pre-school', 'primary', 'middle', 'secondary']}
    />
  ),

  '/academics/sessions': () => (
    <SessionsManager sessions={SESSIONS} canConfigure={can('academics.session.configure')} />
  ),

  '/academics/promote': () => (
    <PromoteStudents sessions={SESSIONS} canConfigure={can('academics.session.configure')} />
  ),

  '/academics/holidays': () => (
    <HolidaysManager
      holidays={HOLIDAYS}
      sessions={SESSIONS}
      activeSessionId={CURRENT_SESSION}
      today={TODAY}
      canConfigure={can('academics.structure.configure')}
    />
  ),

  '/timetables': () => (
    <TimetablesView
      canManage={can('academics.timetable.manage')}
      rows={TIMETABLES}
      total={TIMETABLES.length}
      filters={{
        q: '',
        sessionId: '',
        classLevelId: '',
        kind: '',
        assessmentTypeId: '',
        status: '',
      }}
      sort="updatedAt"
      order="desc"
      {...LIST}
      options={TIMETABLE_OPTIONS}
    />
  ),

  '/staff': () => (
    <StaffTable
      rows={STAFF}
      total={46}
      {...LIST}
      search=""
      role=""
      gender=""
      sort="name"
      order="asc"
      canManage={can('staff.record.manage')}
    />
  ),

  '/salaries': () => (
    <SalariesView canPay={can('staff.salary.pay')} today={TODAY} preview={SALARIES} />
  ),

  '/finance': () => (
    <ExpensesView
      rows={EXPENSES}
      categories={EXPENSE_CATEGORIES}
      sessions={SESSIONS}
      totals={{ totalMinor: 86_100_000, count: 48 }}
      monthTotals={{ totalMinor: 86_100_000, count: 48 }}
      lastMonthTotals={{ totalMinor: 84_700_000, count: 45 }}
      total={48}
      {...LIST}
      filters={{ q: '', categoryId: '', sessionId: '', method: '', from: '', to: '' }}
      sort="paidOn"
      order="desc"
      canManage={can('finance.expense.manage')}
      paymentMethods={PAYMENT_METHODS}
    />
  ),

  '/requests': () => (
    <RequestsView
      mode="manage"
      rows={REQUESTS}
      total={REQUEST_SUMMARY.total}
      summary={REQUEST_SUMMARY}
      filters={{ q: '', status: '', category: '', priority: '', assignee: '' }}
      sort="lastActivityAt"
      order="desc"
      {...LIST}
      assignees={ASSIGNEES}
    />
  ),
};
