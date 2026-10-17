'use client';

import { Input } from '@ilm/ui';
import type { ComponentProps } from 'react';

import { PHONE_MAX_DIGITS, sanitizePhoneInput } from '@/lib/phone-format';

type PhoneInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
};

/** Phone number input: digits only, 13 at most. Pair with `livePhoneError`. */
export function PhoneInput({ value, onValueChange, ...props }: PhoneInputProps) {
  return (
    <Input
      autoComplete="tel"
      placeholder="03XX XXXXXXX"
      {...props}
      type="tel"
      inputMode="numeric"
      maxLength={PHONE_MAX_DIGITS}
      value={value}
      onChange={(event) => {
        onValueChange(sanitizePhoneInput(event.target.value));
      }}
    />
  );
}
