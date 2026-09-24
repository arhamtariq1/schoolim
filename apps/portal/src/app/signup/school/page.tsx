import { redirect } from 'next/navigation';

/**
 * School details now happen inside the portal at `/profile` after OTP.
 * Anyone who bookmarked this step is sent back to signup (or login if they
 * already finished).
 */
export default function SignupSchoolRedirectPage() {
  redirect('/signup');
}
