/**
 * Client helpers that download Visas & Overstays exports from the API
 * (ExcelJS / PDFKit / PNG-from-PDF generated on the server).
 */
import apiClient from '../services/api';

export type ExportKind = 'xlsx' | 'pdf' | 'image';

/** Keep in sync with backend EXPORT_PAGE_LIMITS / estimate*Pages. */
export const EXPORT_PAGE_LIMITS = {
  imageMaxPages: 1,
  pdfMaxPages: 8,
  daySheetRowsPerPage: 18,
  buildRowsPerPage: 22,
} as const;

export function estimateDaySheetPages(rowCount: number): number {
  return Math.max(1, Math.ceil(Math.max(rowCount, 1) / EXPORT_PAGE_LIMITS.daySheetRowsPerPage));
}

export function estimateBuildReviewPages(itemCount: number): number {
  return Math.max(1, Math.ceil(Math.max(itemCount, 1) / EXPORT_PAGE_LIMITS.buildRowsPerPage));
}

export function exportAvailability(pages: number): {
  pages: number;
  imageAllowed: boolean;
  pdfAllowed: boolean;
  imageHint: string;
  pdfHint: string;
} {
  const imageAllowed = pages <= EXPORT_PAGE_LIMITS.imageMaxPages;
  const pdfAllowed = pages <= EXPORT_PAGE_LIMITS.pdfMaxPages;
  return {
    pages,
    imageAllowed,
    pdfAllowed,
    imageHint: imageAllowed
      ? 'Same look as the PDF (single page)'
      : `Image is only for 1-page sheets (~${pages} pages). Use PDF.`,
    pdfHint: pdfAllowed
      ? pages > 1
        ? `PDF (${pages} pages)`
        : 'PDF'
      : `PDF limited to ${EXPORT_PAGE_LIMITS.pdfMaxPages} pages (needs ~${pages}). Split or reduce rows.`,
  };
}

function filenameFromDisposition(header: string | undefined, fallback: string) {
  if (!header) return fallback;
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(header);
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1].replace(/"/g, '').trim());
  } catch {
    return m[1].replace(/"/g, '').trim() || fallback;
  }
}

async function downloadExport(url: string, params: Record<string, string>, fallbackName: string) {
  try {
    const response = await apiClient.get(url, {
      params,
      responseType: 'blob',
    });
    const contentType = String(response.headers?.['content-type'] || '');
    // API errors often arrive as JSON inside a blob
    if (contentType.includes('application/json')) {
      const text = await (response.data as Blob).text();
      let msg = 'Export failed';
      try {
        msg = JSON.parse(text)?.message || msg;
      } catch {
        /* keep */
      }
      throw new Error(msg);
    }
    const name = filenameFromDisposition(
      response.headers?.['content-disposition'] as string | undefined,
      fallbackName
    );
    const blob = new Blob([response.data], {
      type: contentType || response.data.type,
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  } catch (err: any) {
    if (err?.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        const parsed = JSON.parse(text);
        throw new Error(parsed?.message || 'Export failed');
      } catch (inner: any) {
        if (inner?.message && inner.message !== 'Export failed') throw inner;
      }
    }
    throw err;
  }
}

function formatParam(kind: ExportKind): string {
  if (kind === 'image') return 'png';
  return kind;
}

export async function downloadDaySheetExport(date: string, kind: ExportKind) {
  const ext = kind === 'image' ? 'png' : kind;
  await downloadExport(
    '/visa-overstays/exports/day-sheet',
    { date, format: formatParam(kind) },
    `Visas_Overstays_${date}.${ext}`
  );
}

export async function downloadBuildReviewExport(date: string, kind: ExportKind) {
  const ext = kind === 'image' ? 'png' : kind;
  await downloadExport(
    '/visa-overstays/exports/build',
    { date, format: formatParam(kind) },
    `Build_Review_${date}.${ext}`
  );
}
