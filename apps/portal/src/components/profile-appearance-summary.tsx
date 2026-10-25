import { ROUTES, type SchoolAppearance, type SchoolLogoInfo } from '@ilm/contracts';
import { cardSurfaceClassName, cn } from '@ilm/ui';
import { PaletteIcon } from '@ilm/ui/icons';

const DEFAULT_HEX = '#147f8a';

const PRESET_NAMES: Record<string, string> = {
  '#147f8a': 'Teal (default)',
  '#1d4ed8': 'Blue',
  '#4338ca': 'Indigo',
  '#7c3aed': 'Violet',
  '#b91c1c': 'Crimson',
  '#c2410c': 'Amber',
  '#15803d': 'Green',
  '#0f766e': 'Emerald',
  '#334155': 'Slate',
};

function describeColour(primaryColor: string | null | undefined): { hex: string; label: string } {
  const hex = (primaryColor ?? DEFAULT_HEX).toLowerCase();
  const preset = PRESET_NAMES[hex];
  return {
    hex,
    label: preset ?? `Custom (${hex})`,
  };
}

/** Read-only portal colour and logo — profile view. */
export function ProfileAppearanceSummary({
  appearance,
  logo,
  className,
}: {
  appearance: SchoolAppearance;
  logo: SchoolLogoInfo;
  className?: string;
}) {
  const colour = describeColour(appearance.primaryColor);
  const logoSrc = logo.present ? `${ROUTES.schoolLogo.image}?v=${logo.version ?? ''}` : undefined;

  return (
    <section
      aria-label="Portal appearance"
      className={cn('space-y-4 p-5 sm:p-6', cardSurfaceClassName, className)}
    >
      <header className="flex gap-3 border-b border-border/70 pb-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PaletteIcon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">Portal appearance</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Colour and logo everyone at this school sees in the portal.
          </p>
        </div>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <dt className="text-xs font-medium text-muted-foreground">Portal colour</dt>
          <dd className="flex items-center gap-3">
            <span
              className="size-10 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: colour.hex }}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-foreground">{colour.label}</span>
          </dd>
        </div>
        <div className="space-y-2">
          <dt className="text-xs font-medium text-muted-foreground">School logo</dt>
          <dd className="flex items-center gap-3">
            {logoSrc === undefined ? (
              <span className="text-sm text-muted-foreground">No logo uploaded</span>
            ) : (
              <>
                <img
                  src={logoSrc}
                  alt=""
                  className="size-14 rounded-lg border border-border bg-card object-contain p-1"
                />
                <span className="text-sm font-medium text-foreground">Uploaded</span>
              </>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
