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
const createLPOElement = (data: LPOSummary, preparedBy?: string, approvedBy?: string): Promise<HTMLElement> => {
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
    const elementWidth = element.scrollWidth;
    
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: elementWidth,
      height: elementHeight,
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

/**
 * Download LPO as PDF with multi-page support
 */
export const downloadLPOPDF = async (data: LPOSummary, filename?: string, preparedBy?: string, approvedBy?: string): Promise<void> => {
  const element = await createLPOElement(data, preparedBy, approvedBy);
  
  try {
    // Get the actual dimensions of the element
    const elementHeight = element.scrollHeight;
    const elementWidth = element.scrollWidth;
    
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: elementWidth,
      height: elementHeight,
      windowHeight: elementHeight,
      onclone: (clonedDoc) => {
        // Ensure proper rendering of the cloned document
        const clonedElement = clonedDoc.body.querySelector('[data-html2canvas]');
        if (clonedElement) {
          (clonedElement as HTMLElement).style.display = 'block';
        }
      }
    });

    // Create PDF with A4 dimensions
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    const imgData = canvas.toDataURL('image/png', 1.0);
    
    // Check if content fits on one page
    if (imgHeight <= pageHeight) {
      // Single page - add directly
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    } else {
      // Multi-page - split content across pages with proper margins
      let heightLeft = imgHeight;
      let position = 0;
      
      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      // Add subsequent pages
      let page = 1;
      while (heightLeft > 0) {
        position = -(pageHeight * page);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        page++;
      }
    }
    
    pdf.save(filename || `LPO-${data.lpoNo}-${data.date}.pdf`);
  } finally {
    cleanupElement(element);
  }
};