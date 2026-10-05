import Image from 'next/image';

import authImage from '../../public/auth/auth-image.png';

/** Left-panel image on auth screens — image only, no overlay copy. */
export function AuthSideImage() {
  return (
    <div className="relative h-full w-full bg-muted">
      <Image
        src={authImage}
        alt=""
        fill
        priority
        sizes="50vw"
        className="object-cover object-center"
      />
    </div>
  );
}
