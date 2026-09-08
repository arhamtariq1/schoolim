'use client';

import { createExpenseCategorySchema, ROUTES, type ExpenseCategory } from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  StatusBadge,
  useToast,
  type Column,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

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
  error?: string | undefined;
  canManage: boolean;
}

export function ExpenseCategoriesManager({
  categories,
  error,
  canManage,
}: ExpenseCategoriesManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<ExpenseCategory | undefined>(undefined);
  const [deleting, setDeleting] = useState<ExpenseCategory | undefined>(undefined);
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

  const columns: Column<ExpenseCategory>[] = [
    {
      key: 'name',
      header: 'Category',
      render: (row) => <span className="font-medium text-foreground">{row.name}</span>,
    },
    {
      key: 'expenses',
      header: 'Entries',
      align: 'end',
      render: (row) => (
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {row.expenseCount === 0 ? '—' : row.expenseCount}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? 'On' : 'Off'}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) =>
        !canManage ? null : (
          <div className="flex items-center justify-end gap-1">
            <Button
              tone="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                setEditing(row);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit
            </Button>
            <Button
              tone="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                void toggleActive(row);
              }}
            >
              {row.isActive ? 'Turn off' : 'Turn on'}
            </Button>
            {/* Absent once anything is booked against it — the server refuses,
                and offering a control that always fails is worse than not
                offering it (docs/16 §7). */}
            {row.expenseCount === 0 ? (
              <Button
                tone="ghost"
                size="sm"
                disabled={isBusy}
                aria-label={`Delete ${row.name}`}
                onClick={() => {
                  setDeleting(row);
                }}
              >
                <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
              </Button>
            ) : null}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Expense types</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          How spending is grouped. Once a type has entries against it, it can be turned off but not
          deleted — removing it would take that spending out of totals already reported.
        </p>
      </header>

      {canManage ? (
        <CategoryForm
          key={editing?.id ?? 'create'}
          editing={editing}
          onDone={() => {
            setEditing(undefined);
            router.refresh();
          }}
          onCancelEdit={() => {
            setEditing(undefined);
          }}
        />
      ) : null}

      <DataTable
        rows={categories}
        columns={columns}
        rowKey={(row) => row.id}
        error={error}
        caption="Expense types"
        empty={{
          title: 'No expense types yet',
          description:
            'Add the ones you use — Utilities, Salaries, Maintenance, Transport. Every expense is booked against one.',
        }}
      />

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
    </div>
  );
}

function CategoryForm({
  editing,
  onDone,
  onCancelEdit,
}: {
  editing: ExpenseCategory | undefined;
  onDone: () => void;
  onCancelEdit: () => void;
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
    setName('');
    onDone();
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-foreground">
          {editing === undefined ? 'Add a type' : `Edit ${editing.name}`}
        </h2>
        {editing === undefined ? null : (
          <Button type="button" tone="ghost" size="sm" onClick={onCancelEdit}>
            Cancel
          </Button>
        )}
      </div>

      {formError === undefined ? null : (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </div>
      )}

      {/* Field on one row, action beneath — so a validation message growing the
          cell cannot push the button out of alignment. */}
      <div className="mt-4 max-w-md">
        <Field label="Name" error={fieldErrors['name']} required>
          <Input
            value={name}
            placeholder="Utilities"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="submit" isPending={isPending} size="touch">
          {editing === undefined ? (
            <>
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add type
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  );
}
