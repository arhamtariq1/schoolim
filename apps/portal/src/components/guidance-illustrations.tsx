import { cn } from '@ilm/ui';
import type { ReactNode } from 'react';

import type { GuidanceIllustration as IllustrationKey } from '@/lib/guidance-content';

/**
 * The pictures on `/guidance`: simplified drawings of each screen.
 *
 * Inline SVG rather than screenshots, on purpose. A screenshot is a raster in
 * one theme, one brand colour and one release; these are painted with the
 * semantic tokens (`fill-card`, `fill-primary`, `stroke-border`), so they follow
 * light and dark mode and the school's own brand colour, and never go stale
 * when a screen gains a column. They are decorative — the text beside each one
 * carries the meaning — so they are hidden from assistive technology.
 */

const VIEW_W = 320;
const VIEW_H = 180;

/** One rounded block. Every shape in these drawings is one of these. */
function Block({
  x,
  y,
  w,
  h,
  r = 3,
  className,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r?: number;
  readonly className: string;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={r} className={className} />;
}

/** A line of text, drawn as a pill. */
function TextLine({
  x,
  y,
  w,
  strong = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly strong?: boolean;
}) {
  return (
    <Block
      x={x}
      y={y}
      w={w}
      h={strong ? 6 : 4}
      r={2}
      className={strong ? 'fill-foreground/70' : 'fill-muted-foreground/40'}
    />
  );
}

/** The app window: title bar, a narrow sidebar and the content area. */
function AppFrame({
  children,
  sidebar = true,
}: {
  readonly children: ReactNode;
  readonly sidebar?: boolean;
}) {
  return (
    <>
      <Block x={1} y={1} w={VIEW_W - 2} h={VIEW_H - 2} r={10} className="fill-card stroke-border" />
      <Block x={1} y={1} w={VIEW_W - 2} h={18} r={10} className="fill-muted" />
      <rect x={1} y={12} width={VIEW_W - 2} height={7} className="fill-muted" />
      <circle cx={12} cy={10} r={2.5} className="fill-danger/60" />
      <circle cx={20} cy={10} r={2.5} className="fill-warning/60" />
      <circle cx={28} cy={10} r={2.5} className="fill-success/60" />
      {sidebar ? (
        <>
          <rect x={1} y={19} width={52} height={VIEW_H - 20} className="fill-sidebar" />
          <Block x={9} y={28} w={36} h={8} className="fill-primary/80" />
          {[44, 56, 68, 80, 92].map((y) => (
            <Block key={y} x={9} y={y} w={30} h={5} r={2} className="fill-muted-foreground/30" />
          ))}
        </>
      ) : null}
      {children}
    </>
  );
}

/** A stat tile: a label and a figure. */
function StatTile({
  x,
  y,
  accent,
}: {
  readonly x: number;
  readonly y: number;
  readonly accent: string;
}) {
  return (
    <>
      <Block x={x} y={y} w={74} h={38} r={6} className="fill-background stroke-border" />
      <TextLine x={x + 8} y={y + 9} w={34} />
      <Block x={x + 8} y={y + 20} w={44} h={9} r={2} className={accent} />
    </>
  );
}

/** A table row: a checkbox, a name and a status pill. */
function TableRow({
  x,
  y,
  w,
  tone,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly tone: string;
}) {
  return (
    <>
      <rect x={x} y={y + 15} width={w} height={1} className="fill-border" />
      <Block x={x + 4} y={y + 4} w={7} h={7} r={2} className="fill-background stroke-border" />
      <circle cx={x + 22} cy={y + 7.5} r={4} className="fill-primary/20" />
      <TextLine x={x + 30} y={y + 5} w={52} />
      <TextLine x={x + 100} y={y + 5} w={30} />
      <Block x={x + w - 40} y={y + 3} w={34} h={9} r={4.5} className={tone} />
    </>
  );
}

function Overview() {
  // Each tile is one area of the product, arranged around the school.
  const tiles: readonly { x: number; y: number; tone: string }[] = [
    { x: 24, y: 28, tone: 'fill-primary/15' },
    { x: 24, y: 76, tone: 'fill-success/15' },
    { x: 24, y: 124, tone: 'fill-warning/15' },
    { x: 236, y: 28, tone: 'fill-info/15' },
    { x: 236, y: 76, tone: 'fill-violet/15' },
    { x: 236, y: 124, tone: 'fill-teal/15' },
  ];
  return (
    <>
      <Block
        x={1}
        y={1}
        w={VIEW_W - 2}
        h={VIEW_H - 2}
        r={10}
        className="fill-muted/40 stroke-border"
      />
      {tiles.map((tile) => (
        <g key={`${tile.x}-${tile.y}`}>
          <line
            x1={tile.x < 160 ? tile.x + 60 : tile.x}
            y1={tile.y + 14}
            x2={160}
            y2={90}
            className="stroke-border"
            strokeDasharray="3 3"
          />
          <Block
            x={tile.x}
            y={tile.y}
            w={60}
            h={28}
            r={6}
            className={cn(tile.tone, 'stroke-border')}
          />
          <TextLine x={tile.x + 8} y={tile.y + 8} w={30} strong />
          <TextLine x={tile.x + 8} y={tile.y + 18} w={40} />
        </g>
      ))}
      <circle cx={160} cy={90} r={36} className="fill-card stroke-border" />
      <circle cx={160} cy={90} r={26} className="fill-primary/15" />
      {/* A school building: roof, body and door. */}
      <path d="M144 88 L160 76 L176 88 Z" className="fill-primary" />
      <Block x={147} y={88} w={26} h={16} r={1} className="fill-primary/70" />
      <Block x={157} y={95} w={6} h={9} r={1} className="fill-card" />
    </>
  );
}

function Dashboard() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={70} strong />
      <StatTile x={64} y={42} accent="fill-primary/70" />
      <StatTile x={144} y={42} accent="fill-success/70" />
      <StatTile x={224} y={42} accent="fill-warning/70" />
      <Block x={64} y={88} w={154} h={82} r={6} className="fill-background stroke-border" />
      {[20, 34, 26, 48, 40, 56, 44, 62].map((h, index) => (
        <Block
          key={index}
          x={74 + index * 17}
          y={162 - h}
          w={10}
          h={h}
          r={2}
          className="fill-primary/60"
        />
      ))}
      <Block x={224} y={88} w={86} h={82} r={6} className="fill-background stroke-border" />
      {[98, 116, 134, 152].map((y) => (
        <g key={y}>
          <Block x={232} y={y} w={10} h={10} r={3} className="fill-primary/20" />
          <TextLine x={248} y={y + 3} w={50} />
        </g>
      ))}
    </AppFrame>
  );
}

