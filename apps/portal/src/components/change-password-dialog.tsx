'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ilm/ui';
import { ICON_SIZE, LockedIcon } from '@ilm/ui/icons';
import { useState } from 'react';

import { ChangePasswordForm } from '@/components/change-password-form';

export function ChangePasswordDialog({ triggerSize = 'sm' }: { triggerSize?: 'sm' | 'default' }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" tone="outline" size={triggerSize}>
          <LockedIcon className={ICON_SIZE.inline} aria-hidden="true" />
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Use a strong password only you know. You stay signed in on this device.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ChangePasswordForm
            onCancel={() => {
              setOpen(false);
            }}
            onSuccess={() => {
              setOpen(false);
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
