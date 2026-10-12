import { Input, InputIconWrap, cn } from '@ilm/ui';
import type { ComponentProps, ComponentType } from 'react';

type InputWithIconProps = ComponentProps<typeof Input> & {
  icon: ComponentType<{ className?: string }>;
};

/** @deprecated Prefer `<Field leadingIcon={…}><Input … /></Field>` from `@ilm/ui`. */
export function InputWithIcon({ icon, className, ...props }: InputWithIconProps) {
  return (
    <InputIconWrap icon={icon as Parameters<typeof InputIconWrap>[0]['icon']}>
      <Input className={cn(className)} {...props} />
    </InputIconWrap>
  );
}
