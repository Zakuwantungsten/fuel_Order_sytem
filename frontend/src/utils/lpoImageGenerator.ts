import React from 'react';
import { LPOSummary } from '../types';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import LPOPrint from '../components/LPOPrint';

/**
 * Creates a temporary DOM element with the LPO print component
 * and returns the rendered element
 */
const createLPOElement = (data: LPOSummary, preparedBy?: string, approvedBy?: string): Promise<HTMLElement> => {
  return new Promise((resolve) => {
    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    // Force desktop-equivalent rendering on all devices:
    // disable mobile browser text auto-scaling so the captured output
    // is always identical regardless of device screen size
    container.style.width = '794px'; // ~210mm at 96dpi
    container.style.minWidth = '794px';
    (container.style as any)['-webkit-text-size-adjust'] = '100%';
    (container.style as any)['text-size-adjust'] = '100%';
    container.style.zoom = '1';
    document.body.appendChild(container);

    // Create a React root and render the component
    const root = createRoot(container);
    // Keep a reference to the root so we can unmount it later during cleanup
    (container as any).__lpoRoot = root;
    
    // Create a ref callback to get the rendered element
    const ref = (element: HTMLDivElement | null) => {
      if (element) {
        // Wait a bit for styles to be applied
        setTimeout(() => {
          resolve(element);
        }, 100);
      }
    };

    // Render the LPO component with preparedBy and approvedBy
    root.render(React.createElement(LPOPrint, { ref, data, preparedBy, approvedBy }));
  });
};

/**
 * Cleans up the temporary DOM element
 */
const cleanupElement = (element: HTMLElement) => {
  const container = element.parentElement;
  if (container && container.parentElement) {
    // If a React root was attached, unmount it to free React internals and listeners
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
 * Generate LPO as image blob using html2canvas
 */
export const generateLPOImage = async (data: LPOSummary, preparedBy?: string, approvedBy?: string): Promise<Blob> => {
  const element = await createLPOElement(data, preparedBy, approvedBy);
  
  try {
    // Get the actual dimensions of the element
    const elementHeight = element.scrollHeight;
    
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      height: elementHeight,
      windowWidth: 794,
      windowHeight: elementHeight,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      }, 'image/png', 1.0);
    });
  } finally {
    cleanupElement(element);
  }
};

/**
 * Copy LPO image to clipboard
 */
export const copyLPOImageToClipboard = async (data: LPOSummary, preparedBy?: string, approvedBy?: string): Promise<boolean> => {
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
    return false;
  }
};

/**
 * Download LPO as image (PNG)
 */
export const downloadLPOImage = async (data: LPOSummary, filename?: string, preparedBy?: string, approvedBy?: string): Promise<void> => {
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

