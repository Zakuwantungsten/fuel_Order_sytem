import React from 'react';
import { LPOSummary } from '../types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { createRoot } from 'react-dom/client';
import LPOPrint from '../components/LPOPrint';

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
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794, // A4 width in pixels at 96 DPI
      height: 1123, // A4 height in pixels at 96 DPI
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
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      height: 1123,
    });

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