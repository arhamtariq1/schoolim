import { HOLIDAY_COLOR_KEYS, type Holiday, type HolidayColorKey } from '@ilm/contracts';
import { CalendarIcon, DateRangeIcon, HolidayIcon } from '@ilm/ui/icons';

type HolidayIconComponent = typeof CalendarIcon;

export type HolidayColorTheme = {
  cellBg: string;
  text: string;
  dateBlock: string;
  iconShell: string;
  iconDot: string;
  swatch: string;
};

export const HOLIDAY_COLOR_THEME: Record<HolidayColorKey, HolidayColorTheme> = {
  rose: {
    cellBg: 'bg-danger/15',
    text: 'text-danger',
    dateBlock: 'bg-danger/10 text-danger',
    iconShell: 'bg-danger/10',
    iconDot: 'bg-danger',
    swatch: 'bg-danger',
  },
  amber: {
    cellBg: 'bg-warning/15',
    text: 'text-warning',
    dateBlock: 'bg-warning/10 text-warning',
    iconShell: 'bg-warning/10',
    iconDot: 'bg-warning',
    swatch: 'bg-warning',
  },
  emerald: {
    cellBg: 'bg-success/15',
    text: 'text-success',
    dateBlock: 'bg-success/10 text-success',
    iconShell: 'bg-success/10',
    iconDot: 'bg-success',
    swatch: 'bg-success',
  },
  sky: {
    cellBg: 'bg-info/15',
    text: 'text-info',
    dateBlock: 'bg-info/10 text-info',
    iconShell: 'bg-info/10',
    iconDot: 'bg-info',
    swatch: 'bg-info',
  },
  violet: {
    cellBg: 'bg-primary/15',
    text: 'text-primary',
    dateBlock: 'bg-primary/10 text-primary',
    iconShell: 'bg-primary/10',
    iconDot: 'bg-primary',
    swatch: 'bg-primary',
  },
  teal: {
    cellBg: 'bg-primary/20',
    text: 'text-primary',
    dateBlock: 'bg-primary/15 text-primary',
    iconShell: 'bg-primary/15',
    iconDot: 'bg-primary',
    swatch: 'bg-primary/80',
  },
};

export function holidayColorTheme(entry: Holiday): HolidayColorTheme {
  const raw = entry.colorKey;
  const key =
    typeof raw === 'string' && (HOLIDAY_COLOR_KEYS as readonly string[]).includes(raw)
      ? raw
      : 'rose';
  return HOLIDAY_COLOR_THEME[key as HolidayColorKey];
}

export function holidayTypeIcon(entry: Holiday): HolidayIconComponent {
  if (entry.type === 'HOLIDAY') {
    return HolidayIcon;
  }
  if (entry.type === 'VACATION') {
    return DateRangeIcon;
  }
  return CalendarIcon;
}

/** Default swatch when the user picks a type before choosing a colour. */
export function defaultColorForType(type: Holiday['type']): HolidayColorKey {
  if (type === 'HOLIDAY') {
    return 'rose';
  }
  if (type === 'VACATION') {
    return 'violet';
  }
  return 'emerald';
}
