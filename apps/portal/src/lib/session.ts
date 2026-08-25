import { ROUTES, type SessionUser } from '@ilm/contracts';
import { cookies } from 'next/headers';

/**
 * Read the current session on the server.
 *
 * The access token is an httpOnly cookie, so it is only reachable here — never
 * from client JavaScript (docs/11 §8). This forwards it to the API rather than
 * decoding it locally: the API is the one place that decides whether a session
 * is valid, and a second decoder in the frontend is a second thing to get wrong.
 */
export async function getSession(): Promise<SessionUser | undefined> {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');

  if (cookieHeader === '') {
    return undefined;
  }

  const base = process.env['API_URL'] ?? 'http://localhost:4000';

  try {
    const response = await fetch(`${base}${ROUTES.auth.session}`, {
      headers: { cookie: cookieHeader },
      // A session check must never be served from a cache.
      cache: 'no-store',
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { data: SessionUser };
    return body.data;
  } catch {
    // The API being unreachable is not the same as being signed out, but from
    // this page's point of view the safe reading is the same one: no session.
    return undefined;
  }
}
