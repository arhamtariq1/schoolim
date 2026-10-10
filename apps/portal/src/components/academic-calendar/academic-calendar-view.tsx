'use client';

import { type AcademicSession, type Holiday } from '@ilm/contracts';
import {
  Button,
  Card,
  cn,
  DataTable,
  DateDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleSelect,
  StatusBadge,
  type Column,
} from '@ilm/ui';
import {
  AcademicsIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  HolidayIcon,
  ICON_SIZE,
  MoreIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { useMemo, useState } from 'react';

import {
  audienceLabel,
  buildMonthGrid,
  calendarStats,
  eventCategory,
  eventCellBackgroundClass,
  eventPillClass,
  formatCompactDate,
  formatEventWhen,
  formatLongDate,
  formatMonthYear,
  formatUpcomingDateBox,
  holidaysOnDay,
  parseYearMonth,
  primaryEventForDay,
  shiftMonth,
  upcomingHolidays,
  eventVisualTheme,
  weekContaining,
  WEEKDAYS,
  type CalendarViewMode,
} from '@/components/academic-calendar/academic-calendar-utils';
import { holidayColorTheme, holidayTypeIcon } from '@/components/academic-calendar/calendar-holiday-colors';

export type AcademicCalendarViewProps = {
  holidays: Holiday[];
  sessions: AcademicSession[];
  activeSessionId: string | undefined;
  activeSession: AcademicSession | undefined;
  today: string;
  error?: string | undefined;
  canConfigure: boolean;
  onSessionChange: (sessionId: string) => void;
  onAddEvent: () => void;
  onEditEvent: (holiday: Holiday) => void;
  onDeleteEvent: (holiday: Holiday) => void;
};

export function AcademicCalendarView({
  holidays,
  sessions,
  activeSessionId,
  activeSession,
  today,
  error,
  canConfigure,
  onSessionChange,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}: AcademicCalendarViewProps) {
  const initial = parseYearMonth(today);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  const stats = useMemo(() => calendarStats(holidays), [holidays]);
  const monthLabel = formatMonthYear(year, month);
  const grid = useMemo(() => buildMonthGrid(year, month), [month, year]);
  const selectedEvents = useMemo(() => holidaysOnDay(holidays, selectedDate), [holidays, selectedDate]);
  const upcoming = useMemo(() => upcomingHolidays(holidays, today), [holidays, today]);
  const weekDays = useMemo(() => weekContaining(selectedDate), [selectedDate]);

  function goToToday(): void {
    const parsed = parseYearMonth(today);
    setYear(parsed.year);
    setMonth(parsed.month);
    setSelectedDate(today);
  }

  function changeMonth(delta: number): void {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  }

  const listColumns: Column<Holiday>[] = [
    {
      key: 'name',
      header: 'Event',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">{audienceLabel(row.appliesTo)}</p>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          <DateDisplay value={row.startDate} />
          {row.startDate === row.endDate ? null : (
            <>
              {' — '}
              <DateDisplay value={row.endDate} />
            </>
          )}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Category',
      render: (row) => {
        const category = eventCategory(row);
        return <StatusBadge tone={category.tone}>{category.label}</StatusBadge>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) => eventActions(row, canConfigure, onEditEvent, onDeleteEvent),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Academic Calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Manage school events, holidays and important academic dates.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Events"
          value={stats.total}
          icon={CalendarIcon}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatTile
          label="Holidays"
          value={stats.holidays}
          icon={HolidayIcon}
          iconClassName="bg-warning/15 text-warning"
        />
        <StatTile
          label="Exams"
          value={stats.exams}
          icon={AcademicsIcon}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatTile
          label="Other Events"
          value={stats.other}
          icon={StudentsIcon}
          iconClassName="bg-info/10 text-info"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {sessions.length > 0 ? (
          <div className="w-full sm:max-w-xs">
            <SimpleSelect
              value={activeSessionId ?? ''}
              onValueChange={onSessionChange}
              options={sessions.map((entry) => ({
                value: entry.id,
                label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
              }))}
              ariaLabel="Academic session"
            />
          </div>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              tone="outline"
              size="sm"
              aria-label="Previous month"
              onClick={() => {
                changeMonth(-1);
              }}
            >
              <ChevronLeftIcon className={ICON_SIZE.inline} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              tone="outline"
              size="sm"
              aria-label="Next month"
              onClick={() => {
                changeMonth(1);
              }}
            >
              <ChevronRightIcon className={ICON_SIZE.inline} aria-hidden="true" />
            </Button>
            <Button type="button" tone="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
          {canConfigure && sessions.length > 0 ? (
            <Button onClick={onAddEvent}>
              <CreateIcon className={ICON_SIZE.inline} aria-hidden="true" />
              Add Event
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <Card className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                tone="ghost"
                size="sm"
                aria-label="Previous month"
                onClick={() => {
                  changeMonth(-1);
                }}
              >
                <ChevronLeftIcon className={ICON_SIZE.inline} aria-hidden="true" />
              </Button>
              <p className="min-w-36 text-center text-sm font-semibold text-foreground">{monthLabel}</p>
              <Button
                type="button"
                tone="ghost"
                size="sm"
                aria-label="Next month"
                onClick={() => {
                  changeMonth(1);
                }}
              >
                <ChevronRightIcon className={ICON_SIZE.inline} aria-hidden="true" />
              </Button>
            </div>
            <ViewModeSwitch value={viewMode} onChange={setViewMode} />
          </div>

          {error === undefined ? null : (
            <div
              role="alert"
              className="mx-4 mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:mx-5"
            >
              {error}
            </div>
          )}

          {viewMode === 'month' ? (
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-7 border-b border-border pb-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="py-1.5">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid auto-rows-fr grid-cols-7 border-l border-t border-border">
                {grid.map((cell) => {
                  const dayEvents = holidaysOnDay(holidays, cell.iso);
                  const primary = primaryEventForDay(cell.iso, holidays);
                  const isSelected = cell.iso === selectedDate;
                  const isToday = cell.iso === today;
                  const hasEvent = primary !== undefined;

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(cell.iso);
                        const parsed = parseYearMonth(cell.iso);
                        setYear(parsed.year);
                        setMonth(parsed.month);
                      }}
                      className={cn(
                        'flex min-h-24 flex-col border-b border-r border-border p-2 text-left transition-colors sm:min-h-28',
                        !hasEvent && !cell.inCurrentMonth && 'bg-muted/20',
                        !hasEvent && cell.inCurrentMonth && 'bg-card hover:bg-muted/25',
                        hasEvent && eventCellBackgroundClass(primary),
                        hasEvent && 'hover:brightness-[0.98]',
                        !cell.inCurrentMonth && hasEvent && 'opacity-75',
                        isSelected && 'z-[1] ring-2 ring-inset ring-primary/55',
                        !isSelected && isToday && !hasEvent && 'bg-primary/5',
                        !isSelected && isToday && hasEvent && 'ring-1 ring-inset ring-primary/35',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
                          !cell.inCurrentMonth && 'text-muted-foreground',
                          isToday && 'bg-primary font-semibold text-primary-foreground shadow-sm',
                          cell.inCurrentMonth && !isToday && 'font-medium text-foreground',
                        )}
                      >
                        {cell.day}
                      </span>
                      <div className="mt-auto space-y-1 pt-2">
                        {dayEvents.slice(0, 2).map((entry) => {
                          const EventIcon = holidayTypeIcon(entry);
                          const colors = holidayColorTheme(entry);
                          return (
                            <span
                              key={entry.id}
                              className={cn(
                                'flex items-center gap-1 truncate text-xs font-semibold leading-tight',
                                colors.text,
                              )}
                            >
                              <EventIcon className="size-3.5 shrink-0 opacity-90" aria-hidden="true" />
                              <span className="truncate">{entry.name}</span>
                            </span>
                          );
                        })}
                        {dayEvents.length > 2 ? (
                          <span className="block text-[10px] text-muted-foreground">
                            +{dayEvents.length - 2} more
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {viewMode === 'week' ? (
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((iso) => {
                  const entries = holidaysOnDay(holidays, iso);
                  const isSelected = iso === selectedDate;
                  const isToday = iso === today;
                  const { month: monthShort, day } = formatUpcomingDateBox(iso);

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(iso);
                      }}
                      className={cn(
                        'flex min-h-40 flex-col rounded-lg border border-border p-2 text-left',
                        isSelected && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20',
                        isToday && !isSelected && 'border-primary/25',
                      )}
                    >
                      <span className="text-[10px] font-medium uppercase text-muted-foreground">
                        {monthShort}
                      </span>
                      <span className="text-lg font-semibold tabular-nums text-foreground">{day}</span>
                      <div className="mt-2 flex-1 space-y-1 overflow-hidden">
                        {entries.map((entry) => {
                          const EventIcon = holidayTypeIcon(entry);
                          const colors = holidayColorTheme(entry);
                          return (
                            <span
                              key={entry.id}
                              className={cn(
                                'flex items-center gap-1 truncate rounded px-1 py-0.5 text-xs font-semibold',
                                colors.text,
                                colors.cellBg,
                              )}
                            >
                              <EventIcon className="size-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{entry.name}</span>
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {viewMode === 'list' ? (
            <div className="p-4 sm:p-5">
              <DataTable
                rows={holidays}
                columns={listColumns}
                rowKey={(row) => row.id}
                caption={`Events for ${activeSession?.name ?? 'this session'}`}
                empty={{
                  title: 'Nothing in the calendar yet',
                  description:
                    'Add public holidays, vacations and school events. Attendance will treat closed days correctly.',
                  action: canConfigure ? (
                    <Button onClick={onAddEvent}>
                      <CreateIcon className={ICON_SIZE.inline} aria-hidden="true" />
                      Add the first event
                    </Button>
                  ) : undefined,
                }}
              />
            </div>
          ) : null}
        </Card>

        <aside>
          <Card className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Events on {formatLongDate(selectedDate)}
                </h2>
                <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  {selectedEvents.length === 1
                    ? '1 event'
                    : `${String(selectedEvents.length)} events`}
                </span>
              </div>
            </div>
            <div className="space-y-3 px-3 pb-4 sm:px-4">
              {selectedEvents.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No events on this day.</p>
              ) : (
                selectedEvents.map((entry) => (
                  <SelectedDayEventCard
                    key={entry.id}
                    entry={entry}
                    displayDate={selectedDate}
                    canConfigure={canConfigure}
                    onEdit={onEditEvent}
                    onDelete={onDeleteEvent}
                  />
                ))
              )}
            </div>

            <div className="border-t border-border">
              <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-foreground">Upcoming events</h2>
                {holidays.length > 0 ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      setViewMode('list');
                    }}
                  >
                    View all
                  </button>
                ) : null}
              </div>
              <ul className="divide-y divide-border">
                {upcoming.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
                    No upcoming events.
                  </li>
                ) : (
                  upcoming.map((entry) => (
                    <UpcomingEventItem
                      key={entry.id}
                      entry={entry}
                      canConfigure={canConfigure}
                      onEdit={onEditEvent}
                      onDelete={onDeleteEvent}
                    />
                  ))
                )}
              </ul>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: number;
  icon: typeof CalendarIcon;
  iconClassName: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconClassName)}>
        <Icon className={ICON_SIZE.nav} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

function SelectedDayEventCard({
  entry,
  displayDate,
  canConfigure,
  onEdit,
  onDelete,
}: {
  entry: Holiday;
  displayDate: string;
  canConfigure: boolean;
  onEdit: (holiday: Holiday) => void;
  onDelete: (holiday: Holiday) => void;
}) {
  const theme = eventVisualTheme(entry);
  const whenLabel =
    entry.startDate === entry.endDate
      ? formatCompactDate(displayDate)
      : formatEventWhen(entry);

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          theme.iconShellClass,
        )}
        aria-hidden="true"
      >
        <span className={cn('size-2.5 rounded-full', theme.iconDotClass)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{audienceLabel(entry.appliesTo)}</p>
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <span className="truncate">{whenLabel}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge tone={theme.tone}>{theme.label}</StatusBadge>
        {eventActions(entry, canConfigure, onEdit, onDelete)}
      </div>
    </div>
  );
}

function UpcomingEventItem({
  entry,
  canConfigure,
  onEdit,
  onDelete,
}: {
  entry: Holiday;
  canConfigure: boolean;
  onEdit: (holiday: Holiday) => void;
  onDelete: (holiday: Holiday) => void;
}) {
  const { month: monthShort, day } = formatUpcomingDateBox(entry.startDate);
  const theme = eventVisualTheme(entry);

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div
        className={cn('flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5', theme.dateBlockClass)}
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold uppercase opacity-90">{monthShort}</span>
        <span className="text-base font-bold tabular-nums leading-tight">{day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{audienceLabel(entry.appliesTo)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <StatusBadge tone={theme.tone}>{theme.label}</StatusBadge>
        {canConfigure ? eventActions(entry, canConfigure, onEdit, onDelete) : null}
      </div>
    </li>
  );
}

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}) {
  const modes: { id: CalendarViewMode; label: string }[] = [
    { id: 'month', label: 'Month' },
    { id: 'week', label: 'Week' },
    { id: 'list', label: 'List' },
  ];

  return (
    <div
      className="inline-flex rounded-full border border-border bg-muted/50 p-0.5"
      role="group"
      aria-label="Calendar view"
    >
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          aria-pressed={value === mode.id}
          onClick={() => {
            onChange(mode.id);
          }}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
            value === mode.id
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function eventActions(
  row: Holiday,
  canConfigure: boolean,
  onEdit: (holiday: Holiday) => void,
  onDelete: (holiday: Holiday) => void,
) {
  if (!canConfigure) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" tone="ghost" size="sm" aria-label={`Actions for ${row.name}`}>
          <MoreIcon className={ICON_SIZE.inline} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem
          onSelect={() => {
            onEdit(row);
          }}
        >
          <EditIcon className={`${ICON_SIZE.inline} mr-2`} aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-danger focus:text-danger"
          onSelect={() => {
            onDelete(row);
          }}
        >
          <DeleteIcon className={`${ICON_SIZE.inline} mr-2`} aria-hidden="true" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
