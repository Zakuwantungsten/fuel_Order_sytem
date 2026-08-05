import React from 'react';
import { LPOSummary } from '../types';
import { createRoot } from 'react-dom/client';
import LPOPrint, { LPO_ROWS_PER_PAGE } from '../components/LPOPrint';

export { LPO_ROWS_PER_PAGE };

/** True when an LPO would render as more than one page in the image/PDF templates. */
export const isLPOMultiPage = (entryCount: number): boolean =>
  entryCount > LPO_ROWS_PER_PAGE;

/** Cached dynamic import — first call pays ~580KB, later calls reuse the module. */
let html2canvasPromise: Promise<typeof import('html2canvas')> | null = null;

const loadHtml2Canvas = () => {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas');
  }
  return html2canvasPromise;
};

/** Warm the html2canvas chunk early (e.g. when Copy/Download menu opens). */
export const preloadLPOImageGenerator = (): void => {
  void loadHtml2Canvas();
};

/** Wait for layout/paint without a fixed 100ms sleep. */
const waitForPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

/**
 * Trim bottom/right whitespace from a captured canvas (single-page content crop).
 */
const cropCanvasToContent = (source: HTMLCanvasElement, padding = 12): HTMLCanvasElement => {
  const ctx = source.getContext('2d');
  if (!ctx) return source;

  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);

  const isWhite = (i: number) =>
    data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250;

  let top = 0;
  let left = 0;
  let right = width - 1;
  let bottom = height - 1;

  // Find bottom-most non-white row
  outerBottom: for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (!isWhite((y * width + x) * 4)) {
        bottom = y;
        break outerBottom;
      }
    }
  }

  // Find top-most non-white row
  outerTop: for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWhite((y * width + x) * 4)) {
        top = y;
        break outerTop;
      }
    }
  }

  // Find right-most non-white column
  outerRight: for (let x = width - 1; x >= 0; x--) {
    for (let y = top; y <= bottom; y++) {
      if (!isWhite((y * width + x) * 4)) {
        right = x;
        break outerRight;
      }
    }
  }

  // Find left-most non-white column
  outerLeft: for (let x = 0; x <= right; x++) {
    for (let y = top; y <= bottom; y++) {
      if (!isWhite((y * width + x) * 4)) {
        left = x;
        break outerLeft;
      }
    }
  }

  const cropLeft = Math.max(0, left - padding);
  const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(width - 1, right + padding);
  const cropBottom = Math.min(height - 1, bottom + padding);
  const cropW = cropRight - cropLeft + 1;
  const cropH = cropBottom - cropTop + 1;

  // Nothing meaningful to crop
  if (cropW >= width - 4 && cropH >= height - 4) return source;

  const cropped = document.createElement('canvas');
  cropped.width = cropW;
  cropped.height = cropH;
  const croppedCtx = cropped.getContext('2d');
  if (!croppedCtx) return source;
  croppedCtx.fillStyle = '#ffffff';
  croppedCtx.fillRect(0, 0, cropW, cropH);
  croppedCtx.drawImage(source, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);
  return cropped;
};

/**
 * Creates a temporary DOM element with the LPO print component
 * and returns the rendered element
 */
const createLPOElement = (
  data: LPOSummary,
  preparedBy?: string,
  approvedBy?: string,
  options?: { cropToContent?: boolean }
): Promise<HTMLElement> => {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '794px';
    container.style.minWidth = '794px';
    (container.style as any)['-webkit-text-size-adjust'] = '100%';
    (container.style as any)['text-size-adjust'] = '100%';
    container.style.zoom = '1';
    document.body.appendChild(container);

    const root = createRoot(container);
    (container as any).__lpoRoot = root;

    const ref = (element: HTMLDivElement | null) => {
      if (element) {
        waitForPaint().then(() => resolve(element));
      }
    };

    root.render(
      React.createElement(LPOPrint, {
        ref,
        data,
        preparedBy,
        approvedBy,
        cropToContent: options?.cropToContent,
      })
    );
  });
};

/**
 * Cleans up the temporary DOM element
 */
const cleanupElement = (element: HTMLElement) => {
  const container = element.parentElement;
  if (container && container.parentElement) {
    const maybeRoot = (container as any).__lpoRoot;
    try {
      if (maybeRoot && typeof maybeRoot.unmount === 'function') {
        maybeRoot.unmount();
      }
    } catch (e) {
      // ignore unmount errors
    }

    container.parentElement.removeChild(container);
  }
};

/**
 * Generate LPO as image blob using html2canvas.
 * Single-page LPOs are cropped to content; multi-page throws (use PDF instead).
 */
export const generateLPOImage = async (
  data: LPOSummary,
  preparedBy?: string,
  approvedBy?: string
): Promise<Blob> => {
  const entryCount = data.entries?.length ?? 0;
  if (isLPOMultiPage(entryCount)) {
    throw new Error(
      'This LPO has multiple pages. Please download as PDF instead of copying/downloading as image.'
    );
  }

  const html2canvasLoad = loadHtml2Canvas();
  const element = await createLPOElement(data, preparedBy, approvedBy, { cropToContent: true });
  const { default: html2canvas } = await html2canvasLoad;

  try {
    const elementHeight = element.scrollHeight;

    const canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      height: elementHeight,
      windowWidth: 794,
      windowHeight: elementHeight,
      imageTimeout: 0,
      removeContainer: true,
    });

    const finalCanvas = cropCanvasToContent(canvas);

    return new Promise((resolve, reject) => {
      finalCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      }, 'image/png');
    });
  } finally {
    cleanupElement(element);
  }
};

/**
 * Copy LPO image to clipboard
 */
export const copyLPOImageToClipboard = async (
  data: LPOSummary,
  preparedBy?: string,
  approvedBy?: string
): Promise<boolean> => {
  try {
    const blob = await generateLPOImage(data, preparedBy, approvedBy);

    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('Clipboard API not supported');
    }

    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);

    return true;
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error);
    throw error;
  }
};

/**
 * Download LPO as image (PNG)
 */
export const downloadLPOImage = async (
  data: LPOSummary,
  filename?: string,
  preparedBy?: string,
  approvedBy?: string
): Promise<void> => {
  try {
    const blob = await generateLPOImage(data, preparedBy, approvedBy);
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `LPO-${data.lpoNo}-${data.date}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download image:', error);
    throw error;
  }
};
