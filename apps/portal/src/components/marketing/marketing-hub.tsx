import { cn } from '@ilm/ui';
import { BRAND } from '@ilm/utils';

import lemmaLogo from '../../../public/auth/lemma-logo.png';

import { ROLES } from './marketing-content';

/**
 * One record in the middle, six portals around it — ADR-0022, after the
 * hub-and-spoke diagram on the indisea.com reference.
 *
 * It is a picture of an architectural fact rather than decoration: every
 * portal reads and writes the same school record, which is why an attendance
 * mark appears in the parent's portal the same day without anybody copying it.
 *
 * SVG, so the geometry is attributes and not inline styles or arbitrary
 * Tailwind values (docs/16 §4.8), and every colour is a semantic token through
 * `fill-*` / `stroke-*`. The spokes' dashes travel inward under motion; the
 * animation is gated in `globals.css` and absent under reduced motion.
 *
 * Decorative to a screen reader beyond its one-sentence name: the role tabs
 * directly below carry the same six names as real, focusable content.
 */

const SIZE = 640;
const CENTRE = SIZE / 2;
const RADIUS = 236;
const NODE_W = 168;
const NODE_H = 52;
/** The wordmark is 866 × 288; this keeps its proportions inside the 168-wide disc. */
const LOGO_W = 136;
const LOGO_H = (LOGO_W * 288) / 866;

/** Six points on a hexagon, starting at twelve o'clock. */
const NODES = ROLES.map((role, index) => {
  const angle = ((index * 60 - 90) * Math.PI) / 180;
  return {
    id: role.id,
    name: role.name,
    x: CENTRE + RADIUS * Math.cos(angle),
    y: CENTRE + RADIUS * Math.sin(angle),
  };
});

export function MarketingHub({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      role="img"
      aria-label={`${BRAND.name} at the centre, connected to the six portals: ${ROLES.map((role) => role.name).join(', ')}.`}
      className={cn('h-auto w-full', className)}
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        className="fill-none stroke-border"
        strokeWidth={1}
      />
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS / 2}
        className="fill-none stroke-border"
        strokeWidth={1}
      />

      {NODES.map((node) => (
        <line
          key={`spoke-${node.id}`}
          data-spoke
          x1={node.x}
          y1={node.y}
          x2={CENTRE}
          y2={CENTRE}
          className="stroke-primary"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}

      {/* The real wordmark on a light disc — `.marketing-paper` makes `card`
          white even inside the dark band, so the navy logo reads as drawn. */}
      <g className="marketing-paper">
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={84}
          className="fill-card stroke-primary"
          strokeWidth={3}
        />
        <image
          href={lemmaLogo.src}
          x={CENTRE - LOGO_W / 2}
          y={CENTRE - LOGO_H / 2 - 10}
          width={LOGO_W}
          height={LOGO_H}
          preserveAspectRatio="xMidYMid meet"
        />
        <text
          x={CENTRE}
          y={CENTRE + 36}
          textAnchor="middle"
          className="fill-muted-foreground text-sm"
        >
          one school record
        </text>
      </g>

      {NODES.map((node) => (
        <g key={node.id}>
          <rect
            x={node.x - NODE_W / 2}
            y={node.y - NODE_H / 2}
            width={NODE_W}
            height={NODE_H}
            rx={NODE_H / 2}
            className="fill-card stroke-border"
            strokeWidth={1}
          />
          <text
            x={node.x}
            y={node.y + 6}
            textAnchor="middle"
            className="fill-foreground text-lg font-medium"
          >
            {node.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
