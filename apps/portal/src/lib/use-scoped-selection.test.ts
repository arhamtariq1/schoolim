import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { selectionScope, useScopedSelection } from './use-scoped-selection';

/**
 * "Select all 152", then the next page, showed nothing ticked: the page
 * remounts on a query-string change and took a useState selection with it.
 */
describe('a list selection across pages', () => {
  it('survives the list remounting under the same filters', () => {
    const first = renderHook(() => useScopedSelection('vouchers-a', 'status=UNPAID'));
    act(() => {
      first.result.current[1](new Set(['v1', 'v2', 'v3']));
    });
    first.unmount();

    // What moving to ?offset=40 does to the component.
    const second = renderHook(() => useScopedSelection('vouchers-a', 'status=UNPAID'));
    expect([...second.result.current[0]]).toEqual(['v1', 'v2', 'v3']);
  });

  it('reads as empty once a filter changes, so hidden rows are never acted on', () => {
    const view = renderHook(({ scope }) => useScopedSelection('vouchers-b', scope), {
      initialProps: { scope: 'classLevelId=1' },
    });
    act(() => {
      view.result.current[1](new Set(['v1']));
    });

    view.rerender({ scope: 'classLevelId=2' });
    expect(view.result.current[0].size).toBe(0);
  });

  it('keeps one list’s selection out of another’s', () => {
    const vouchers = renderHook(() => useScopedSelection('vouchers-c', ''));
    act(() => {
      vouchers.result.current[1](new Set(['v1']));
    });

    const staff = renderHook(() => useScopedSelection('staff-c', ''));
    expect(staff.result.current[0].size).toBe(0);
  });
});

describe('the selection scope', () => {
  it('ignores paging and sort, which do not change which rows match', () => {
    const page1 = selectionScope(new URLSearchParams('status=UNPAID&sort=dueDate'));
    const page3 = selectionScope(new URLSearchParams('offset=40&status=UNPAID&limit=20&order=asc'));
    expect(page3).toBe(page1);
  });

  it('changes with a filter', () => {
    expect(selectionScope(new URLSearchParams('classLevelId=1'))).not.toBe(
      selectionScope(new URLSearchParams('classLevelId=2')),
    );
  });
});
