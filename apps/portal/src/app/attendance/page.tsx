import { redirect } from 'next/navigation';

/**
 * `/attendance` has no screen of its own.
 *
 * Marking is what people come here to do, every morning, so that is where the
 * sidebar link lands. A landing page listing four links would be a click
 * everybody pays and nobody wants.
 */
export default function AttendanceIndexPage() {
  redirect('/attendance/mark/students');
}
