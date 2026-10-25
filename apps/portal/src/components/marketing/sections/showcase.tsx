import { cn } from '@ilm/ui';
import Image, { type StaticImageData } from 'next/image';
import type { ComponentType } from 'react';

import officeDesk from '../../../../public/marketing/office-desk.jpg';
import parentPhone from '../../../../public/marketing/parent-phone.jpg';
import teacherLesson from '../../../../public/marketing/teacher-lesson.jpg';

import { CONTAINER, Eyebrow, SECTION_Y } from './shared';

import {
  AttendanceMock,
  FeesMock,
  ParentMock,
  SampleCaption,
} from '@/components/marketing/marketing-mockups';
import { Reveal } from '@/components/marketing/marketing-parts';

interface Card {
  eyebrow: string;
  title: string;
  body: string;
  points: readonly string[];
  photo: StaticImageData;
  alt: string;
  Screen: ComponentType;
  device: 'desktop' | 'phone';
  /** Grid placement: the lead card spans both rows on large screens. */
  place: string;
  /** The floating screen's size; the small cards cap and fade it so it never reaches the text. */
  screenWidth: string;
}

const CARDS: readonly Card[] = [
  {
    eyebrow: 'For the accounts office',
    title: 'Fees that collect themselves',
    body: 'Set your fee heads once. Generate every voucher for the month in one click, print challans for the bank, and see who has paid the moment they pay.',
    points: ['Vouchers in one run', 'Paid, partial, overdue', 'Defaulters by class'],
    photo: officeDesk,
    alt: 'A school administrator working at her desk',
    Screen: FeesMock,
    device: 'desktop',
    place: 'lg:col-span-7 lg:row-span-2',
    screenWidth: 'w-11/12 sm:w-3/5',
  },
  {
    eyebrow: 'For teachers',
    title: 'Attendance in under a minute',
    body: 'Marked on the phone a teacher already owns. The office sees every class as it is taken.',
    points: ['Any phone, on 4G', 'Day or period'],
    photo: teacherLesson,
    alt: 'A teacher taking questions from a class with raised hands',
    Screen: AttendanceMock,
    device: 'desktop',
    place: 'lg:col-span-5',
    screenWidth: 'marketing-peek-fade max-h-52 w-11/12 sm:w-3/4',
  },
  {
    eyebrow: 'For parents',
    title: 'Parents see it the same day',
    body: 'Attendance, results, homework and vouchers reach the parent’s phone the day they happen.',
    points: ['Their own login', 'Results as posted'],
    photo: parentPhone,
    alt: 'A mother and her daughter looking at a phone together',
    Screen: ParentMock,
    device: 'phone',
    place: 'lg:col-span-5',
    screenWidth: 'marketing-peek-fade max-h-56 w-52',
  },
];

/** The product screen floating at the top of a card. Decorative: the card's text says it. */
function FloatingScreen({
  Screen,
  device,
  screenWidth,
}: Pick<Card, 'Screen' | 'device' | 'screenWidth'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'marketing-paper shadow-tile absolute end-4 top-4 overflow-hidden border border-border bg-card sm:end-6 sm:top-6',
        device === 'phone' ? 'rounded-3xl p-2' : 'rounded-2xl',
        screenWidth,
      )}
    >
      {device === 'phone' ? (
        <div className="rounded-2xl bg-background px-4 pt-3 pb-4">
          <span className="mx-auto mb-3 block h-1 w-12 rounded-full bg-border" />
          <Screen />
        </div>
      ) : (
        <div className="marketing-peek">
          <Screen />
        </div>
      )}
    </div>
  );
}

/**
 * Three jobs, as a bento of photographs. Each card is a real scene with the
 * screen that serves it floating above, and its story set at the foot on an
 * ink scrim — so the text always sits on a measured dark ground, never on
 * whatever the photo happens to be doing behind it.
 */
export function Showcase() {
  return (
    <section aria-labelledby="showcase-title">
      <div className={cn(CONTAINER, SECTION_Y)}>
        <Reveal className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow>Inside the product</Eyebrow>
            <h2
              id="showcase-title"
              className="font-display text-display-md mt-4 font-medium text-balance"
            >
              Built for the people who run the school.
            </h2>
          </div>
          <p className="text-lg text-pretty text-muted-foreground lg:col-span-5">
            Every office gets a screen made for its job — and every screen reads from the same
            student record.
          </p>
        </Reveal>

        <ul className="mt-14 grid gap-4 lg:grid-cols-12 lg:grid-rows-2">
          {CARDS.map((card, index) => (
            <li key={card.title} className={card.place}>
              <Reveal
                index={index}
                className="rounded-tile group relative flex h-full min-h-128 overflow-hidden lg:min-h-120"
              >
                <Image
                  src={card.photo}
                  alt={card.alt}
                  placeholder="blur"
                  fill
                  sizes={
                    index === 0
                      ? '(min-width: 1024px) 44rem, 96vw'
                      : '(min-width: 1024px) 32rem, 96vw'
                  }
                  className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                />

                <FloatingScreen
                  Screen={card.Screen}
                  device={card.device}
                  screenWidth={card.screenWidth}
                />

                <div className="marketing-ink relative z-10 mt-auto w-full bg-linear-to-t from-background via-background/90 to-transparent p-6 pt-28 sm:p-8 sm:pt-32">
                  <Eyebrow>{card.eyebrow}</Eyebrow>
                  <h3
                    className={cn(
                      'font-display mt-3 font-medium text-balance text-foreground',
                      index === 0 ? 'text-display-sm' : 'text-2xl',
                    )}
                  >
                    {card.title}
                  </h3>
                  <p className="mt-3 max-w-xl text-pretty text-foreground/85">{card.body}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {card.points.map((point) => (
                      <li
                        key={point}
                        className="rounded-full border border-foreground/20 bg-foreground/10 px-3 py-1 text-xs font-medium text-foreground"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
        <SampleCaption className="mt-6" />
      </div>
    </section>
  );
}
