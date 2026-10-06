'use client';

import { cn } from '@ilm/ui';
import { useState } from 'react';

type StudentAdmissionAvatarProps = {
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  className?: string;
};

export function StudentAdmissionAvatar({
  firstName,
  lastName,
  photoUrl,
  className,
}: StudentAdmissionAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const displayName = `${firstName} ${lastName}`.trim();
  const showPhoto = photoUrl !== null && photoUrl !== '' && !imageFailed;

  if (showPhoto) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={40}
        height={40}
        className={cn('size-10 shrink-0 rounded-full object-cover ring-1 ring-border', className)}
        onError={() => {
          setImageFailed(true);
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-border',
        className,
      )}
      title={displayName}
    >
      {avatarLabel(firstName, lastName)}
    </span>
  );
}

function avatarLabel(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (first !== '' && last !== '') {
    return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
  }
  const single = first !== '' ? first : last;
  return single.length <= 2 ? single.toUpperCase() : single.slice(0, 2).toUpperCase();
}
