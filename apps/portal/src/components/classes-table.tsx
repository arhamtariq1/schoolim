'use client';

import { SCHOOL_LEVEL_IDS, SCHOOL_LEVEL_LABELS, type ClassLevel, type SchoolLevelId } from '@ilm/contracts';
import {
  Button,
  CardTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  ClassIcon,
  CreateIcon,
  EditIcon,
  MoreIcon,
  SchoolIcon,
  SortIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { useMemo, useState } from 'react';

import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
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

export function ClassesTable(props: ClassesTableProps) {
  const {
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
  } = props;

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
          cmp = sessionStudents(left) - sessionStudents(right);
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

  const columns = useMemo((): CardTableColumn<ClassLevel>[] => {
    return [
      {
        key: 'name',
        label: 'Class name',
        icon: ClassIcon,
        sortable: true,
        width: 'w-[28%]',
        render: (entry) => {
          const meta = classDisplayMeta(entry.name, entry.numericOrder);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${meta.iconToneClass}`}
              >
                {meta.iconCode}
              </span>
              <TwoLineCell
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
          );
        },
      },
      {
        key: 'level',
        label: 'Level / type',
        icon: SchoolIcon,
        sortable: true,
        width: 'w-[18%]',
        render: (entry) => {
          const meta = classDisplayMeta(entry.name, entry.numericOrder);
          return <StatusBadge tone={meta.tone}>{meta.levelLabel}</StatusBadge>;
        },
      },
      {
        key: 'sections',
        label: 'Sections',
        icon: ClassIcon,
        sortable: true,
        align: 'end',
        width: 'w-[12%]',
        render: (entry) => (
          <TwoLineCell
            primary={String(entry.sections.length)}
            secondary={sectionSummary(entry)}
          />
        ),
      },
      {
        key: 'students',
        label: 'Students',
        icon: StudentsIcon,
        sortable: true,
        align: 'end',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (entry) => (
          <TwoLineCell primary={String(sessionStudents(entry))} secondary="This session" />
        ),
      },
      {
        key: 'teacher',
        label: 'Class teacher',
        icon: AccountIcon,
        width: 'w-[18%]',
        hideOnMobile: true,
        render: () => <span className="text-sm text-muted-foreground">—</span>,
      },
      {
        key: 'actions',
        label: 'Actions',
        align: 'end',
        width: 'w-[12%]',
        render: (entry) =>
          canConfigure ? (
            <ClassRowActions
              entry={entry}
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
          ) : (
            <div className="flex justify-end">
              <span className="text-muted-foreground">—</span>
            </div>
          ),
      },
    ];
  }, [
    canConfigure,
    canRenumber,
    onAddSection,
    onEditClass,
    onEditSection,
    onDeleteClass,
    onDeleteSection,
    onRenumberSection,
    renumberingSectionId,
  ]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Classes"
        description={
          <>
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} · {totalSections}{' '}
            {totalSections === 1 ? 'section' : 'sections'} in this session
          </>
        }
      />

      {error !== undefined ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchPlaceholder="Search class or level"
        searchAriaLabel="Search classes"
        filters={
          <>
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
          </>
        }
      />

      <CardTable
        title="All classes"
        caption="Classes"
        rows={rows}
        columns={columns}
        rowKey={(entry) => entry.id}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        sort={{
          key: sortKey,
          direction: sortDir,
          onToggle: (key) => {
            toggleSort(key as ClassSortKey);
          },
        }}
        empty={{
          title: 'No classes yet',
          description:
            'Classes are created from your school profile levels. Update school levels in profile settings if something is missing.',
        }}
        renderMobileRow={(entry) => <ClassMobileRow entry={entry} />}
      />
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

function ClassMobileRow({ entry }: { entry: ClassLevel }) {
  const meta = classDisplayMeta(entry.name, entry.numericOrder);
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${meta.iconToneClass}`}
        >
          {meta.iconCode}
        </span>
        <TwoLineCell
          primary={entry.name}
          secondary={`${meta.levelLabel} · ${String(entry.sections.length)} sections · ${String(sessionStudents(entry))} students`}
        />
      </div>
    </div>
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
    <div className="flex justify-end" data-stop-row-click>
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
