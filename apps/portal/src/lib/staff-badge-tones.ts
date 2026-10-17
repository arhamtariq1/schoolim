import type { StaffRole } from '@ilm/contracts';
import type { StatusTone } from '@ilm/ui';

/**
 * One colour per staff role and per gender, wherever they are shown — so a
 * teacher is the same colour on the staff list, the salaries page and a profile.
 */
export const STAFF_ROLE_TONE: Readonly<Record<StaffRole, StatusTone>> = {
  ADMIN: 'violet',
  PRINCIPAL: 'indigo',
  OFFICE_STAFF: 'orange',
  TEACHER: 'teal',
  SECURITY_GUARD: 'slate',
  PEON: 'cyan',
  OTHERS: 'neutral',
};

export const GENDER_TONE: Readonly<Record<'MALE' | 'FEMALE' | 'OTHER', StatusTone>> = {
  MALE: 'info',
  FEMALE: 'pink',
  OTHER: 'violet',
};
