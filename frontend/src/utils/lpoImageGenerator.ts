import React from 'react';
import { LPOSummary } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { createRoot } from 'react-dom/client';
import LPOPrint from '../components/LPOPrint';

// Import the logo for watermark - Vite will resolve this to the correct URL
import logoSrc from '../../assets/logo.png';

// Cache the loaded logo image
let cachedLogo: HTMLImageElement | null = null;
let logoLoadPromise: Promise<HTMLImageElement> | null = null;

/**
 * Preload and cache the logo image
 */
const getLogoImage = (): Promise<HTMLImageElement> => {
  // If already loading, return existing promise
  if (logoLoadPromise) {
    return logoLoadPromise;
  }
  
  // If already cached, return immediately
  if (cachedLogo) {
    return Promise.resolve(cachedLogo);
  }
  
  logoLoadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedLogo = img;
      console.log('Logo loaded successfully:', img.width, 'x', img.height, 'from:', logoSrc);
      resolve(img);
    };
    img.onerror = (err) => {
      console.error('Failed to load logo from:', logoSrc, err);
      logoLoadPromise = null; // Reset so we can retry
      reject(new Error('Failed to load logo image'));
    };
    img.src = logoSrc;
  });
  
  return logoLoadPromise;
};

// Preload the logo immediately when the module loads
getLogoImage().catch(err => console.warn('Failed to preload logo:', err));

/**
 * Add watermark logo to a canvas
 */
const addWatermarkToCanvas = async (canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> => {
  try {
    const logo = await getLogoImage();
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Could not get canvas context for watermark');
      return canvas;
    }

    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('Logo natural dimensions:', logo.naturalWidth, 'x', logo.naturalHeight);

    // Calculate watermark dimensions - make it 50% of canvas width
    const watermarkWidth = canvas.width * 0.5;
    const aspectRatio = logo.naturalHeight / logo.naturalWidth;
    const watermarkHeight = watermarkWidth * aspectRatio;

    // Position watermark in the CENTER horizontally, but at 35% from top vertically
    // This ensures it appears in the main content area, not in empty space below
    const x = (canvas.width - watermarkWidth) / 2;
    const y = (canvas.height * 0.35) - (watermarkHeight / 2); // 35% from top

    console.log('Watermark will be drawn at:', x, y, 'size:', watermarkWidth, 'x', watermarkHeight);

    // Save the current context state
    ctx.save();

    // Set watermark opacity - visible but not distracting (20% opacity)
    ctx.globalAlpha = 0.20;

    // Draw the watermark logo
    ctx.drawImage(logo, x, y, watermarkWidth, watermarkHeight);

    // Restore the context state
    ctx.restore();

    console.log('Watermark drawn successfully');
    return canvas;
  } catch (error) {
    console.error('Failed to add watermark:', error);
    return canvas; // Return original canvas if watermark fails
  }
};

/**
 * Creates a temporary DOM element with the LPO print component
 * and returns the rendered element
 */
const createLPOElement = (data: LPOSummary, preparedBy?: string): Promise<HTMLElement> => {
  return new Promise((resolve) => {
    // Create a temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    document.body.appendChild(container);

    // Create a React root and render the component
    const root = createRoot(container);
    
    // Create a ref callback to get the rendered element
    const ref = (element: HTMLDivElement | null) => {
      if (element) {
        // Wait a bit for styles to be applied
        setTimeout(() => {
          resolve(element);
        }, 100);
      }
    };

    // Render the LPO component with preparedBy username
    root.render(React.createElement(LPOPrint, { ref, data, preparedBy }));
  });
};

/**
 * Cleans up the temporary DOM element
 */
const cleanupElement = (element: HTMLElement) => {
  const container = element.parentElement;
  if (container && container.parentElement) {
    container.parentElement.removeChild(container);
  }
};

/**
 * Generate LPO as image blob using html2canvas
 */
export const generateLPOImage = async (data: LPOSummary, preparedBy?: string): Promise<Blob> => {
  const element = await createLPOElement(data, preparedBy);
  
  try {
    let canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794, // A4 width in pixels at 96 DPI
      height: 1123, // A4 height in pixels at 96 DPI
    });

    // Add watermark to the canvas
    canvas = await addWatermarkToCanvas(canvas);

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
export const copyLPOImageToClipboard = async (data: LPOSummary, preparedBy?: string): Promise<boolean> => {
  try {
    const blob = await generateLPOImage(data, preparedBy);
    
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
export const downloadLPOImage = async (data: LPOSummary, filename?: string, preparedBy?: string): Promise<void> => {
  try {
    const blob = await generateLPOImage(data, preparedBy);
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

/**
 * Download LPO as PDF
 */
export const downloadLPOPDF = async (data: LPOSummary, filename?: string, preparedBy?: string): Promise<void> => {
  const element = await createLPOElement(data, preparedBy);
  
  try {
    let canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      height: 1123,
    });

    // Add watermark to the canvas
    canvas = await addWatermarkToCanvas(canvas);

    // Create PDF with A4 dimensions
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    const imgData = canvas.toDataURL('image/png', 1.0);
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    
    pdf.save(filename || `LPO-${data.lpoNo}-${data.date}.pdf`);
  } finally {
    cleanupElement(element);
  }
};