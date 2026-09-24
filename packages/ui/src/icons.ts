/**
 * The icon vocabulary.
 *
 * docs/16 section 3: `lucide-react` is the only icon library, and **one
 * meaning maps to one icon product-wide**. Feature code imports `EditIcon`,
 * never `Pencil`, so the mapping changes in one place and no screen drifts.
 *
 * Named imports only — `import * as Icons` kills tree-shaking and pulls all
 * 1,500 icons into the bundle.
 *
 * Sizes: `size-4` inline/buttons/rows · `size-5` nav/toolbars · `size-6`
 * headings/dialogs · `size-10` empty states. No other size.
 */
export {
  // --- Actions --------------------------------------------------------------
  Plus as CreateIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  Check as ApproveIcon,
  X as CloseIcon,
  Download as ExportIcon,
  Upload as ImportIcon,
  Printer as PrintIcon,
  Search as SearchIcon,
  Filter as FilterIcon,
  RotateCcw as UndoIcon,
  RefreshCw as RetryIcon,
  Send as SendIcon,
  Copy as CopyIcon,

  // --- Navigation -----------------------------------------------------------
  LayoutDashboard as DashboardIcon,
  Users as StudentsIcon,
  Wallet as FeesIcon,
  CalendarCheck as AttendanceIcon,
  BookOpen as AcademicsIcon,
  Banknote as FinanceIcon,
  Inbox as RequestsIcon,
  Settings as SettingsIcon,
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ArrowLeft as BackIcon,
  MoreHorizontal as MoreIcon,

  // --- Status ---------------------------------------------------------------
  CircleAlert as WarningIcon,
  CircleCheck as SuccessIcon,
  CircleX as ErrorIcon,
  Info as InfoIcon,
  LoaderCircle as SpinnerIcon,
  Lock as LockedIcon,
  TriangleAlert as DangerIcon,
  FileQuestion as EmptyIcon,
  WifiOff as OfflineIcon,

  // --- Account and session --------------------------------------------------
  LogOut as SignOutIcon,
  User as AccountIcon,
  Eye as ShowPasswordIcon,
  EyeOff as HidePasswordIcon,

  // --- Academic structure ---------------------------------------------------
  GraduationCap as ClassIcon,
  LayoutGrid as SectionIcon,
  CalendarRange as SessionIcon,
  CalendarOff as HolidayIcon,
  Receipt as ExpenseIcon,

  // --- Fees -----------------------------------------------------------------
  /** A fee's timeline: what it was, from when. */
  History as HistoryIcon,
  /** Money going back to a family, which is not the same act as an undo. */
  HandCoins as RefundIcon,
  /** Money the school holds but has not earned. */
  PiggyBank as DepositIcon,
  /** Somebody who has not paid by the day it was due. */
  AlarmClock as OverdueIcon,

  // --- Dates ----------------------------------------------------------------
  Calendar as CalendarIcon,
  CalendarDays as DateRangeIcon,

  Bell as NotificationsIcon,
  MessageSquare as MessagesIcon,
  // --- Chrome ---------------------------------------------------------------
  Menu as MenuIcon,
  Command as CommandIcon,
  Sun as LightModeIcon,
  Moon as DarkModeIcon,
  Building2 as SchoolIcon,
  ArrowRight as ForwardIcon,
  ArrowUpDown as SortIcon,
  Eye as ViewIcon,
  TrendingUp as TrendUpIcon,
  TrendingDown as TrendDownIcon,
} from 'lucide-react';

/** The only permitted icon sizes (docs/16 section 3). */
export const ICON_SIZE = {
  /** Inline in text, inside buttons, table row actions. */
  inline: 'size-4',
  /** Sidebar navigation, toolbars, tabs. */
  nav: 'size-5',
  /** Section headings, card headers, dialog titles. */
  heading: 'size-6',
  /** Empty states and onboarding illustrations only. */
  illustration: 'size-10',
} as const;

export type IconSize = keyof typeof ICON_SIZE;
