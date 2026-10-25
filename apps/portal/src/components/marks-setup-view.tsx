'use client';

import { ROUTES, type AssessmentTypeItem, type SubjectItem } from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  StatusBadge,
  useToast,
} from '@ilm/ui';
import { CloseIcon, CreateIcon, DeleteIcon, EditIcon, ApproveIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { mutate, mutateOrThrow } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

interface Item {
  readonly id: string;
  readonly name: string;
  readonly usageCount: number;
}

/**
 * Marks › Subjects & assessment types.
 *
 * Both lists are the school's own and are managed the same way, so they are one
 * card used twice. Anybody who can enter marks can keep them up to date; a
 * parent never reaches this page. Deleting is refused by the server while any
 * test uses the entry (that would orphan real results), and the card says
 * "Rename it instead" rather than offering a button that cannot work.
 */
export function MarksSetupView({
  subjects,
  types,
}: {
  readonly subjects: readonly SubjectItem[];
  readonly types: readonly AssessmentTypeItem[];
}) {
  const tenantHref = useTenantHref();

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Subjects & assessment types"
        description="The lists teachers choose from when entering marks."
        actions={
          <Button asChild tone="outline">
            <Link href={tenantHref('/marks')}>Back to marks</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SetupCard
          title="Subjects"
          description="What is taught. Rename freely; a subject with tests cannot be deleted."
          noun="subject"
          items={subjects}
          create={ROUTES.marks.subjects}
          update={ROUTES.marks.subject}
          placeholder="e.g. Art"
        />
        <SetupCard
          title="Assessment types"
          description="The kinds of test you give — class test, monthly test, midterm, exam…"
          noun="assessment type"
          items={types}
          create={ROUTES.marks.assessmentTypes}
          update={ROUTES.marks.assessmentType}
          placeholder="e.g. Midterm"
        />
      </div>
    </div>
  );
}

function SetupCard({
  title,
  description,
  noun,
  items,
  create,
  update,
  placeholder,
}: {
  title: string;
  description: string;
  noun: string;
  items: readonly Item[];
  create: string;
  update: (id: string) => string;
  placeholder: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState<Item | undefined>(undefined);

  async function add(): Promise<void> {
    const name = draft.trim();
    if (name === '') {
      setError(`Type the ${noun}'s name first.`);
      return;
    }
    setIsPending(true);
    const result = await mutate(create, 'POST', { name });
    setIsPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft('');
    setError(undefined);
    toast.success(`${name} added`);
    router.refresh();
  }

  async function rename(item: Item): Promise<void> {
    const name = editName.trim();
    if (name === '' || name === item.name) {
      setEditingId(undefined);
      return;
    }
    setIsPending(true);
    const result = await mutate(update(item.id), 'PATCH', { name });
    setIsPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditingId(undefined);
    setError(undefined);
    toast.success(`Renamed to ${name}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            value={draft}
            placeholder={placeholder}
            aria-label={`New ${noun} name`}
            disabled={isPending}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(undefined);
            }}
          />
          <Button type="submit" isPending={isPending}>
            <CreateIcon className="size-4" aria-hidden="true" />
            Add
          </Button>
        </form>

        {error === undefined ? null : (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            None yet. Add the first {noun} above.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                {editingId === item.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename(item);
                    }}
                  >
                    <Input
                      value={editName}
                      autoFocus
                      aria-label={`Rename ${item.name}`}
                      disabled={isPending}
                      onChange={(event) => {
                        setEditName(event.target.value);
                      }}
                    />
                    <Button type="submit" size="icon" tone="ghost" aria-label="Save name" disabled={isPending}>
                      <ApproveIcon className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      tone="ghost"
                      aria-label="Cancel rename"
                      onClick={() => {
                        setEditingId(undefined);
                      }}
                    >
                      <CloseIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                      <StatusBadge tone="neutral" size="sm" showIcon={false}>
                        {item.usageCount === 0
                          ? 'Not used yet'
                          : `Used in ${String(item.usageCount)} test${item.usageCount === 1 ? '' : 's'}`}
                      </StatusBadge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        tone="ghost"
                        aria-label={`Rename ${item.name}`}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditName(item.name);
                          setError(undefined);
                        }}
                      >
                        <EditIcon className="size-4" aria-hidden="true" />
                      </Button>
                      {item.usageCount === 0 ? (
                        <Button
                          type="button"
                          size="icon"
                          tone="ghost"
                          aria-label={`Delete ${item.name}`}
                          onClick={() => {
                            setDeleting(item);
                          }}
                        >
                          <DeleteIcon className="size-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {deleting === undefined ? null : (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeleting(undefined);
            }
          }}
          title={`Delete ${deleting.name}?`}
          description={`${deleting.name} is not used by any test, so nothing is lost. It will no longer appear in the ${noun} list.`}
          confirmLabel={`Delete ${deleting.name}`}
          onConfirm={async () => {
            await mutateOrThrow(update(deleting.id), 'DELETE');
            toast.success(`${deleting.name} deleted`);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
