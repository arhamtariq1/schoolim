'use client';

import { SCHOOL_LEVEL_IDS, SCHOOL_LEVEL_LABELS, type ClassLevel, type SchoolLevelId } from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  NoResultsState,
  SimpleSelect,
  StatusBadge,
} from '@ilm/ui';
import {
  AccountIcon,
  ClassIcon,
  CreateIcon,
  EditIcon,
  MoreIcon,
  SchoolIcon,
  SearchIcon,
  SortIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { useMemo, useState, type ReactNode } from 'react';

import { classDisplayMeta, compareClassesByProgression } from '@/lib/class-level-display';

export type ClassSortKey = 'name' | 'level' | 'sections' | 'students';
export type ClassSortDir = 'asc' | 'desc';

export type ClassesTableProps = {
  classes: ClassLevel[];
  sessions: { id: string; name: string; isCurrent: boolean }[];
  activeSessionId: string | undefined;
  onSessionChange: (sessionId: string) => void;
  error?: string | undefined;
  canConfigure: boolean;
  onAddSection: (entry: ClassLevel) => void;
  onEditClass: (entry: ClassLevel) => void;
  onEditSection: (entry: ClassLevel, sectionId: string) => void;
  onDeleteClass: (entry: ClassLevel) => void;
  onDeleteSection: (entry: ClassLevel, section: { id: string; name: string }) => void;
  canRenumber: boolean;
  onRenumberSection: (entry: ClassLevel, section: { id: string; name: string }) => void;
  renumberingSectionId: string | undefined;
  enabledSchoolLevels: SchoolLevelId[];
};

export function ClassesTable({
  classes,
  sessions,
  activeSessionId,
  onSessionChange,
  error,
  canConfigure,
  onAddSection,
  onEditClass,
  onEditSection,
  onDeleteClass,
  onDeleteSection,
  canRenumber,
  onRenumberSection,
  renumberingSectionId,
  enabledSchoolLevels,
}: ClassesTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [sectionsFilter, setSectionsFilter] = useState('');
  const [sortKey, setSortKey] = useState<ClassSortKey>('name');
  const [sortDir, setSortDir] = useState<ClassSortDir>('asc');

  const isFiltered =
    searchQuery.trim() !== '' || levelFilter !== '' || sectionsFilter !== '';

  const rows = useMemo(() => {
    let list = [...classes];
    const query = searchQuery.trim().toLowerCase();

    if (query !== '') {
      list = list.filter((entry) => {
        const meta = classDisplayMeta(entry.name, entry.numericOrder);
        return (
          entry.name.toLowerCase().includes(query) ||
          meta.levelLabel.toLowerCase().includes(query) ||
          meta.iconCode.toLowerCase().includes(query)
        );
      });
    }

    if (levelFilter !== '') {
      list = list.filter((entry) => {
        const meta = classDisplayMeta(entry.name, entry.numericOrder);
        return meta.levelId === levelFilter;
      });
    }

    if (sectionsFilter === 'with') {
      list = list.filter((entry) => entry.sections.length > 0);
    } else if (sectionsFilter === 'without') {
      list = list.filter((entry) => entry.sections.length === 0);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((left, right) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = compareClassesByProgression(left, right);
          break;
        case 'level': {
          const leftMeta = classDisplayMeta(left.name, left.numericOrder);
          const rightMeta = classDisplayMeta(right.name, right.numericOrder);
          cmp =
            leftMeta.levelLabel.localeCompare(rightMeta.levelLabel) ||
            left.numericOrder - right.numericOrder;
          break;
        }
        case 'sections':
          cmp = left.sections.length - right.sections.length;
          break;
        case 'students': {
          const leftCount = sessionStudents(left);
          const rightCount = sessionStudents(right);
          cmp = leftCount - rightCount;
          break;
        }
        default:
          cmp = 0;
      }
      if (cmp === 0) {
        cmp = compareClassesByProgression(left, right);
      }
      return cmp * dir;
    });

    return list;
  }, [classes, searchQuery, levelFilter, sectionsFilter, sortKey, sortDir]);

  const levelFilterOptions = useMemo(() => {
    const fromProfile = new Set(enabledSchoolLevels);
    const fromClasses = new Set(
      classes.flatMap((entry) => {
        const meta = classDisplayMeta(entry.name, entry.numericOrder);
        return meta.levelId === null ? [] : [meta.levelId];
      }),
    );
    const allowed = enabledSchoolLevels.length > 0 ? fromProfile : fromClasses;
    return SCHOOL_LEVEL_IDS.filter((id) => allowed.has(id)).map((id) => ({
      value: id,
      label: SCHOOL_LEVEL_LABELS[id],
    }));
  }, [enabledSchoolLevels, classes]);

  function toggleSort(nextKey: ClassSortKey): void {
    if (sortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDir('asc');
  }

  function clearFilters(): void {
    setSearchQuery('');
    setLevelFilter('');
    setSectionsFilter('');
  }

  const totalSections = classes.reduce((sum, entry) => sum + entry.sections.length, 0);

  return (
    <div className="w-full space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Classes</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          {classes.length} {classes.length === 1 ? 'class' : 'classes'} · {totalSections}{' '}
          {totalSections === 1 ? 'section' : 'sections'} in this session
        </p>
      </header>

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 w-full lg:max-w-sm">
          <SearchIcon
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search class or level"
            aria-label="Search classes"
            className="h-10 w-full rounded-md border border-border bg-background ps-9 pe-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:shrink-0">
          {levelFilterOptions.length > 0 ? (
            <SimpleSelect
              className="w-full sm:w-44"
              ariaLabel="Filter by level"
              value={levelFilter}
              emptyOption={{ value: '', label: 'Any level' }}
              placeholder="Any level"
              onValueChange={setLevelFilter}
              options={levelFilterOptions}
            />
          ) : null}

          <SimpleSelect
            className="w-full sm:w-44"
            ariaLabel="Filter by sections"
            value={sectionsFilter}
            emptyOption={{ value: '', label: 'All classes' }}
            placeholder="All classes"
            onValueChange={setSectionsFilter}
            options={[
              { value: 'with', label: 'With sections' },
              { value: 'without', label: 'Without sections' },
            ]}
          />

          {sessions.length > 0 ? (
            <SimpleSelect
              className="w-full sm:w-52"
              value={activeSessionId ?? ''}
              onValueChange={onSessionChange}
              options={sessions.map((entry) => ({
                value: entry.id,
                label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
              }))}
              ariaLabel="Session"
            />
          ) : null}
        </div>
      </div>

      <Card className="w-full overflow-hidden rounded-lg shadow-raised">
        <CardHeader className="flex flex-row items-center justify-between gap-2 bg-card px-4 pb-2 pt-4 sm:px-6">
          <CardTitle className="text-base font-semibold text-foreground">All classes</CardTitle>
          {isFiltered ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {classes.length === 0 ? (
            <EmptyState
              title="No classes yet"
              description="Classes are created from your school profile levels. Update school levels in profile settings if something is missing."
              className="border-0 shadow-none"
            />
          ) : rows.length === 0 ? (
            <NoResultsState onClearFilters={clearFilters} className="border-0 shadow-none" />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[48rem] table-fixed border-collapse text-sm">
                  <caption className="sr-only">Classes</caption>
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[18%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[18%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <SortHeader
                        label="Class name"
                        icon={ClassIcon}
                        active={sortKey === 'name'}
                        direction={sortDir}
                        onSort={() => {
                          toggleSort('name');
                        }}
                      />
                      <SortHeader
                        label="Level / type"
                        icon={SchoolIcon}
                        active={sortKey === 'level'}
                        direction={sortDir}
                        onSort={() => {
                          toggleSort('level');
                        }}
                      />
                      <SortHeader
                        label="Sections"
                        icon={ClassIcon}
                        active={sortKey === 'sections'}
                        direction={sortDir}
                        onSort={() => {
                          toggleSort('sections');
                        }}
                        className="text-end"
                      />
                      <SortHeader
                        label="Students"
                        icon={StudentsIcon}
                        active={sortKey === 'students'}
                        direction={sortDir}
                        onSort={() => {
                          toggleSort('students');
                        }}
                        className="text-end"
                      />
                      <th
                        scope="col"
                        className="px-4 py-3 align-middle text-xs font-medium whitespace-nowrap text-muted-foreground"
                      >
                        <span className="inline-flex w-full items-center gap-2">
                          <AccountIcon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
                          <span>Class teacher</span>
                        </span>
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-end align-middle text-xs font-medium text-muted-foreground"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((entry) => (
                      <ClassRow
                        key={entry.id}
                        entry={entry}
                        canConfigure={canConfigure}
                        onAddSection={() => {
                          onAddSection(entry);
                        }}
                        onEditClass={() => {
                          onEditClass(entry);
                        }}
                        onEditSection={(sectionId) => {
                          onEditSection(entry, sectionId);
                        }}
                        onDeleteClass={() => {
                          onDeleteClass(entry);
                        }}
                        onDeleteSection={(section) => {
                          onDeleteSection(entry, section);
                        }}
                        canRenumber={canRenumber}
                        onRenumberSection={(section) => {
                          onRenumberSection(entry, section);
                        }}
                        renumberingSectionId={renumberingSectionId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-border md:hidden">
                {rows.map((entry) => (
                  <ClassMobileRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function sessionStudents(entry: ClassLevel): number {
  return entry.sections.reduce((sum, section) => sum + section.studentCount, 0);
}

function sectionSummary(entry: ClassLevel): string {
  if (entry.sections.length === 0) {
    return 'No sections yet';
  }
  return entry.sections.map((section) => section.name).join(' · ');
}

function ClassRow({
  entry,
  canConfigure,
  onAddSection,
  onEditClass,
  onEditSection,
  onDeleteClass,
  onDeleteSection,
  canRenumber,
  onRenumberSection,
  renumberingSectionId,
}: {
  entry: ClassLevel;
  canConfigure: boolean;
  onAddSection: () => void;
  onEditClass: () => void;
  onEditSection: (sectionId: string) => void;
  onDeleteClass: () => void;
  onDeleteSection: (section: { id: string; name: string }) => void;
  canRenumber: boolean;
  onRenumberSection: (section: { id: string; name: string }) => void;
  renumberingSectionId: string | undefined;
}) {
  const meta = classDisplayMeta(entry.name, entry.numericOrder);
  const students = sessionStudents(entry);

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${meta.iconToneClass}`}
          >
            {meta.iconCode}
          </span>
          <TwoLine
            primary={
              <span className="inline-flex flex-wrap items-center gap-2">
                {entry.name}
                {entry.isActive ? null : (
                  <StatusBadge tone="neutral" size="sm">
                    Off
                  </StatusBadge>
                )}
              </span>
            }
            secondary={meta.ageHint ?? `Order ${String(entry.numericOrder)}`}
          />
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <StatusBadge tone={meta.tone}>{meta.levelLabel}</StatusBadge>
      </td>
      <td className="px-4 py-3 align-middle text-end">
        <TwoLine primary={String(entry.sections.length)} secondary={sectionSummary(entry)} />
      </td>
      <td className="px-4 py-3 align-middle text-end">
        <TwoLine primary={String(students)} secondary="This session" />
      </td>
      <td className="px-4 py-3 align-middle">
        <span className="text-sm text-muted-foreground">—</span>
      </td>
      <td className="px-4 py-3 align-middle">
        {canConfigure ? (
          <ClassRowActions
            entry={entry}
            onAddSection={onAddSection}
            onEditClass={onEditClass}
            onEditSection={onEditSection}
            onDeleteClass={onDeleteClass}
            onDeleteSection={onDeleteSection}
            canRenumber={canRenumber}
            onRenumberSection={onRenumberSection}
            renumberingSectionId={renumberingSectionId}
          />
        ) : (
          <div className="flex justify-end">
            <span className="text-muted-foreground">—</span>
          </div>
        )}
      </td>
    </tr>
  );
}

function ClassMobileRow({ entry }: { entry: ClassLevel }) {
  const meta = classDisplayMeta(entry.name, entry.numericOrder);
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${meta.iconToneClass}`}
        >
          {meta.iconCode}
        </span>
        <TwoLine
          primary={entry.name}
          secondary={`${meta.levelLabel} · ${String(entry.sections.length)} sections · ${String(sessionStudents(entry))} students`}
        />
      </div>
    </li>
  );
}

function ClassRowActions({
  entry,
  onAddSection,
  onEditClass,
  onEditSection,
  onDeleteClass,
  onDeleteSection,
  canRenumber,
  onRenumberSection,
  renumberingSectionId,
}: {
  entry: ClassLevel;
  onAddSection: () => void;
  onEditClass: () => void;
  onEditSection: (sectionId: string) => void;
  onDeleteClass: () => void;
  onDeleteSection: (section: { id: string; name: string }) => void;
  canRenumber: boolean;
  onRenumberSection: (section: { id: string; name: string }) => void;
  renumberingSectionId: string | undefined;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            tone="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${entry.name}`}
          >
            <MoreIcon className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() => {
              onAddSection();
            }}
          >
            <CreateIcon className="size-4" aria-hidden="true" />
            Add section
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onEditClass();
            }}
          >
            <EditIcon className="size-4" aria-hidden="true" />
            Edit class
          </DropdownMenuItem>
          {entry.sections.map((section) => (
            <DropdownMenuItem
              key={section.id}
              onSelect={() => {
                onEditSection(section.id);
              }}
            >
              <EditIcon className="size-4" aria-hidden="true" />
              Edit section {section.name}
            </DropdownMenuItem>
          ))}
          {entry.sections.map((section) =>
            !canRenumber || section.studentCount === 0 ? null : (
              <DropdownMenuItem
                key={`renumber-${section.id}`}
                disabled={renumberingSectionId !== undefined}
                onSelect={() => {
                  onRenumberSection(section);
                }}
              >
                <SortIcon className="size-4" aria-hidden="true" />
                Renumber rolls in {section.name}
              </DropdownMenuItem>
            ),
          )}
          {entry.sections.map((section) =>
            section.studentCount === 0 ? (
              <DropdownMenuItem
                key={`delete-${section.id}`}
                className="text-danger focus:text-danger"
                onSelect={() => {
                  onDeleteSection(section);
                }}
              >
                Delete section {section.name}
              </DropdownMenuItem>
            ) : null,
          )}
          {entry.studentCount === 0 ? (
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={() => {
                onDeleteClass();
              }}
            >
              Delete class
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SortHeader({
  label,
  icon: Icon,
  active,
  direction,
  onSort,
  className,
}: {
  label: string;
  icon: typeof ClassIcon;
  active: boolean;
  direction: ClassSortDir;
  onSort: () => void;
  className?: string;
}) {
  return (
    <th scope="col" className={cn('p-0 align-middle', className)}>
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap text-muted-foreground hover:bg-muted/40',
          className?.includes('text-end') ? 'justify-end' : 'justify-start',
          active ? 'text-foreground' : undefined,
        )}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        <span>{label}</span>
        <SortIcon
          className={cn(
            'size-3.5 shrink-0',
            active ? 'opacity-100' : 'opacity-60',
            active && direction === 'desc' ? 'rotate-180' : undefined,
          )}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

function TwoLine({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-normal text-foreground">{primary}</p>
      <p className="truncate text-xs text-muted-foreground">{secondary}</p>
    </div>
  );
}
