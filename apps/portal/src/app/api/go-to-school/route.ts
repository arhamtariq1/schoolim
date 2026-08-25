import { slugSchema } from '@ilm/contracts';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';

/**
 * Send someone to their school's address.
 *
 * This is a convenience for a person who knows their school's short name but
 * typed the apex domain. It is **not** a lookup: nothing is queried, nothing is
 * confirmed, and an unknown slug lands on a host that simply has no school —
 * which is the same answer an attacker would get for any guess.
 *
 * The slug is validated against the shared schema before it reaches a URL, so a
 * crafted value cannot redirect anywhere but a subdomain of our own domain.
 */
export function GET(request: NextRequest): never {
  const raw = request.nextUrl.searchParams.get('slug') ?? '';
  const parsed = slugSchema.safeParse(raw);

  if (!parsed.success) {
    redirect('/login');
  }

  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';
  const { protocol, port } = request.nextUrl;
  const suffix = port === '' ? '' : `:${port}`;

  redirect(`${protocol}//${parsed.data}.${appDomain}${suffix}/login`);
}
