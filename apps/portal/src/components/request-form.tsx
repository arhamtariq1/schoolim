'use client';

import {
  createRequestSchema,
  REQUEST_CATEGORIES,
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_SUBJECT_MAX,
  REQUEST_TEXT_MAX,
  ROUTES,
  type RequestCategory,
  type RequestDetail,
  type RequestPriority,
} from '@ilm/contracts';
import { Button, Field, Input, SimpleSelect, Textarea, useToast } from '@ilm/ui';
import { SendIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { PicturePicker, sendPictures, type PendingPicture } from '@/components/request-pictures';
import { showFormValidationToast } from '@/lib/form-validation';
import { mutate } from '@/lib/mutate';

/**
 * Raise a request, complaint or concern.
 *
 * One form for everybody who may write to the school: the fields are the same
 * for a parent and a teacher, and the child they may choose from is whatever the
 * server says they may raise one about.
 *
 * The text is saved first, then the pictures are sent one at a time. A picture
 * that fails is named afterwards and the request still stands — nobody retypes
 * a complaint because a photograph was too large.
 */

export function RequestForm({
  onDone,
  onCancel,
}: {
  /** Called with the request once it, and any pictures, have been sent. */
  readonly onDone: (created: RequestDetail) => void;
  readonly onCancel: () => void;
}) {
  const toast = useToast();

  // One key per opening of the form: a double click, or a retry after a dropped
  // connection, is the same request rather than a second one.
  const idempotencyKey = useRef(crypto.randomUUID());

  const [category, setCategory] = useState<RequestCategory | ''>('');
  const [priority, setPriority] = useState<RequestPriority>('NORMAL');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [pictures, setPictures] = useState<readonly PendingPicture[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  useEffect(
    () => () => {
      for (const picture of pictures) {
        URL.revokeObjectURL(picture.previewUrl);
      }
    },
    // Only on leaving the form; pictures removed along the way revoke themselves.
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setErrors({});
    setFormError(undefined);

    const parsed = createRequestSchema.safeParse({
      category: category === '' ? undefined : category,
      priority,
      subject,
      description,
      idempotencyKey: idempotencyKey.current,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        next[field] = field === 'category' ? 'Choose what this is about.' : issue.message;
      }
      setErrors(next);
      showFormValidationToast(toast);
      return;
    }

    setIsPending(true);
    const result = await mutate<RequestDetail>(ROUTES.requests.list, 'POST', parsed.data);
    if (!result.ok) {
      setIsPending(false);
      setErrors(result.fieldErrors);
      setFormError(result.message);
      return;
    }

    const created = result.data;
    const createdEvent = created.events[0];
    const failed =
      createdEvent === undefined || pictures.length === 0
        ? []
        : await sendPictures(created.id, createdEvent.id, pictures);

    if (failed.length === 0) {
      toast.success(`${created.requestNo} sent. The school will contact you.`);
    } else {
      toast.warning(
        `${created.requestNo} sent, but ${failed.join(', ')} could not be attached. You can add it in a reply.`,
      );
    }
    onDone(created);
  }

  return (
    <>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {formError === undefined ? null : (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required error={errors['category']}>
            <SimpleSelect
              value={category}
              placeholder="Choose one"
              options={REQUEST_CATEGORIES.map((value) => ({
                value,
                label: REQUEST_CATEGORY_LABELS[value],
              }))}
              onValueChange={(next) => {
                setCategory(next as RequestCategory);
              }}
            />
          </Field>
          <Field label="Priority" error={errors['priority']}>
            <SimpleSelect
              value={priority}
              options={REQUEST_PRIORITIES.map((value) => ({
                value,
                label: REQUEST_PRIORITY_LABELS[value],
              }))}
              onValueChange={(next) => {
                setPriority(next as RequestPriority);
              }}
            />
          </Field>
        </div>

        <Field label="Subject" required error={errors['subject']}>
          <Input
            value={subject}
            maxLength={REQUEST_SUBJECT_MAX}
            placeholder="A few words on what this is about"
            onChange={(event) => {
              setSubject(event.target.value);
            }}
          />
        </Field>

        <Field
          label="Description"
          required
          error={errors['description']}
          hint={`${String(description.length)}/${String(REQUEST_TEXT_MAX)}`}
        >
          <Textarea
            rows={6}
            value={description}
            maxLength={REQUEST_TEXT_MAX}
            placeholder="Tell us what happened, and what you would like us to do."
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </Field>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Attachments</p>
          <PicturePicker pictures={pictures} onChange={setPictures} disabled={isPending} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          <Button
            type="button"
            tone="ghost"
            disabled={isPending}
            onClick={() => {
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" isPending={isPending}>
            <SendIcon className={ICON_SIZE.inline} aria-hidden />
            Send request
          </Button>
        </div>
      </form>
    </>
  );
}
