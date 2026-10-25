'use client';

import {
  createExpenseCategorySchema,
  ROUTES,
  type ExpenseCategory,
  type ExpenseTotals,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardTable,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  StatusBadge,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ExpenseIcon, ICON_SIZE, MoreIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';

import { ExpenseWorkspaceShell } from '@/components/expense-workspace-shell';
import {
  FEE_LIST_TABLE_CELL,
  afterMenuAction,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';
import { mutate } from '@/lib/mutate';

/**
 * Expense categories — what spending gets grouped into.
 *
 * A category with expenses booked against it **cannot** be deleted, and unlike
 * a fee head that refusal is real rather than a warning. Deleting a fee removes
 * a charge from a student's structure, which can be put back; deleting a
 * category would take real spending out of totals that have already been
 * reported, and nothing can restore that. So Delete is not offered once
 * anything references it — Turn off is.
 */
export interface ExpenseCategoriesManagerProps {
  categories: ExpenseCategory[];
  totals: ExpenseTotals;
  monthTotals: ExpenseTotals;
  lastMonthTotals: ExpenseTotals;
  error?: string | undefined;
  canManage: boolean;
}

export function ExpenseCategoriesManager({
  categories,
  totals,
  monthTotals,
  lastMonthTotals,
  error,
  canManage,
}: ExpenseCategoriesManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<ExpenseCategory | undefined>(undefined);
  const [deleting, setDeleting] = useState<ExpenseCategory | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  async function toggleActive(category: ExpenseCategory) {
    setIsBusy(true);
    const result = await mutate(ROUTES.expenses.category(category.id), 'PATCH', {
      isActive: !category.isActive,
    });
    setIsBusy(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(category.isActive ? `${category.name} turned off` : `${category.name} turned on`);
    router.refresh();
  }

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }
    const result = await mutate(ROUTES.expenses.category(deleting.id), 'DELETE');
    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }
    toast.success(`${deleting.name} deleted`);
    setDeleting(undefined);
    router.refresh();
  }

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(row: ExpenseCategory) {
    setEditing(row);
    setDialogOpen(true);
  }

  const columns = useMemo((): CardTableColumn<ExpenseCategory>[] => {
    return [
      {
        key: 'name',
        label: 'Category',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[40%]',
        headerCell: feeListTableHeader('Category', ExpenseIcon),
        render: (row) => <span className="font-medium text-foreground">{row.name}</span>,
      },
      {
        key: 'expenses',
        label: 'Entries',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[20%]',
        headerCell: feeListTableHeader('Entries'),
        render: (row) => (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">
            {row.expenseCount === 0 ? '—' : row.expenseCount}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[20%]',
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>
            {row.isActive ? 'On' : 'Off'}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        headerCell: feeListTableHeader('Actions'),
        render: (row) =>
          !canManage ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <CategoryRowActions
              row={row}
              isBusy={isBusy}
              onEdit={() => {
                openEdit(row);
              }}
              onToggle={() => {
                void toggleActive(row);
              }}
              onDelete={() => {
                setDeleting(row);
              }}
            />
          ),
      },
    ];
  }, [canManage, isBusy]);

  return (
    <>
      <ExpenseWorkspaceShell
        totals={totals}
        monthTotals={monthTotals}
        lastMonthTotals={lastMonthTotals}
        canManage={canManage}
      >
        <Card className="overflow-hidden rounded-lg shadow-raised">
          {canManage ? (
            <div className="flex justify-end border-b border-border p-4">
              <Button onClick={openCreate}>
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                Add type
              </Button>
            </div>
          ) : null}
          <CardTable
            title="All types"
            surface="embedded"
            showHeader={false}
            caption="Expense types"
            rows={categories}
            columns={columns}
            rowKey={(row) => row.id}
            minWidthClass="min-w-[32rem]"
            error={error}
            empty={{
              title: 'No expense types yet',
              description:
                'Add the ones you use — Utilities, Salaries, Maintenance, Transport. Every expense is booked against one.',
              action: canManage ? (
                <Button onClick={openCreate}>
                  <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                  Add the first type
                </Button>
              ) : undefined,
            }}
          />
        </Card>
      </ExpenseWorkspaceShell>

      {dialogOpen ? (
        <CategoryDialog
          key={editing?.id ?? 'create'}
          editing={editing}
          onClose={() => {
            setDialogOpen(false);
            setEditing(undefined);
          }}
          onSaved={() => {
            setDialogOpen(false);
            setEditing(undefined);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
          }
        }}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Nothing is booked against it, so no spending is affected."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function CategoryRowActions({
  row,
  isBusy,
  onEdit,
  onToggle,
  onDelete,
}: {
  readonly row: ExpenseCategory;
  readonly isBusy: boolean;
  readonly onEdit: () => void;
  readonly onToggle: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button tone="ghost" size="sm" aria-label={`Actions for ${row.name}`} disabled={isBusy}>
          <MoreIcon className={ICON_SIZE.inline} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            afterMenuAction(onEdit);
          }}
        >
          <EditIcon className={ICON_SIZE.inline} aria-hidden />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            afterMenuAction(onToggle);
          }}
        >
          {row.isActive ? 'Turn off' : 'Turn on'}
        </DropdownMenuItem>
        {row.expenseCount === 0 ? (
          <DropdownMenuItem
            destructive
            onSelect={() => {
              afterMenuAction(onDelete);
            }}
          >
            <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CategoryDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: ExpenseCategory | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();

  const [name, setName] = useState(editing?.name ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const parsed = createExpenseCategorySchema.safeParse({ name });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate(ROUTES.expenses.categories, 'POST', parsed.data)
        : await mutate(ROUTES.expenses.category(editing.id), 'PATCH', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(
      editing === undefined ? `${parsed.data.name} added` : `${parsed.data.name} saved`,
    );
    onSaved();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{editing === undefined ? 'Add a type' : `Edit ${editing.name}`}</DialogTitle>
            <DialogDescription>
              Every expense is booked against one of these types so totals group into something
              meaningful.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {formError === undefined ? null : (
              <div
                role="alert"
                className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </div>
            )}
            <Field label="Name" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                placeholder="Utilities"
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {editing === undefined ? 'Add type' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
