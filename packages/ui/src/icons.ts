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
  /** Enrolling a new student — not the generic create (`CreateIcon`) act. */
  UserPlus as AdmissionIcon,
  Users as StudentsIcon,
  Wallet as FeesIcon,
  CalendarCheck as AttendanceIcon,
  BookOpen as AcademicsIcon,
  Banknote as FinanceIcon,
  Coins as SalaryIcon,
  Inbox as RequestsIcon,
  Settings as SettingsIcon,
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ArrowLeft as BackIcon,
  MoreVertical as MoreIcon,
  MoreVertical as MoreVerticalIcon,

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
  LogIn as SignInIcon,
  User as AccountIcon,
  Mail as EmailIcon,
  Phone as PhoneIcon,
  Briefcase as DesignationIcon,
  Globe as WebIcon,
  MapPin as LocationIcon,
  Save as SaveIcon,
  Palette as PaletteIcon,
  Eye as ShowPasswordIcon,
  EyeOff as HidePasswordIcon,
  /** Pause a catalogue row without deleting it (fee heads, etc.). */
  PowerOff as TurnOffIcon,
  Power as TurnOnIcon,

  // --- Academic structure ---------------------------------------------------
  GraduationCap as ClassIcon,
  LayoutGrid as SectionIcon,
  Rows3 as RowsPerPageIcon,
  CalendarRange as SessionIcon,
  CalendarOff as HolidayIcon,
  Receipt as ExpenseIcon,

  // --- Timetable: one icon for a kind of subject, and for a break -------------
  Calculator as SubjectMathIcon,
  FlaskConical as SubjectScienceIcon,
  Monitor as SubjectComputerIcon,
  Languages as SubjectLanguageIcon,
  MoonStar as SubjectIslamicIcon,
  BookMarked as SubjectIcon,
  Coffee as BreakIcon,
  Clock as ClockIcon,
  LayoutList as ListViewIcon,

  // --- Fees -----------------------------------------------------------------
  /** A fee's timeline: what it was, from when. */
  History as HistoryIcon,
  /** Money going back to a family, which is not the same act as an undo. */
  HandCoins as RefundIcon,
  /** Money the school holds but has not earned. */
  ShieldCheck as DepositIcon,
  /** Somebody who has not paid by the day it was due. */
  AlarmClock as OverdueIcon,
  /** Challan page layout (copies per sheet). */
  PanelsTopLeft as PageLayoutIcon,
  /** Names printed on each challan copy. */
  Tags as TagIcon,
  /** What appears on the challan body. */
  ListChecks as ListChecksIcon,
  /** Kuickpay consumer number on a challan. */
  Zap as QuickpayIcon,
  /** 1LINK consumer number on a challan. */
  Link2 as LinkIcon,
  /** Bank / school mark upload. */
  Image as ImageIcon,
  /** Choose or change a profile photo. */
  Camera as CameraIcon,
  /** A document attached to a record, such as a CV. */
  FileText as FileIcon,

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
  /** The option most people pick — a recommended plan. */
  Star as PopularIcon,

  // --- Modules --------------------------------------------------------------
  /** An exam's outcome: marks, grades, the printed result card. */
  Award as ResultIcon,
  /** Work set by a teacher and handed in by a student. */
  ClipboardList as AssignmentIcon,
  /** Something the school owns and tracks — furniture, lab kit, a bus. */
  Boxes as AssetIcon,
  /** The weekly grid of periods, rooms and teachers. */
  CalendarClock as TimetableIcon,
  /** A member of staff as an employee, not as a job title. */
  IdCard as StaffIcon,
  /** The whole platform above any one school. */
  Layers as PlatformIcon,
  /** Who can open what: roles, permissions, a person's access. */
  KeyRound as AccessIcon,
  /** The in-app guide: what the product does and how to use it. */
  BookOpen as GuidanceIcon,
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
