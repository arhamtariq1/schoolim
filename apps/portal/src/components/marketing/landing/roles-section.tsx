import { cn } from '@ilm/ui';
import {
  AccountIcon,
  ClassIcon,
  DashboardIcon,
  FinanceIcon,
  ForwardIcon,
  ICON_SIZE,
  LockedIcon,
  SchoolIcon,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import type { ComponentType } from 'react';

import { Reveal } from '@/components/marketing/marketing-parts';
import { CONTAINER, SECTION_Y } from '@/components/marketing/sections/shared';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

/**
 * Where a page like this would put testimonials, this one puts the people the
 * product is for and what each of them sees. ADR-0019 rules out quotes we do
 * not have; every line here is a permission the product actually enforces,
 * and `sees` names what is in that person's menu.
 */
const ROLES: {
  Icon: IconComponent;
  role: string;
  scope: string;
  body: string;
  sees: readonly string[];
}[] = [
  {
    Icon: SchoolIcon,
    role: 'Owner',
    scope: 'Every campus',
    body: 'Every campus under one sign-in, with collection, attendance and staff on one dashboard.',
    sees: ['Dashboard', 'Finance', 'All campuses'],
  },
  {
    Icon: DashboardIcon,
    role: 'Principal',
    scope: 'Whole school',
    body: 'Who is absent, which class is behind and what is still due — at a glance, every morning.',
    sees: ['Attendance', 'Marks', 'Staff'],
  },
  {
    Icon: FinanceIcon,
    role: 'Accountant',
    scope: 'Fees & finance',
    body: 'Vouchers, payments and deposits in one ledger. Nothing edited, everything reversible.',
    sees: ['Vouchers', 'Payments', 'Salaries'],
  },
  {
    Icon: ClassIcon,
    role: 'Teacher',
    scope: 'Own classes',
    body: 'Only their own classes: attendance and marks from a phone, and the week’s timetable.',
    sees: ['Attendance', 'Marks', 'Timetable'],
  },
  {
    Icon: StudentsIcon,
    role: 'Parent',
    scope: 'Own children',
    body: 'Their own children and nobody else’s — fee vouchers, what is due, and requests.',
    sees: ['Vouchers', 'Dues', 'Requests'],
  },
  {
    Icon: AccountIcon,
    role: 'Office staff',
    scope: 'Front desk',
    body: 'Admissions, fee collection at the counter and printed challans — what their role allows.',
    sees: ['Admissions', 'Fee counter', 'Challans'],
  },
];

/**
 * Who sees what: the argument held on the left, over a teal card that says
 * the one rule behind it, and six grey role cards on the right, each listing
 * what is in that person's menu.
 */
export function RolesSection() {
  return (
    <section
      id="roles"
      aria-labelledby="roles-title"
      className={cn(CONTAINER, SECTION_Y, 'scroll-mt-24')}
    >
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <Reveal>
              <h2
                id="roles-title"
                className="font-display text-display-md text-heading font-medium text-balance"
              >
                Everyone gets their own window
              </h2>
              <p className="mt-5 text-lg text-pretty text-muted-foreground">
                The menu is built from each person’s permissions, so nobody wades through screens
                that are not theirs.
              </p>
            </Reveal>

            <Reveal
              index={1}
              className="marketing-ink rounded-tile mt-8 bg-linear-to-br from-brand-600 to-brand-900 p-6"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-foreground text-brand-800">
                <LockedIcon className={ICON_SIZE.nav} aria-hidden />
              </span>
              <p className="mt-5 text-lg font-semibold text-foreground">
                One login per person, one record per student.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                Nobody sees a record they should not — not even that another family exists.
              </p>
              <Link
                href="/signup"
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-foreground transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Set up your school’s roles
                <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
              </Link>
            </Reveal>
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          {ROLES.map(({ Icon, role, scope, body, sees }, position) => (
            <li key={role}>
              {/* The lift sits on the card inside, not on the `Reveal`: the
                  reveal's delayed transition would make it lag the cursor. */}
              <Reveal index={position % 2} className="h-full">
                <div className="marketing-lift rounded-tile bg-tint-gray flex h-full flex-col p-5 lg:p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Icon className={ICON_SIZE.nav} aria-hidden />
                    </span>
                    <h3 className="flex-1 text-lg font-semibold">{role}</h3>
                    <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                      {scope}
                    </span>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                  <ul
                    aria-label={`In the ${role.toLowerCase()}’s menu`}
                    className="mt-5 flex flex-wrap gap-2"
                  >
                    {sees.map((item) => (
                      <li
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium"
                      >
                        <SuccessIcon className={cn(ICON_SIZE.inline, 'text-primary')} aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
