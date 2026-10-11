'use client';

import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@ilm/ui';
import { ICON_SIZE, MoreVerticalIcon } from '@ilm/ui/icons';
import type { ReactNode } from 'react';

export interface ListTableRowActionsProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
}

/** Vertical ⋮ menu — same placement as Fee Vouchers row actions. */
export function ListTableRowActions({
  ariaLabel,
  children,
  disabled = false,
}: ListTableRowActionsProps) {
  return (
    <div className="flex justify-start" data-stop-row-click>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            tone="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <MoreVerticalIcon className={ICON_SIZE.inline} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-48"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
