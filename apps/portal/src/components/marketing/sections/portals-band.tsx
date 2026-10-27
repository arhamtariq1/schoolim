import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ilm/ui';
import {
  ApproveIcon,
  AttendanceIcon,
  DashboardIcon,
  ICON_SIZE,
  PlatformIcon,
  RequestsIcon,
  SchoolIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import type { ComponentType, SVGProps } from 'react';

import { Accent, CONTAINER, Eyebrow, SECTION_Y } from './shared';

import { ROLES, type RoleId } from '@/components/marketing/marketing-content';
import { MarketingHub } from '@/components/marketing/marketing-hub';
import {
  AdminPreview,
  OfficePreview,
  ParentPreview,
  PlatformPreview,
  PrincipalPreview,
  SampleCaption,
  TeacherPreview,
} from '@/components/marketing/marketing-mockups';
import { Reveal } from '@/components/marketing/marketing-parts';

const ROLE_PREVIEW: Record<RoleId, ComponentType> = {
  admin: AdminPreview,
  principal: PrincipalPreview,
  teacher: TeacherPreview,
  parent: ParentPreview,
  office: OfficePreview,
  platform: PlatformPreview,
};

const ROLE_ICON: Record<RoleId, ComponentType<SVGProps<SVGSVGElement>>> = {
  admin: DashboardIcon,
  principal: SchoolIcon,
  teacher: AttendanceIcon,
  parent: StudentsIcon,
  office: RequestsIcon,
  platform: PlatformIcon,
};

/** Three plain facts under the lead — what "one record" means to a reader. */
const FACTS = [
  'Everyone signs in to a screen built for their job',
  'Each person sees only what their role allows',
  'Every screen reads from the same school record',
] as const;

/**
 * The portals section, on white: one record in the middle, six portals around
 * it — and then the portals themselves. A column of role cards on the left
 * switches a softly lit stage on the right, where that role's own screen sits.
 *
 * Radix Tabs in vertical orientation: arrow keys move between roles, and with
 * JavaScript off the Admin portal shows.
 */
export function PortalsBand() {
  return (
    <section id="portals" aria-labelledby="portals-title" className="scroll-mt-16">
      <div className={cn(CONTAINER, SECTION_Y)}>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <Reveal className="lg:col-span-6">
            <Eyebrow>Six portals</Eyebrow>
            <h2
              id="portals-title"
              className="font-display text-display-md text-heading mt-4 font-medium text-balance"
            >
              One record. <Accent>A portal for everyone.</Accent>
            </h2>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
              Admin, principal, teachers, parents and office staff each get their own screen — and
              nobody types the same thing twice.
            </p>
            <ul className="mt-8 space-y-3">
              {FACTS.map((fact) => (
                <li key={fact} className="flex items-start gap-3 text-base">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                  </span>
                  {fact}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal index={1} className="hidden md:block lg:col-span-6">
            <div className="rounded-tile relative overflow-hidden border border-border bg-muted p-6 sm:p-10">
              <div aria-hidden className="marketing-grid absolute inset-0" />
              <MarketingHub className="relative mx-auto max-w-md" />
            </div>
          </Reveal>
        </div>

        <Tabs
          defaultValue={ROLES[0].id}
          orientation="vertical"
          className="rounded-tile shadow-tile mt-16 grid gap-3 border border-border bg-card p-3 lg:grid-cols-12"
        >
          <TabsList
            aria-label="Portals"
            className="grid h-auto grid-cols-2 items-stretch gap-2 bg-transparent p-0 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1 lg:content-start"
          >
            {ROLES.map((role) => {
              const Icon = ROLE_ICON[role.id];
              return (
                <TabsTrigger
                  key={role.id}
                  value={role.id}
                  className="group h-auto min-h-11 justify-start gap-4 rounded-xl border border-transparent bg-transparent p-3 text-start whitespace-normal text-foreground hover:bg-muted data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-foreground data-[state=active]:shadow-none lg:p-4"
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-200 group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                    <Icon className={ICON_SIZE.nav} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold lg:text-base">{role.name}</span>
                    <span className="hidden text-sm text-muted-foreground lg:block">
                      {role.tagline}
                    </span>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ROLES.map((role) => {
            const Preview = ROLE_PREVIEW[role.id];
            return (
              <TabsContent
                key={role.id}
                value={role.id}
                data-role-panel
                className="rounded-tile relative mt-0 overflow-hidden border border-border bg-muted lg:col-span-8"
              >
                <div aria-hidden className="marketing-stage-glow absolute inset-0" />
                <div className="relative px-4 pt-8 sm:px-12 sm:pt-12">
                  <Preview />
                </div>
                <div className="relative border-t border-border bg-card p-6 sm:p-8">
                  <p className="text-lg font-bold">{role.tagline}</p>
                  <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">{role.body}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {role.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm font-medium">
                        <ApproveIcon
                          className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                          aria-hidden
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
        <SampleCaption className="mt-6" />
      </div>
    </section>
  );
}