function Students() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={60} strong />
      <Block x={250} y={25} w={60} h={12} r={4} className="fill-primary" />
      <Block x={64} y={44} w={110} h={12} r={4} className="fill-background stroke-border" />
      <Block x={180} y={44} w={50} h={12} r={4} className="fill-background stroke-border" />
      <Block x={64} y={62} w={246} h={108} r={6} className="fill-background stroke-border" />
      <Block x={64} y={62} w={246} h={14} r={6} className="fill-muted" />
      {[78, 96, 114, 132, 150].map((y, index) => (
        <TableRow
          key={y}
          x={68}
          y={y}
          w={238}
          tone={index === 2 ? 'fill-warning/30' : 'fill-success/30'}
        />
      ))}
    </AppFrame>
  );
}

function Academics() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={70} strong />
      {/* A week of timetable periods. */}
      {[0, 1, 2, 3, 4].map((day) =>
        [0, 1, 2, 3].map((period) => {
          const tones = ['fill-primary/25', 'fill-info/25', 'fill-success/25', 'fill-violet/25'];
          return (
            <Block
              key={`${day}-${period}`}
              x={64 + day * 50}
              y={44 + period * 32}
              w={44}
              h={26}
              r={4}
              className={cn(tones[(day + period) % tones.length], 'stroke-border')}
            />
          );
        }),
      )}
      <Block x={164} y={108} w={44} h={26} r={4} className="fill-muted stroke-border" />
      <TextLine x={172} y={119} w={28} />
    </AppFrame>
  );
}

function Attendance() {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={80} strong />
      <Block x={64} y={42} w={246} h={128} r={6} className="fill-background stroke-border" />
      {rows.map((row) => {
        const y = 50 + row * 20;
        const absent = row === 2;
        const leave = row === 4;
        return (
          <g key={row}>
            <circle cx={78} cy={y + 6} r={5} className="fill-primary/20" />
            <TextLine x={90} y={y + 4} w={70} />
            <Block
              x={204}
              y={y}
              w={30}
              h={12}
              r={4}
              className={absent || leave ? 'fill-muted' : 'fill-success/70'}
            />
            <Block
              x={238}
              y={y}
              w={30}
              h={12}
              r={4}
              className={absent ? 'fill-danger/70' : 'fill-muted'}
            />
            <Block
              x={272}
              y={y}
              w={30}
              h={12}
              r={4}
              className={leave ? 'fill-warning/70' : 'fill-muted'}
            />
          </g>
        );
      })}
    </AppFrame>
  );
}

