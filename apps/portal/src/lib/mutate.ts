'use client';

import { type FieldError } from '@ilm/contracts';

/**
 * Call a mutating endpoint from the browser, and get back something a form can
 * actually render.
 *
 * Every mutation screen needs the same four outcomes and they are easy to get
 * subtly wrong one screen at a time: the happy path, a *field* error that must
 * land next to the offending input, a *form* error that must appear at the top,
 * and the network being gone. Writing that per form is how one screen ends up
 * swallowing validation messages and showing "something went wrong".
 *
 * Same origin, always — `/api/v1/...` is served by this app's own hostname (see
 * `app/api/v1/[...path]/route.ts`), which is what keeps the session cookie
 * first-party.
 */

export type MutationResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly status: number;
      /** Shown above the form. */
      readonly message: string;
      /** Keyed by field path, e.g. `owner.email`. Shown beside the input. */
      readonly fieldErrors: Record<string, string>;
    };

interface Problem {
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
}

export async function mutate<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<MutationResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Could not reach the server. Your change was not saved.',
      fieldErrors: {},
    };
  }

  const payload = (await response.json().catch(() => ({}))) as Problem & { data?: T };

  if (!response.ok) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of payload.errors ?? []) {
      // The API reports `field` as a path. Keeping it verbatim means a nested
      // field like `guardian.phone` finds its input without any translation.
      fieldErrors[issue.field] = issue.message;
    }

    return {
      ok: false,
      status: response.status,
      // `detail` is written for the person reading it, so it is safe to show.
      // The fallback is deliberately plain rather than technical.
      message:
        payload.detail ??
        (response.status === 403
          ? 'You do not have permission to do this.'
          : 'That did not save. Check the form and try again.'),
      fieldErrors,
    };
  }

  return { ok: true, data: payload.data as T };
}

/**
 * The same call, for a `ConfirmDialog`.
 *
 * `ConfirmDialog` keeps itself open and shows the message when `onConfirm`
 * throws, so a failed action stays visible instead of the dialog closing as if
 * it had worked.
 */
export async function mutateOrThrow<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const result = await mutate<T>(path, method, body);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}
