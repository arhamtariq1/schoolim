'use client';

import { brandColorSchema, ROUTES, type SchoolAppearance } from '@ilm/contracts';
import { brandRamp, Button, cn, Field, Input, useToast } from '@ilm/ui';
import { ApproveIcon, ICON_SIZE, PaletteIcon, SuccessIcon, WarningIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Settings › School › the school's own colour.
 *
 * ## Presets first, a picker second
 *
 * Almost nobody arrives knowing their hex. They know "we're the green school",
 * and they want to press green. So the row of swatches is the primary control
 * and the hex field is the escape hatch for the school that has a brand book.
 *
 * ## Why the preview is a real button
 *
 * A colour swatch tells you what the colour is. It does not tell you whether
 * the label on your primary button will be readable, which is the only question
 * that actually matters here — and it is the question a swatch is worst at
 * answering, because a 40-pixel square of colour looks fine at any contrast.
 * So the preview shows the controls the colour will actually be used on, at the
 * size they are used at, with their real text.
 *
 * ## Why it reports a number
 *
 * docs/16 §6 sets 4.5:1 as a rule. A school changing its own colours can walk
 * straight into breaking it, so the ratio is on screen — and when a colour
 * cannot meet it as chosen, the card says the colour was adjusted rather than
 * silently shipping something other than what was pressed. Refusing outright
 * would be easier and worse: somebody who wants a yellow school can have one,
 * legibly.
 */

/**
 * Eight starting points, and the product's own.
 *
 * Chosen to be distinguishable from each other at a glance — a preset row where
 * three of them read as "blue" is a row that makes the choice harder. Each is
 * given at a lightness that already works as a primary, so pressing one is
 * never the case that gets adjusted.
 */
const PRESETS = [
  { hex: '#147f8a', name: 'Teal' },
  { hex: '#1d4ed8', name: 'Blue' },
  { hex: '#4338ca', name: 'Indigo' },
  { hex: '#7c3aed', name: 'Violet' },
  { hex: '#b91c1c', name: 'Crimson' },
  { hex: '#c2410c', name: 'Amber' },
  { hex: '#15803d', name: 'Green' },
  { hex: '#0f766e', name: 'Emerald' },
  { hex: '#334155', name: 'Slate' },
] as const;

/** What the portal ships with, and what "Reset" goes back to. */
const DEFAULT_HEX = '#147f8a';

export interface BrandColourCardProps {
  readonly appearance: SchoolAppearance;
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
}

export function BrandColourCard({ appearance, canConfigure, error }: BrandColourCardProps) {
  const router = useRouter();
  const toast = useToast();

  const saved = appearance.primaryColor;
  const [chosen, setChosen] = useState(saved ?? DEFAULT_HEX);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const parsed = brandColorSchema.safeParse(chosen);
  const valid = parsed.success ? parsed.data : undefined;

  // Recomputed only when the colour changes — it is a few hundred multiplies,
  // but it runs on every keystroke in the hex field otherwise.
  const ramp = useMemo(() => (valid === undefined ? undefined : brandRamp(valid)), [valid]);

  // `null` in the database and `#147f8a` typed by hand are the same colour but
  // not the same state: one says "use the product's", the other pins it. Both
  // are compared as the resolved colour, so pressing Teal on a school that has
  // never chosen still counts as a change worth saving.
  const isDirty = (valid ?? '') !== (saved ?? DEFAULT_HEX);

  const isCustomColour =
    valid !== undefined && !PRESETS.some((preset) => preset.hex === valid);

  async function save(next: string | null): Promise<void> {
    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<SchoolAppearance>(ROUTES.school.appearance, 'PUT', {
      primaryColor: next,
    });
    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setChosen(result.data.primaryColor ?? DEFAULT_HEX);
    toast.success(
      next === null ? 'Back to the default colour.' : 'Portal colour saved.',
      'Everyone at this school sees it on their next page.',
    );
    router.refresh();
  }

  return (
    <section
      className="h-full rounded-xl border border-border bg-card p-4 shadow-raised"
      aria-labelledby="brand-colour"
    >
      <h2 id="brand-colour" className="text-base font-medium text-foreground">
        Portal colour
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Buttons, links and highlights across your portal, for everyone at this school. It does not
        change the printed challan, which stays black on white so it photocopies.
      </p>

      {error === undefined ? null : <Alert>{error}</Alert>}
      {formError === undefined ? null : <Alert>{formError}</Alert>}

      <fieldset disabled={!canConfigure || isSaving} className="mt-4 space-y-5">
        <div>
          <span className="block text-sm font-semibold text-foreground">Color</span>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {PRESETS.map((preset) => {
              const isCurrent = valid === preset.hex;
              return (
                <button
                  key={preset.hex}
                  type="button"
                  aria-label={preset.name}
                  aria-pressed={isCurrent}
                  title={preset.name}
                  onClick={() => {
                    setChosen(preset.hex);
                  }}
                  className={cn(
                    'relative flex size-10 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    !isCurrent && 'hover:scale-105',
                  )}
                  style={
                    isCurrent
                      ? {
                          backgroundColor: preset.hex,
                          boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${preset.hex}`,
                        }
                      : { backgroundColor: preset.hex }
                  }
                >
                  {isCurrent ? (
                    <ApproveIcon className="size-4 text-white drop-shadow-sm" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}

            <span className="mx-1 hidden h-8 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

            <label className="relative inline-flex cursor-pointer items-center gap-2.5 rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:outline-none">
              <span
                className={cn(
                  'relative flex size-10 shrink-0 items-center justify-center rounded-full p-0.5',
                  isCustomColour
                    ? 'bg-transparent'
                    : 'bg-linear-to-br from-red-500 via-emerald-500 to-blue-500',
                )}
                style={
                  isCustomColour && valid !== undefined
                    ? {
                        boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${valid}`,
                      }
                    : undefined
                }
              >
                <span
                  className="flex size-full items-center justify-center rounded-full bg-card"
                  style={isCustomColour && valid !== undefined ? { backgroundColor: valid } : undefined}
                >
                  {isCustomColour ? (
                    <ApproveIcon className="size-4 text-white drop-shadow-sm" aria-hidden="true" />
                  ) : (
                    <PaletteIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
              </span>
              <span className="pointer-events-none text-sm font-medium text-foreground">Custom</span>
              <input
                type="color"
                value={valid ?? DEFAULT_HEX}
                aria-label="Choose a custom colour"
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                onChange={(event) => {
                  setChosen(event.target.value.toLowerCase());
                }}
              />
            </label>
          </div>
        </div>

        <Field
          label="Or enter your own"
          hint="Six-digit hex, the way a brand book writes it."
          error={chosen.trim() === '' || parsed.success ? undefined : 'Use a colour like #1b838e.'}
        >
          <Input
            value={chosen}
            spellCheck={false}
            autoCapitalize="off"
            className="max-w-xs font-mono"
            placeholder="#1b838e"
            onChange={(event) => {
              setChosen(event.target.value);
            }}
          />
        </Field>

        {ramp === undefined ? null : <Preview ramp={ramp} />}
      </fieldset>

      {!canConfigure ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Only an owner or principal can change this.
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            isPending={isSaving}
            disabled={!isDirty || valid === undefined}
            onClick={() => {
              void save(valid ?? null);
            }}
          >
            Save colour
          </Button>

          {saved === null ? null : (
            <Button
              type="button"
              tone="ghost"
              disabled={isSaving}
              onClick={() => {
                void save(null);
              }}
            >
              Reset to default
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The colour on the controls it will actually be used on.
 *
 * Scoped with inline custom properties rather than by rebuilding each control:
 * these are the same token names the real components read, so the preview is
 * the real Button and the real link, and it cannot drift from what saving
 * produces.
 */
function Preview({ ramp }: { readonly ramp: NonNullable<ReturnType<typeof brandRamp>> }) {
  const passes = ramp.lightContrast >= 4.5;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div
        className="flex flex-wrap items-center gap-3"
        style={
          {
            '--primary': `oklch(${String(ramp.steps[600].l)} ${String(ramp.steps[600].c)} ${String(ramp.steps[600].h)})`,
          } as React.CSSProperties
        }
      >
        <span
          className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white"
          style={{ backgroundColor: ramp.primaryHex }}
        >
          Save changes
        </span>
        <span className="text-sm font-medium underline" style={{ color: ramp.primaryHex }}>
          A link
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{
            color: ramp.primaryHex,
            backgroundColor: `color-mix(in oklch, ${ramp.primaryHex} 12%, transparent)`,
          }}
        >
          Badge
        </span>
        <span className="ms-auto font-mono text-xs text-muted-foreground">{ramp.primaryHex}</span>
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        {passes ? (
          <SuccessIcon className={`${ICON_SIZE.inline} shrink-0 text-success`} aria-hidden />
        ) : (
          <WarningIcon className={`${ICON_SIZE.inline} shrink-0 text-warning`} aria-hidden />
        )}
        <span>
          Button text measures{' '}
          <strong className="font-medium text-foreground">
            {ramp.lightContrast.toFixed(1)}:1
          </strong>{' '}
          against this colour — {passes ? 'comfortably readable' : 'below the readable line'}.
          {ramp.adjusted
            ? ' Your colour was darkened slightly so the label stays legible; the swatch above is what you will get.'
            : ''}
        </span>
      </p>
    </div>
  );
}

function Alert({ children }: { readonly children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
    >
      {children}
    </p>
  );
}