function Fees() {
  return (
    <AppFrame sidebar={false}>
      {/* A printed voucher: header, line items, total and a bank copy. */}
      {[16, 112, 208].map((x, index) => (
        <g key={x}>
          <Block x={x} y={30} w={90} h={138} r={6} className="fill-background stroke-border" />
          <Block x={x + 8} y={38} w={14} h={14} r={3} className="fill-primary/70" />
          <TextLine x={x + 28} y={41} w={46} strong />
          <TextLine x={x + 8} y={60} w={74} />
          {[74, 86, 98, 110].map((y) => (
            <g key={y}>
              <TextLine x={x + 8} y={y} w={40} />
              <TextLine x={x + 62} y={y} w={20} />
            </g>
          ))}
          <rect x={x + 8} y={122} width={74} height={1} className="fill-border" />
          <TextLine x={x + 8} y={130} w={30} strong />
          <TextLine x={x + 56} y={130} w={26} strong />
          <Block
            x={x + 8}
            y={146}
            w={74}
            h={12}
            r={4}
            className={index === 0 ? 'fill-success/30' : 'fill-muted'}
          />
        </g>
      ))}
    </AppFrame>
  );
}

function FeeSettings() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={70} strong />
      {[44, 76, 108, 140].map((y, index) => (
        <g key={y}>
          <Block x={64} y={y} w={246} h={26} r={6} className="fill-background stroke-border" />
          <Block x={72} y={y + 7} w={12} h={12} r={3} className="fill-primary/25" />
          <TextLine x={92} y={y + 8} w={70} strong />
          <TextLine x={92} y={y + 17} w={50} />
          <Block x={256} y={y + 7} w={46} h={12} r={4} className="fill-muted stroke-border" />
          {index === 3 ? (
            <>
              <Block x={226} y={y + 8} w={20} h={10} r={5} className="fill-primary" />
              <circle cx={241} cy={y + 13} r={3.5} className="fill-card" />
            </>
          ) : null}
        </g>
      ))}
    </AppFrame>
  );
}

function Marks() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={70} strong />
      {[64, 126, 188, 250].map((x) => (
        <Block key={x} x={x} y={42} w={56} h={12} r={4} className="fill-background stroke-border" />
      ))}
      <Block x={64} y={62} w={246} h={108} r={6} className="fill-background stroke-border" />
      {[70, 90, 110, 130, 150].map((y, index) => (
        <g key={y}>
          <circle cx={78} cy={y + 7} r={5} className="fill-primary/20" />
          <TextLine x={90} y={y + 5} w={80} />
          <Block
            x={236}
            y={y + 1}
            w={36}
            h={13}
            r={3}
            className={index === 1 ? 'fill-card stroke-primary' : 'fill-muted stroke-border'}
          />
          <TextLine x={280} y={y + 5} w={18} />
        </g>
      ))}
    </AppFrame>
  );
}

function Staff() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={60} strong />
      {[0, 1, 2].map((col) =>
        [0, 1].map((row) => {
          const x = 64 + col * 84;
          const y = 42 + row * 66;
          return (
            <g key={`${col}-${row}`}>
              <Block x={x} y={y} w={78} h={60} r={6} className="fill-background stroke-border" />
              <circle cx={x + 39} cy={y + 18} r={10} className="fill-primary/20" />
              <TextLine x={x + 16} y={y + 34} w={46} strong />
              <Block x={x + 20} y={y + 45} w={38} h={8} r={4} className="fill-success/30" />
            </g>
          );
        }),
      )}
    </AppFrame>
  );
}

function Finance() {
  // Six months of [revenue, expense] bar heights.
  const months: readonly (readonly [number, number])[] = [
    [40, 28],
    [52, 30],
    [46, 36],
    [64, 32],
    [58, 40],
    [72, 38],
  ];
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={60} strong />
      <StatTile x={64} y={42} accent="fill-success/70" />
      <StatTile x={144} y={42} accent="fill-danger/60" />
      <StatTile x={224} y={42} accent="fill-primary/70" />
      <Block x={64} y={88} w={246} h={82} r={6} className="fill-background stroke-border" />
      {months.map(([revenue, expense], index) => (
        <g key={index}>
          <Block
            x={80 + index * 38}
            y={162 - revenue}
            w={12}
            h={revenue}
            r={2}
            className="fill-success/60"
          />
          <Block
            x={94 + index * 38}
            y={162 - expense}
            w={12}
            h={expense}
            r={2}
            className="fill-danger/50"
          />
        </g>
      ))}
    </AppFrame>
  );
}

