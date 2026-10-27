import {
  AcademicsIcon,
  AdmissionIcon,
  AttendanceIcon,
  CalendarIcon,
  ClassIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  RequestsIcon,
  StudentsIcon,
} from '@ilm/ui/icons';

/** The app's home screen at phone size: the real module names, three to a row. */
const MODULES = [
  { label: 'Admission', Icon: AdmissionIcon },
  { label: 'Students', Icon: StudentsIcon },
  { label: 'Fees', Icon: FeesIcon },
  { label: 'Attendance', Icon: AttendanceIcon },
  { label: 'Marks', Icon: ClassIcon },
  { label: 'Academics', Icon: AcademicsIcon },
  { label: 'Timetables', Icon: CalendarIcon },
  { label: 'Finance', Icon: FinanceIcon },
  { label: 'Requests', Icon: RequestsIcon },
] as const;

export function LaunchpadMini() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {MODULES.map(({ label, Icon }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-1 py-3 text-center"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className={ICON_SIZE.inline} aria-hidden />
          </span>
          <span className="text-xs font-medium">{label}</span>
        </div>
      ))}
    </div>
  );
}
