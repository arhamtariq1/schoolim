'use client';

import { Card, CardContent, CardHeader, CardTitle, cn } from '@ilm/ui';
import {
  AccountIcon,
  AttendanceIcon,
  CreateIcon,
  FeesIcon,
  MessagesIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import type { Route } from 'next';
import type { ComponentType } from 'react';

import type {
  DashboardQuickActionConfig,
  DashboardQuickActionIconName,
} from '@/lib/dashboard-quick-actions';

type DashboardQuickActionsGridProps = {
  actions: DashboardQuickActionConfig[];
};

const QUICK_ACTION_ICONS: Record<
  DashboardQuickActionIconName,
  ComponentType<{ className?: string }>
> = {
  CreateIcon,
  AttendanceIcon,
  FeesIcon,
  StudentsIcon,
  AccountIcon,
  MessagesIcon,
};

export function DashboardQuickActionsGrid({ actions }: DashboardQuickActionsGridProps) {
  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="border-0 px-4 pb-0 pt-4 sm:px-6">
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-cols-2 gap-2 px-4 pb-4 pt-3 sm:px-6">
        {actions.map((action) => {
          const Icon = QUICK_ACTION_ICONS[action.icon];
          return (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href as Route}
              className={cn(
                'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-border',
                'bg-card p-3 text-center text-xs font-semibold text-foreground transition-colors',
                'hover:border-primary/30 hover:bg-primary/5',
              )}
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
              </span>
              <span className="leading-snug">{action.label}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
