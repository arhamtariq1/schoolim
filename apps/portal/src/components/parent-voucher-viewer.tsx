'use client';

import { ROUTES, type ParentChallan } from '@ilm/contracts';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  useToast,
} from '@ilm/ui';
import { ExportIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { VoucherChallan } from '@/components/voucher-challan';
import { saveChallanAsPdf } from '@/lib/challan-pdf';
import { fetchJson } from '@/lib/mutate';

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; bundle: ParentChallan };

/** One of the parent's own vouchers, with its letterhead, read through their route. */
function useVoucher(id: string): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchJson<{ data: ParentChallan }>(ROUTES.parent.voucher(id));
      if (cancelled) return;
      setLoaded(
        result.ok ? { state: 'ready', bundle: result.data.data } : { state: 'error', message: result.message },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return loaded;
}

/**
 * Shrinks what it holds to fit the box it is in — by width and by the height of
 * the window — so a whole sheet is on screen with nothing to scroll. Layout size
 * is measured before scaling, so it never feeds back on itself.
 */
function FitToBox({ children }: { readonly children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });

  useEffect(() => {
    function measure(): void {
      if (box.current === null || inner.current === null) return;
      const width = inner.current.offsetWidth;
      const height = inner.current.offsetHeight;
      if (width === 0 || height === 0) return;
      // The modal's own header, footer and padding take about this much of the window.
      const availableHeight = Math.max(240, window.innerHeight * 0.92 - 230);
      const scale = Math.min(1, box.current.clientWidth / width, availableHeight / height);
      setFit({ scale, width, height });
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (box.current !== null) observer.observe(box.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div ref={box} className="flex w-full justify-center">
      <div style={{ width: fit.width * fit.scale, height: fit.height * fit.scale }}>
        <div ref={inner} className="w-max origin-top-left" style={{ transform: `scale(${String(fit.scale)})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The challan at its printed size: A4 landscape for three copies, portrait for four. */
function Sheet({
  bundle,
  sheetRef,
}: {
  readonly bundle: ParentChallan;
  readonly sheetRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { challan, school, settings, bankLogos } = bundle;
  return (
    <div ref={sheetRef} className={`bg-white ${settings.copyCount === 4 ? 'w-[210mm]' : 'w-[297mm]'}`}>
      <VoucherChallan
        voucher={challan}
        school={{
          name: school.name,
          address: school.address ?? undefined,
          phone: school.phone ?? undefined,
          logoVersion: school.logoVersion ?? undefined,
          bankLogos,
          accentColor: school.accentColor ?? undefined,
          assets: 'parent',
        }}
        settings={settings}
      />
    </div>
  );
}

async function download(bundle: ParentChallan, element: HTMLElement): Promise<void> {
  await saveChallanAsPdf(
    element,
    `${bundle.challan.voucherNo}.pdf`,
    bundle.settings.copyCount === 4 ? 'portrait' : 'landscape',
  );
}

/**
 * The voucher in a modal, as the school prints it, with a button to save it as a
 * PDF. There is no page of its own: the list is where vouchers live.
 */
export function ParentVoucherDialog({ id, onClose }: { readonly id: string; readonly onClose: () => void }) {
  const loaded = useVoucher(id);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-6xl">
        <DialogHeader>
          <DialogTitle>{loaded.state === 'ready' ? `Voucher ${loaded.bundle.challan.voucherNo}` : 'Fee voucher'}</DialogTitle>
          <DialogDescription>
            {loaded.state === 'ready'
              ? `${loaded.bundle.challan.studentName} · exactly as the school prints it`
              : 'Loading the voucher…'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {loaded.state === 'loading' ? (
            <div role="status" aria-label="Loading the voucher" className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : null}
          {loaded.state === 'error' ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {loaded.message}
            </p>
          ) : null}
          {loaded.state === 'ready' ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <FitToBox>
                <Sheet bundle={loaded.bundle} />
              </FitToBox>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" tone="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            isPending={saving}
            disabled={loaded.state !== 'ready' || saving}
            onClick={() => {
              setSaving(true);
            }}
          >
            <ExportIcon className={ICON_SIZE.inline} aria-hidden />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
      {saving ? (
        <ParentVoucherPdfJob
          id={id}
          onDone={() => {
            setSaving(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

/**
 * Download without opening anything: the voucher is drawn off-screen, saved as a
 * PDF, and the job ends. For the PDF button on a list row.
 */
export function ParentVoucherPdfJob({ id, onDone }: { readonly id: string; readonly onDone: () => void }) {
  const toast = useToast();
  const loaded = useVoucher(id);
  const sheet = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (loaded.state === 'error') {
      toast.error(loaded.message);
      onDone();
      return;
    }
    if (loaded.state !== 'ready' || started.current) return;
    started.current = true;

    void (async () => {
      // One frame, so the sheet is laid out before it is photographed.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      try {
        if (sheet.current !== null) {
          await download(loaded.bundle, sheet.current);
        }
      } catch {
        toast.error('The PDF could not be made. Please try again.');
      } finally {
        onDone();
      }
    })();
  }, [loaded, onDone, toast]);

  if (loaded.state !== 'ready') {
    return null;
  }
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[400vw]">
      <Sheet bundle={loaded.bundle} sheetRef={sheet} />
    </div>
  );
}