function Requests() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={60} strong />
      <Block x={64} y={42} w={110} h={128} r={6} className="fill-background stroke-border" />
      {[50, 74, 98, 122, 146].map((y, index) => (
        <g key={y}>
          <Block
            x={70}
            y={y}
            w={98}
            h={20}
            r={4}
            className={index === 0 ? 'fill-primary/10 stroke-primary/40' : 'fill-background'}
          />
          <TextLine x={76} y={y + 5} w={50} />
          <Block
            x={140}
            y={y + 5}
            w={22}
            h={8}
            r={4}
            className={index % 2 === 0 ? 'fill-warning/40' : 'fill-success/40'}
          />
        </g>
      ))}
      <Block x={180} y={42} w={130} h={128} r={6} className="fill-background stroke-border" />
      <TextLine x={190} y={52} w={80} strong />
      <Block x={190} y={68} w={90} h={24} r={8} className="fill-muted" />
      <Block x={210} y={100} w={90} h={24} r={8} className="fill-primary/20" />
      <Block x={190} y={150} w={110} h={12} r={4} className="fill-muted stroke-border" />
    </AppFrame>
  );
}

function Access() {
  return (
    <AppFrame>
      <TextLine x={64} y={28} w={70} strong />
      <Block x={64} y={42} w={246} h={128} r={6} className="fill-background stroke-border" />
      {[0, 1, 2].map((col) => (
        <TextLine key={col} x={190 + col * 40} y={50} w={26} strong />
      ))}
      {[64, 84, 104, 124, 144].map((y, row) => (
        <g key={y}>
          <TextLine x={74} y={y + 4} w={90} />
          {[0, 1, 2].map((col) => {
            const on = (row + col) % 3 !== 0;
            return (
              <Block
                key={col}
                x={196 + col * 40}
                y={y}
                w={12}
                h={12}
                r={3}
                className={on ? 'fill-primary' : 'fill-background stroke-border'}
              />
            );
          })}
        </g>
      ))}
    </AppFrame>
  );
}

function Parent() {
  // A phone, because that is where a parent reads it.
  return (
    <>
      <Block
        x={1}
        y={1}
        w={VIEW_W - 2}
        h={VIEW_H - 2}
        r={10}
        className="fill-muted/40 stroke-border"
      />
      <Block x={110} y={8} w={100} h={166} r={14} className="fill-card stroke-border" />
      <Block x={145} y={14} w={30} h={5} r={2.5} className="fill-muted" />
      <Block x={118} y={26} w={84} h={22} r={6} className="fill-primary/15" />
      <circle cx={130} cy={37} r={6} className="fill-primary/40" />
      <TextLine x={142} y={34} w={48} strong />
      <Block x={118} y={54} w={40} h={30} r={6} className="fill-success/20 stroke-border" />
      <Block x={162} y={54} w={40} h={30} r={6} className="fill-info/20 stroke-border" />
      <TextLine x={124} y={62} w={24} />
      <TextLine x={168} y={62} w={24} />
      {[90, 112, 134].map((y) => (
        <g key={y}>
          <Block x={118} y={y} w={84} h={18} r={5} className="fill-background stroke-border" />
          <TextLine x={124} y={y + 7} w={40} />
          <Block x={178} y={y + 5} w={18} h={8} r={4} className="fill-primary/60" />
        </g>
      ))}
      <Block x={118} y={156} w={84} h={10} r={5} className="fill-primary" />
    </>
  );
}

const ILLUSTRATIONS: Record<IllustrationKey, () => ReactNode> = {
  overview: Overview,
  dashboard: Dashboard,
  students: Students,
  academics: Academics,
  attendance: Attendance,
  fees: Fees,
  'fee-settings': FeeSettings,
  marks: Marks,
  staff: Staff,
  finance: Finance,
  requests: Requests,
  access: Access,
  parent: Parent,
};

export function GuidanceIllustration({
  name,
  className,
}: {
  readonly name: IllustrationKey;
  readonly className?: string;
}) {
  const Drawing = ILLUSTRATIONS[name];
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden="true"
      focusable="false"
      className={cn('block h-auto w-full', className)}
    >
      <Drawing />
    </svg>
  );
}
