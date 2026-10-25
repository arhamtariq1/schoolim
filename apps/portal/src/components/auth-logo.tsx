import { cn } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import Image from 'next/image';
import Link from 'next/link';

import lemmaLogo from '../../public/auth/lemma-logo.png';

export interface AuthLogoProps {
  readonly centered?: boolean;
}

/** Lemma wordmark for auth screens — links to the public home. */
export function AuthLogo({ centered = false }: AuthLogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        'inline-flex shrink-0 items-center rounded-md bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        centered && 'justify-center',
      )}
    >
      <Image
        src={lemmaLogo}
        alt={BRAND.name}
        className={cn(
          'h-10 w-auto max-w-52 object-contain sm:h-11',
          centered ? 'object-center' : 'object-left',
        )}
        priority
      />
    </Link>
  );
}
