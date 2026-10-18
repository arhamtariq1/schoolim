/** Margin of an A4 sheet kept clear, as the challan's own print layout does. */
const MARGIN_MM = 8;

/** The challan finished loading its images, so the capture is not of empty boxes. */
async function imagesLoaded(root: HTMLElement): Promise<void> {
  await Promise.all(
    [...root.querySelectorAll('img')].map(async (image) => {
      if (image.complete) return;
      await new Promise<void>((resolve) => {
        image.addEventListener('load', () => {
          resolve();
        });
        image.addEventListener('error', () => {
          resolve();
        });
      });
    }),
  );
}

/**
 * Save an on-screen challan as a PDF file on one A4 sheet.
 *
 * The challan is drawn once, by `VoucherChallan`, and photographed here, so the
 * file is exactly what the school's Voucher Settings produce — copies, logo,
 * bank marks and all. Three copies lie across a landscape sheet and four make a
 * portrait one, as in print. The libraries are loaded on the click, not with the
 * page: a parent who only reads the list never downloads them.
 */
export async function saveChallanAsPdf(
  element: HTMLElement,
  fileName: string,
  orientation: 'landscape' | 'portrait',
): Promise<void> {
  await imagesLoaded(element);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const room = { width: pageWidth - MARGIN_MM * 2, height: pageHeight - MARGIN_MM * 2 };
  const ratio = Math.min(room.width / canvas.width, room.height / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;

  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageWidth - width) / 2, MARGIN_MM, width, height);
  pdf.save(fileName);
}
