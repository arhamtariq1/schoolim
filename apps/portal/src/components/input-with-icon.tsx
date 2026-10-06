import { Input, cn } from '@ilm/ui';
import type { ComponentProps, ComponentType } from 'react';

type InputWithIconProps = ComponentProps<typeof Input> & {
  icon: ComponentType<{ className?: string }>;
};

export function InputWithIcon({ icon: Icon, className, ...props }: InputWithIconProps) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input className={cn('ps-9', className)} {...props} />
    </div>
  );
}
