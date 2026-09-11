import { redirect } from 'next/navigation';

import { tenantHref } from '@/lib/tenant-server';

/**
 * `/attendance` has no screen of its own.
 *
 * Marking is what people come here to do, every morning, so that is where the
 * sidebar link lands. A landing page listing four links would be a click
 * everybody pays and nobody wants.
 */
export default async function AttendanceIndexPage() {
  redirect(await tenantHref('/attendance/mark/students'));
}
