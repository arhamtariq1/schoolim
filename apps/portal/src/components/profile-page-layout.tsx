import type { ReactNode } from 'react';

type ProfilePageLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ProfilePageLayout({ title, description, children }: ProfilePageLayoutProps) {
  return (
    <div className="w-full space-y-5">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{description}</p>
      </div>
      {children}
    </div>
  );
}
