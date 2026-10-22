'use client';

import { ROUTES, type Plan } from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Money,
  StatusBadge,
  showApiErrorToast,
  showNetworkErrorToast,
  useToast,
  type Column,
} from '@ilm/ui';
import { CreateIcon, EditIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PlanFormDialog } from '@/components/plan-form-dialog';

/**
 * Plans: the prices and details schools see on the landing page.
 *
 * Archiving hides a plan everywhere without deleting it, because a subscription
 * sold under it must always be able to point back. Restoring is one click.
 */

const CYCLE_SUFFIX = { MONTHLY: 'month', YEARLY: 'year' } as const;

export function PlansManager({ plans, canWrite }: { plans: Plan[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Plan | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState<Plan | undefined>(undefined);

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setOpen(true);
  }

  async function change(plan: Plan, action: 'archive' | 'restore') {
    try {
      const response = await fetch(
        action === 'archive'
          ? ROUTES.platform.plans.archive(plan.id)
          : ROUTES.platform.plans.restore(plan.id),
        { method: 'POST', credentials: 'include' },
      );
      if (!response.ok) {
        const problem = (await response.json().catch(() => ({}))) as { detail?: string };
        showApiErrorToast(toast, 'Could not update the plan', problem.detail);
        return;
      }
      toast.success(action === 'archive' ? 'Plan archived.' : 'Plan restored.');
      router.refresh();
    } catch {
      showNetworkErrorToast(toast);
    }
  }

  const columns: Column<Plan>[] = [
    {
      key: 'name',
      header: 'Plan',
      render: (plan) => (
        <div>
          <div className="font-medium text-balance">{plan.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{plan.code}</div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (plan) => (
        <span className="whitespace-nowrap">
          <Money valueMinor={plan.priceMinor} withSymbol className="font-medium" />
          <span className="text-xs text-muted-foreground"> / {CYCLE_SUFFIX[plan.billingCycle]}</span>
        </span>
      ),
    },
    {
      key: 'cap',
      header: 'Students',
      hideOnMobile: true,
      render: (plan) =>
        plan.studentCap === null ? (
          <span className="text-muted-foreground">Unlimited</span>
        ) : (
          <span className="tabular-nums">Up to {plan.studentCap.toLocaleString('en-PK')}</span>
        ),
    },
    {
      key: 'visibility',
      header: 'Landing page',
      hideOnMobile: true,
      render: (plan) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge tone={plan.isPublic ? 'success' : 'neutral'}>
            {plan.isPublic ? 'Shown' : 'Hidden'}
          </StatusBadge>
          {plan.isRecommended ? <StatusBadge tone="info">Highlighted</StatusBadge> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (plan) => (
        <StatusBadge tone={plan.archivedAt === null ? 'success' : 'warning'}>
          {plan.archivedAt === null ? 'Active' : 'Archived'}
        </StatusBadge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'end' as const,
            render: (plan: Plan) => (
              <div className="flex justify-end gap-1">
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => {
                    openEdit(plan);
                  }}
                  aria-label={`Edit ${plan.name}`}
                >
                  <EditIcon className="size-4" aria-hidden="true" />
                  Edit
                </Button>
                {plan.archivedAt === null ? (
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => {
                      setArchiving(plan);
                    }}
                    aria-label={`Archive ${plan.name}`}
                  >
                    Archive
                  </Button>
                ) : (
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => {
                      void change(plan, 'restore');
                    }}
                    aria-label={`Restore ${plan.name}`}
                  >
                    Restore
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  const shown = plans.filter((plan) => plan.archivedAt === null && plan.isPublic).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">
            {shown} {shown === 1 ? 'plan' : 'plans'} shown on the landing page
          </p>
        </div>
        {canWrite ? (
          <Button onClick={openCreate}>
            <CreateIcon className="size-4" aria-hidden="true" />
            Add plan
          </Button>
        ) : null}
      </header>

      <DataTable
        rows={plans}
        columns={columns}
        rowKey={(plan) => plan.id}
        caption="Subscription plans"
        empty={{
          title: 'No plans yet',
          description: 'Add a plan to show pricing on the landing page.',
        }}
      />

      <PlanFormDialog open={open} onOpenChange={setOpen} plan={editing} />

      <ConfirmDialog
        open={archiving !== undefined}
        onOpenChange={(next) => {
          if (!next) setArchiving(undefined);
        }}
        title={`Archive ${archiving?.name ?? 'this plan'}?`}
        description="It disappears from the landing page straight away. Nothing is deleted, and you can restore it at any time."
        confirmLabel="Archive"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={async () => {
          if (archiving !== undefined) {
            await change(archiving, 'archive');
          }
        }}
      />
    </div>
  );
}
