import {
  AcademicsIcon,
  AccountIcon,
  AdmissionIcon,
  AttendanceIcon,
  ClassIcon,
  CreateIcon,
  DashboardIcon,
  DepositIcon,
  FeesIcon,
  FinanceIcon,
  ForwardIcon,
  HolidayIcon,
  OverdueIcon,
  PrintIcon,
  DesignationIcon,
  RequestsIcon,
  SalaryIcon,
  SchoolIcon,
  SessionIcon,
  SettingsIcon,
  StudentsIcon,
  TrendUpIcon,
} from '@ilm/ui/icons';
import type { ComponentType } from 'react';

/**
 * The icons the sidebar can draw, by name.
 *
 * This map is the reason `nav-icons` exists as a file rather than a line in the
 * shell. The shell used to do `import * as Icons from '@ilm/ui/icons'` and index
 * into it, which works and quietly pulls **every** icon in the vocabulary into
 * the client bundle — the exact thing docs/16 §3 bans, just spelled differently
 * from `import * as Icons from 'lucide-react'`.
 *
 * Naming the icons navigation actually uses keeps the rest out. An icon name
 * with no entry here renders nothing rather than crashing, which is the right
 * failure: a missing glyph beside a working link, not a blank screen.
 */
// Annotated rather than inferred. An inferred type here names a path inside
// another package's node_modules, which tsc rejects as not portable and which
// would break the moment the dependency is hoisted differently.
export const NAV_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  DashboardIcon,
  AdmissionIcon,
  StudentsIcon,
  CreateIcon,
  FeesIcon,
  OverdueIcon,
  TrendUpIcon,
  DepositIcon,
  AttendanceIcon,
  AcademicsIcon,
  ClassIcon,
  SessionIcon,
  HolidayIcon,
  ForwardIcon,
  AccountIcon,
  FinanceIcon,
  SalaryIcon,
  RequestsIcon,
  SettingsIcon,
  SchoolIcon,
  PrintIcon,
  DesignationIcon,
};
