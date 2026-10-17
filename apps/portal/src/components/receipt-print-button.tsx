'use client';

import { Button } from '@ilm/ui';
import { ICON_SIZE, PrintIcon } from '@ilm/ui/icons';

/** Opens the browser's print dialog for the receipt on screen. */
export function ReceiptPrintButton() {
  return (
    <Button
      type="button"
      onClick={() => {
        window.print();
      }}
    >
      <PrintIcon className={ICON_SIZE.inline} aria-hidden="true" />
      Print receipt
    </Button>
  );
}
