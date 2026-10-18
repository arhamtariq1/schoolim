'use client';

import { Button } from '@ilm/ui';
import { ExportIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useState } from 'react';

import { ParentVoucherPdfJob } from '@/components/parent-voucher-viewer';

/** The icon button that saves one voucher as a PDF, for a table row. */
export function ParentVoucherDownloadButton({ id, voucherNo }: { readonly id: string; readonly voucherNo: string }) {
  const [saving, setSaving] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="icon"
        tone="outline"
        isPending={saving}
        disabled={saving}
        aria-label={`Download voucher ${voucherNo} as PDF`}
        onClick={() => {
          setSaving(true);
        }}
      >
        <ExportIcon className={ICON_SIZE.inline} aria-hidden />
      </Button>
      {saving ? (
        <ParentVoucherPdfJob
          id={id}
          onDone={() => {
            setSaving(false);
          }}
        />
      ) : null}
    </>
  );
}
