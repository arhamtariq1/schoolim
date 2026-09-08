'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * Tabs, for switching a panel in place.
 *
 * Note the boundary: this is for content that genuinely lives on **one** route
 * — a student's Profile / Fees / Attendance panels, where the surrounding page
 * is the same and only the panel changes. Sections that are separate routes
 * (Finance › Expenses vs Expense types) use `<TabLinks>` instead, so each one
 * is linkable, bookmarkable, and fetches only its own data.
 *
 * Getting that the wrong way round is a common and expensive mistake: real tabs
 * over separate screens means one route loads every screen's data.
 */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap',
        'transition-all duration-150',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
  );
}
