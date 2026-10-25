'use client';

import { type RequestDetail } from '@ilm/contracts';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@ilm/ui';
import { useRouter } from 'next/navigation';

import { RequestForm } from '@/components/request-form';
import type { RequestsParent } from '@/components/requests-view';

/** Raise a request without leaving the list. */
export function NewRequestDialog({
  parent,
  onClose,
}: {
  /** A parent's children, so the form can ask which one this is about. */
  readonly parent?: RequestsParent | undefined;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  function done(created: RequestDetail): void {
    toast.success(`${created.requestNo} sent.`);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New request</DialogTitle>
          <DialogDescription>
            Ask a question, make a complaint or raise a concern. The school will contact you about
            it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <RequestForm
            onDone={done}
            onCancel={onClose}
            kids={parent?.children}
            defaultChildId={parent?.selected?.id}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
