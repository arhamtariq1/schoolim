import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ilm/ui';
import { ChevronDownIcon, ICON_SIZE } from '@ilm/ui/icons';

import { Accent, CONTAINER, SECTION_Y, SectionHeading } from './shared';

import { CONTACT, FAQ } from '@/components/marketing/marketing-content';

/** Questions in three topics, each a plain accordion row. */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 bg-muted/50">
      <div className={cn(CONTAINER, SECTION_Y, 'max-w-4xl')}>
        <SectionHeading
          align="center"
          eyebrow="FAQ"
          titleId="faq-title"
          title={
            <>
              Questions, <Accent>answered</Accent>
            </>
          }
          lead={`Something else on your mind? Write to ${CONTACT.email} — a person answers, ${CONTACT.hours}.`}
        />

        <Tabs defaultValue={FAQ[0].id} className="mt-12">
          <TabsList
            aria-label="Question topics"
            className="mx-auto flex h-auto w-fit flex-wrap justify-center rounded-full bg-card p-1"
          >
            {FAQ.map((topic) => (
              <TabsTrigger
                key={topic.id}
                value={topic.id}
                className="min-h-11 rounded-full px-5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {topic.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {FAQ.map((topic) => (
            <TabsContent key={topic.id} value={topic.id} className="mt-8 space-y-3">
              {topic.items.map((item) => (
                <details key={item.q} className="group open:shadow-tile rounded-2xl bg-card px-6">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {item.q}
                    <ChevronDownIcon
                      className={cn(
                        ICON_SIZE.nav,
                        'shrink-0 text-primary transition-transform duration-200 group-open:rotate-180',
                      )}
                      aria-hidden
                    />
                  </summary>
                  <p className="pb-6 text-pretty text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
