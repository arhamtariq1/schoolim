'use client';

import { StudentsIcon } from '@ilm/ui/icons';

export interface GrNumberRangeFilterProps {
  readonly from: string;
  readonly to: string;
  readonly onFromChange: (value: string) => void;
  readonly onToChange: (value: string) => void;
}

/** Inline GR from–to control for list toolbars (fee increment, etc.). */
export function GrNumberRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: GrNumberRangeFilterProps) {
  return (
    <div
      className="flex h-10 shrink-0 items-stretch rounded-md border border-border bg-background text-sm"
      role="group"
      aria-label="GR number range"
    >
      <span className="flex shrink-0 items-center gap-1.5 border-e border-border px-2.5 text-muted-foreground">
        <StudentsIcon className="size-4 shrink-0" aria-hidden />
        <span className="text-xs font-medium">GR</span>
      </span>
      <input
        type="search"
        value={from}
        onChange={(event) => {
          onFromChange(event.target.value);
        }}
        placeholder="From"
        aria-label="GR number from"
        className="w-16 min-w-0 border-0 bg-transparent px-2 font-mono text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-20"
      />
      <span className="flex items-center px-0.5 text-muted-foreground" aria-hidden>
        –
      </span>
      <input
        type="search"
        value={to}
        onChange={(event) => {
          onToChange(event.target.value);
        }}
        placeholder="To"
        aria-label="GR number to"
        className="w-16 min-w-0 border-0 bg-transparent px-2 font-mono text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-20"
      />
    </div>
  );
}
