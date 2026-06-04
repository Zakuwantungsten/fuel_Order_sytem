import PDFDocument from 'pdfkit';
import { IDeliveryOrder, ILPOSummary, ILPODetail } from '../types';
import axios from 'axios';

/** Company branding injected at PDF generation time (loaded from SystemConfig). */
export interface CompanyBranding {
  companyName: string;
  companyWebsite: string;
  companyEmail: string;
  companyPhone: string;
  /** base64 data URL "data:image/png;base64,..." or empty string */
  logoUrl: string;
}

const DEFAULT_BRANDING: CompanyBranding = {
  companyName: '',
  companyWebsite: '',
  companyEmail: '',
  companyPhone: '',
  logoUrl: '',
};

/**
 * Decode a base64 data URL to a Buffer, or return null if empty/invalid.
 */
function logoToBuffer(logoUrl: string): Buffer | null {
  if (!logoUrl || !logoUrl.startsWith('data:')) return null;
  try {
    const base64 = logoUrl.split(',')[1];
    if (!base64) return null;
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

/**
 * Generate a PDF document for amended and cancelled Delivery Orders
 */
export const generateAmendedDOsPDF = (
  deliveryOrders: IDeliveryOrder[],
  options?: { includeEditHistory?: boolean },
  branding: CompanyBranding = DEFAULT_BRANDING
): PDFKit.PDFDocument => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Amended & Cancelled DOs - ${deliveryOrders.map(d => d.doNumber).join(', ')}`,
      Author: 'Fuel Order Management System',
      Subject: 'Amended and Cancelled Delivery Orders',
    },
  });

  const includeHistory = options?.includeEditHistory ?? true;

  // Colors
  const colors = {
    primary: '#E67E22', // Orange - Tahmeed color
    secondary: '#2C3E50',
    headerBg: '#F8F9FA',
    border: '#000000',
    text: '#333333',
    muted: '#666666',
    amended: '#D35400',
  };

  // Helper functions
  const drawLine = (y: number, startX = 40, endX = 555) => {
    doc.moveTo(startX, y).lineTo(endX, y).stroke(colors.border);
  };

  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (date: Date | string | undefined): string => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Generate cover page
  const generateCoverPage = () => {
    // Header
    doc.fontSize(28).fillColor(colors.primary).text(branding.companyName, 40, 60, { align: 'center' });
    doc.fontSize(10).fillColor(colors.muted).text(branding.companyWebsite, { align: 'center' });
    
    doc.moveDown(2);
    
    // Title
    doc.fontSize(20).fillColor(colors.secondary).text('AMENDED & CANCELLED DELIVERY ORDERS', { align: 'center' });
    
    doc.moveDown(1);
    
    // DO Numbers box
    const doNumbers = deliveryOrders.map(d => d.doNumber).join(', ');
    doc.fontSize(12).fillColor(colors.amended).text(`DOs: ${doNumbers}`, { align: 'center' });
    
    doc.moveDown(2);
    
    // Summary box
    const boxY = 200;
    doc.rect(40, boxY, 515, 120).stroke(colors.border);
    
    doc.fontSize(14).fillColor(colors.secondary).text('Summary', 50, boxY + 10);
    drawLine(boxY + 30, 50, 545);
    
    // Count amended vs cancelled
    const amendedCount = deliveryOrders.filter(d => d.editHistory && d.editHistory.length > 0 && !d.isCancelled).length;
    const cancelledCount = deliveryOrders.filter(d => d.isCancelled).length;
    
    doc.fontSize(11).fillColor(colors.text);
    doc.text(`Total DOs: ${deliveryOrders.length} (${amendedCount} Amended, ${cancelledCount} Cancelled)`, 50, boxY + 40);
    doc.text(`Generated On: ${formatDateTime(new Date())}`, 50, boxY + 60);
    
    // List all DOs with status
    doc.text('Delivery Orders:', 50, boxY + 85);
    let doListY = boxY + 100;
    deliveryOrders.forEach((order, idx) => {
      if (doListY < boxY + 110) {
        const status = order.isCancelled ? '[CANCELLED]' : '[AMENDED]';
        doc.fontSize(10).text(`${idx + 1}. ${order.doNumber} - ${order.truckNo} (${order.importOrExport}) ${status}`, 60, doListY);
        doListY += 12;
      }
    });
    
    doc.moveDown(4);
    
    // Add info about contents
    doc.fontSize(10).fillColor(colors.muted).text(
      'This document contains amended and cancelled Delivery Order forms with their edit history.',
      40, 350, { align: 'center', width: 515 }
    );
  };

  // Generate individual DO page
  const generateDOPage = (order: IDeliveryOrder, pageIndex: number) => {
    doc.addPage();
    
    // Header
    doc.fontSize(24).fillColor(colors.primary).text(branding.companyName, 40, 40);
    doc.fontSize(8).fillColor(colors.muted)
      .text(branding.companyWebsite, 40, 65)
      .text(`Email: ${branding.companyEmail}`, 40, 75)
      .text(`Tel: ${branding.companyPhone}`, 40, 85);
    
    // Status stamp - CANCELLED or AMENDED
    if (order.isCancelled) {
      doc.fontSize(14).fillColor('#DC2626') // red color for cancelled
        .text('CANCELLED', 450, 50, { align: 'right' });
    } else {
      doc.fontSize(14).fillColor(colors.amended)
        .text('AMENDED', 450, 50, { align: 'right' });
    }
    
    // Title
    doc.rect(40, 105, 515, 30).fillAndStroke(colors.headerBg, colors.border);
    doc.fontSize(14).fillColor(colors.text).text('DELIVERY NOTE / GOODS RECEIVED NOTE', 40, 113, { align: 'center', width: 515 });
    
    // DO Number and Date row
    let currentY = 145;
    doc.rect(40, currentY, 350, 25).stroke(colors.border);
    doc.rect(390, currentY, 165, 25).stroke(colors.border);
    
    doc.fontSize(12).fillColor(colors.text);
    doc.text(`${order.doType || 'DO'} #:`, 50, currentY + 7);
    doc.fillColor('#dc3545').text(order.doNumber, 100, currentY + 7);
    doc.fillColor(colors.text).text(`Date: ${formatDate(order.date)}`, 400, currentY + 7);
    
    currentY += 35;
    
    // Recipient Information
    doc.rect(40, currentY, 515, 70).stroke(colors.border);
    
    doc.fontSize(10).fillColor(colors.text);
    doc.text('Client:', 50, currentY + 10);
    doc.font('Helvetica-Bold').text(order.clientName, 80, currentY + 10);
    doc.font('Helvetica');
    
    doc.text('Please receive the under mentioned containers/Packages', 50, currentY + 25);
    
    doc.text(`MPRO NO: ${order.invoiceNos || 'N/A'}`, 50, currentY + 45);
    doc.text(`POL: ${order.loadingPoint}`, 250, currentY + 45);
    
    currentY += 80;
    
    // Transport Details
    doc.rect(40, currentY, 257, 50).stroke(colors.border);
    doc.rect(297, currentY, 258, 50).stroke(colors.border);
    
    doc.fontSize(10);
    doc.text(`For Destination: ${order.destination}`, 50, currentY + 10);
    doc.text(`Haulier: ${order.haulier || 'N/A'}`, 50, currentY + 30);
    
    doc.text(`Lorry No: ${order.truckNo}`, 307, currentY + 10);
    doc.text(`Trailer No: ${order.trailerNo}`, 307, currentY + 30);
    
    currentY += 60;
    
    // Items Table Header
    const tableHeaders = ['CONTAINER NO.', 'B/L NO', 'PACKAGES', 'CONTENTS', 'WEIGHT', 'MEASUREMENT'];
    const colWidths = [100, 80, 70, 95, 80, 90];
    let tableX = 40;
    
    doc.rect(40, currentY, 515, 20).fillAndStroke('#E5E7EB', colors.border);
    
    doc.fontSize(8).fillColor(colors.text);
    tableHeaders.forEach((header, i) => {
      doc.text(header, tableX + 5, currentY + 6, { width: colWidths[i] - 10, align: 'center' });
      tableX += colWidths[i];
    });
    
    currentY += 20;
    
    // Items Table Row
    doc.rect(40, currentY, 515, 25).stroke(colors.border);
    tableX = 40;
    const rowData = [
      order.containerNo,
      order.borderEntryDRC || 'N/A',
      '1',
      order.cargoType || 'GOODS',
      `${order.tonnages} TONS`,
      'N/A'
    ];
    
    rowData.forEach((data, i) => {
      doc.text(data?.toString() || '', tableX + 5, currentY + 8, { width: colWidths[i] - 10, align: 'center' });
      tableX += colWidths[i];
    });
    
    currentY += 35;
    
    // Rate Information
    doc.rect(40, currentY, 515, 30).stroke(colors.border);
    doc.fontSize(10);
    doc.text(`Rate per Ton: $${order.ratePerTon}`, 50, currentY + 10);
    doc.text(`Total Rate: $${(order.ratePerTon * order.tonnages).toFixed(2)}`, 250, currentY + 10);
    doc.text(`Import/Export: ${order.importOrExport}`, 400, currentY + 10);
    
    currentY += 40;
    
    // Driver Information
    doc.rect(40, currentY, 515, 25).stroke(colors.border);
    doc.text(`Driver: ${order.driverName || 'N/A'}`, 50, currentY + 8);
    
    currentY += 35;
    
    // Edit History Section (if enabled)
    if (includeHistory && order.editHistory && order.editHistory.length > 0) {
      doc.fontSize(12).fillColor(colors.amended).text('Amendment History', 40, currentY);
      currentY += 20;
      
      order.editHistory.forEach((edit, idx) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
          doc.fontSize(12).fillColor(colors.amended).text(`Amendment History (continued) - ${order.doNumber}`, 40, currentY);
          currentY += 25;
        }
        
        doc.rect(40, currentY, 515, 50 + (edit.changes.length * 15)).stroke(colors.border);
        
        doc.fontSize(9).fillColor(colors.muted);
        doc.text(`Amendment ${idx + 1} - ${formatDateTime(edit.editedAt)} by ${edit.editedBy}`, 50, currentY + 5);
        
        if (edit.reason) {
          doc.text(`Reason: ${edit.reason}`, 50, currentY + 18);
        }
        
        let changeY = currentY + (edit.reason ? 33 : 20);
        doc.fontSize(8).fillColor(colors.text);
        
        edit.changes.forEach((change) => {
          doc.text(`• ${change.field}: "${change.oldValue || 'N/A'}" → "${change.newValue || 'N/A'}"`, 60, changeY);
          changeY += 15;
        });
        
        currentY += 55 + (edit.changes.length * 15);
      });
    }
    
    // Footer
    const footerY = 750;
    doc.fontSize(8).fillColor(colors.muted)
      .text(`Page ${pageIndex + 2} | ${order.doNumber} | Generated: ${formatDateTime(new Date())}`, 40, footerY, { align: 'center', width: 515 });
  };

  // Generate document
  generateCoverPage();
  
  deliveryOrders.forEach((order, index) => {
    generateDOPage(order, index);
  });

  return doc;
};

/**
 * Generate filename for amended and cancelled DOs PDF
 */
export const generateAmendedDOsFilename = (doNumbers: string[]): string => {
  const doList = doNumbers.join(',');
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `Amended_Cancelled_DO(${doList})_${timestamp}.pdf`;
};

/**
 * Generate a PDF document for bulk Delivery Orders (clean design)
 */
export const generateBulkDOsPDF = (
  deliveryOrders: IDeliveryOrder[],
  username?: string,
  branding: CompanyBranding = DEFAULT_BRANDING
): PDFKit.PDFDocument => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Bulk DOs - ${deliveryOrders[0]?.doNumber} to ${deliveryOrders[deliveryOrders.length - 1]?.doNumber}`,
      Author: 'Fuel Order Management System',
      Subject: 'Bulk Delivery Orders',
    },
  });

  // Colors
  const colors = {
    primary: '#E67E22', // Orange - Tahmeed color
    secondary: '#2C3E50',
    headerBg: '#F8F9FA',
    border: '#CCCCCC', // Lighter border color
    text: '#333333',
    muted: '#666666',
    red: '#dc3545',
  };

  // Logo: decode base64 data URL from branding (no file-system dependency)
  const logoBuffer = logoToBuffer(branding.logoUrl);
  const hasLogo = logoBuffer !== null;

  // Helper functions
  const drawLine = (y: number, startX = 40, endX = 555, lineWidth = 0.5) => {
    doc.lineWidth(lineWidth);
    doc.moveTo(startX, y).lineTo(endX, y).stroke(colors.border);
  };

  const formatDate = (date: Date | string | undefined): string => {
    if (!date) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const generationTimestamp = formatDateTime(new Date());
  const totalPages = deliveryOrders.length;

  // Add footer to each page
  const addFooter = (pageNumber: number) => {
    const footerY = 792; // Bottom of A4 page (842 - 50 margin)
    doc.fontSize(8).fillColor(colors.muted);
    doc.text(
      `Generated: ${generationTimestamp}`,
      40,
      footerY,
      { align: 'left', width: 200 }
    );
    doc.text(
      `Page ${pageNumber} of ${totalPages}`,
      40,
      footerY,
      { align: 'right', width: 515 }
    );
  };

  // Generate individual DO page (clean design without heavy borders)
  const generateDOPage = (order: IDeliveryOrder, isFirstPage: boolean, pageNumber: number) => {
    if (!isFirstPage) {
      doc.addPage();
    }
    
    let currentY = 40;

    // Add watermark (centered, behind all content)
    if (hasLogo) {
      try {
        const pageWidth = 595; // A4 width in points
        const pageHeight = 842; // A4 height in points
        const watermarkSize = 280; // Logo size for watermark (scaled up)
        const watermarkX = (pageWidth - watermarkSize) / 2;
        const watermarkY = (pageHeight - watermarkSize) / 2;
        
        doc.save();
        doc.opacity(0.3);
        doc.image(logoBuffer!, watermarkX, watermarkY, { width: watermarkSize });
        doc.opacity(1);
        doc.restore();
      } catch (error) {
        console.warn('Failed to add watermark:', error);
      }
    }

    // CANCELLED diagonal watermark — layered on top of logo watermark
    if (order.isCancelled) {
      const pageWidth = 595;
      const pageHeight = 842;
      doc.save();
      doc.opacity(0.12); // faint red
      doc.font('Helvetica-Bold');
      doc.fontSize(96);
      doc.fillColor('#DC2626');
      // Translate to page centre, rotate -45°, then draw centred
      doc.translate(pageWidth / 2, pageHeight / 2);
      doc.rotate(-45);
      doc.text('CANCELLED', -350, -48, { width: 700, align: 'center', lineBreak: false });
      doc.restore();
    }

    // Header Section - Company details on left
    doc.fontSize(28).fillColor(colors.primary).text(branding.companyName, 40, currentY);
    doc.fontSize(8).fillColor(colors.muted)
      .text(branding.companyWebsite, 40, currentY + 25)
      .text(`Email: ${branding.companyEmail}`, 40, currentY + 35)
      .text(`Tel: ${branding.companyPhone}`, 40, currentY + 45);
    
    // Logo on the right side (opposite to company details)
    if (hasLogo) {
      try {
        const logoWidth = 80;
        const logoHeight = 60;
        const logoX = 555 - logoWidth; // Right aligned
        doc.image(logoBuffer!, logoX, currentY, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight] });
      } catch (error) {
        console.warn('Failed to add header logo:', error);
      }
    }
    
    currentY += 65;
    
    // Title Section with subtle background
    drawLine(currentY, 40, 555, 1);
    currentY += 5;
    doc.rect(40, currentY, 515, 25).fillAndStroke(colors.headerBg, colors.headerBg);
    doc.fontSize(14).fillColor(colors.text).text('DELIVERY NOTE / GOODS RECEIVED NOTE', 40, currentY + 7, { align: 'center', width: 515 });
    currentY += 25;
    drawLine(currentY, 40, 555, 1);
    
    currentY += 15;
    
    // DO Number and Date Section
    doc.fontSize(12).fillColor(colors.text);
    doc.text(`${order.doType || 'DO'} #:`, 40, currentY);
    doc.fillColor(colors.red).text(order.doNumber, 85, currentY);
    doc.fillColor(colors.text).text(`Date: ${formatDate(order.date)}`, 400, currentY);
    
    currentY += 25;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Client Information
    doc.fontSize(10).fillColor(colors.text);
    doc.text('Client:', 40, currentY);
    doc.font('Helvetica-Bold').text(order.clientName, 75, currentY);
    doc.font('Helvetica');
    
    currentY += 20;
    doc.fontSize(9).text('Please receive the under mentioned containers/Packages', 40, currentY);
    
    currentY += 20;
    doc.fontSize(10);
    doc.text(`MPRO NO: ${order.invoiceNos || 'N/A'}`, 40, currentY);
    doc.text(`POL: ${order.loadingPoint}`, 250, currentY);
    doc.text(`Arrive: ${order.importOrExport === 'IMPORT' ? 'TANGA/DAR' : order.loadingPoint}`, 400, currentY);
    
    currentY += 25;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Transport Details Section
    const midPoint = 297;
    
    doc.fontSize(10);
    doc.text(`For Destination:`, 40, currentY);
    doc.font('Helvetica-Bold').text(order.destination, 135, currentY);
    doc.font('Helvetica');
    
    doc.text(`Lorry No:`, midPoint, currentY);
    doc.font('Helvetica-Bold').text(order.truckNo, midPoint + 60, currentY);
    doc.font('Helvetica');
    
    currentY += 20;
    
    doc.text(`Haulier:`, 40, currentY);
    doc.font('Helvetica-Bold').text(order.haulier || 'N/A', 135, currentY);
    doc.font('Helvetica');
    
    doc.text(`Trailer No:`, midPoint, currentY);
    doc.font('Helvetica-Bold').text(order.trailerNo, midPoint + 60, currentY);
    doc.font('Helvetica');
    
    currentY += 25;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Items Table
    const tableHeaders = ['CONTAINER NO.', 'B/L NO', 'PACKAGES', 'CONTENTS', 'WEIGHT', 'MEASUREMENT'];
    const colWidths = [100, 80, 70, 95, 80, 90];
    let tableX = 40;
    
    // Table Header
    doc.rect(40, currentY, 515, 20).fillAndStroke(colors.headerBg, colors.headerBg);
    doc.fontSize(8).fillColor(colors.text);
    tableHeaders.forEach((header, i) => {
      doc.text(header, tableX + 5, currentY + 6, { width: colWidths[i] - 10, align: 'center' });
      tableX += colWidths[i];
    });
    
    currentY += 20;
    drawLine(currentY, 40, 555);
    currentY += 5;
    
    // Table Row
    tableX = 40;
    const rowData = [
      order.containerNo || 'LOOSE CARGO',
      order.borderEntryDRC || '',
      '1',
      order.cargoType || 'GOODS',
      order.rateType === 'per_ton' ? `${order.tonnages} TONS` : '-',
      ''
    ];
    
    doc.fontSize(9);
    rowData.forEach((data, i) => {
      doc.text(data?.toString() || '', tableX + 5, currentY, { width: colWidths[i] - 10, align: 'center' });
      tableX += colWidths[i];
    });
    
    currentY += 20;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Prepared By Section (with username if provided)
    doc.fontSize(10);
    doc.text('Prepared By:', 40, currentY);
    if (username) {
      doc.font('Helvetica-Bold').text(username, 120, currentY);
      doc.font('Helvetica');
    } else {
      drawLine(currentY + 15, 120, 400);
    }
    
    currentY += 35;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Releasing Clerk Section
    doc.fontSize(10).fillColor(colors.text);
    doc.text('Releasing Clerks Name', 40, currentY);
    currentY += 20;
    drawLine(currentY + 15, 40, 555);
    currentY += 20;
    doc.fontSize(8).fillColor(colors.muted).text('Signature (Official Rubber Stamp)', 400, currentY, { align: 'right' });
    
    currentY += 25;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Remarks and Rate Section (REMARKS section left empty as requested)
    doc.fontSize(10).fillColor(colors.text);
    doc.text('REMARKS:', 40, currentY);
    // Removed cargo type display - leaving remarks empty
    
    currentY += 25;
    
    // Rate Information (centered and bold)
    doc.fontSize(14).font('Helvetica-Bold').fillColor(colors.text);
    const rateText = order.rateType === 'per_ton' 
      ? `$${order.ratePerTon} PER TON`
      : `TOTAL: $${order.ratePerTon?.toLocaleString() || 0}`;
    doc.text(rateText, 40, currentY, { align: 'center', width: 515 });
    doc.font('Helvetica');
    
    currentY += 30;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // WE Section
    doc.fontSize(10).fillColor(colors.text);
    doc.text('WE', 40, currentY);
    currentY += 20;
    drawLine(currentY + 15, 40, 555);
    currentY += 20;
    doc.fontSize(8).fillColor(colors.muted).text('Signature (Official Rubber Stamp)', 400, currentY, { align: 'right' });
    
    currentY += 25;
    drawLine(currentY, 40, 555);
    currentY += 15;
    
    // Acknowledgment Section
    doc.fontSize(10).fillColor(colors.text);
    doc.text('Acknowledge receipts of the goods as detailed above', 40, currentY);
    
    currentY += 20;
    
    // Driver Name and Date
    doc.fontSize(9);
    doc.text('Delivers Name:', 40, currentY);
    doc.font('Helvetica-Bold').text(order.driverName || '', 120, currentY);
    doc.font('Helvetica');
    
    doc.text('Date:', 350, currentY);
    doc.font('Helvetica-Bold').text(formatDate(order.date), 380, currentY);
    doc.font('Helvetica');
    
    currentY += 15;
    drawLine(currentY, 120, 320);
    drawLine(currentY, 380, 555);
    
    currentY += 20;
    
    // National ID section
    doc.fontSize(9).fillColor(colors.text);
    doc.text('National ID/Passport No.', 40, currentY);
    currentY += 15;
    drawLine(currentY, 40, 555);

    // Add footer to this page
    addFooter(pageNumber);
  };

  // Generate all DO pages
  deliveryOrders.forEach((order, index) => {
    generateDOPage(order, index === 0, index + 1);
  });

  return doc;
};

/**
 * Generate filename for bulk DOs PDF
 */
export const generateBulkDOsFilename = (firstDO: string, lastDO: string, doType: string): string => {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${doType}_${firstDO}_to_${lastDO}_${timestamp}.pdf`;
};

/**
 * Load company branding from SystemConfig.
 * If logoUrl is an HTTPS URL (R2/CDN), fetches and converts to base64 data URL.
 */
export const getCompanyBranding = async (): Promise<CompanyBranding> => {
  try {
    const { SystemConfig } = await import('../models/SystemConfig');
    const config = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false }).lean();
    const g = (config as any)?.systemSettings?.general;

    let logoUrl: string = g?.logoUrl || '';

    if (logoUrl && logoUrl.startsWith('http')) {
      try {
        const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const mimeType = (response.headers['content-type'] as string)?.split(';')[0] || 'image/png';
        const base64 = Buffer.from(response.data as ArrayBuffer).toString('base64');
        logoUrl = `data:${mimeType};base64,${base64}`;
      } catch {
        logoUrl = '';
      }
    }

    return {
      companyName: g?.companyName || '',
      companyWebsite: g?.companyWebsite || '',
      companyEmail: g?.companyEmail || '',
      companyPhone: g?.companyPhone || '',
      logoUrl,
    };
  } catch {
    return { companyName: '', companyWebsite: '', companyEmail: '', companyPhone: '', logoUrl: '' };
  }
};

/**
 * Generate a PDF for an LPO Summary document.
 * Matches the layout of the former frontend LPOPrint component with logo watermark.
 */
export const generateLPOPDF = (
  lpo: ILPOSummary,
  branding: CompanyBranding = DEFAULT_BRANDING,
  preparedBy?: string,
  approvedBy?: string
): PDFKit.PDFDocument => {
  const MARGIN = 40;
  const PAGE_W = 595;
  const PAGE_H = 842;
  const CONTENT_W = PAGE_W - 2 * MARGIN; // 515
  const FOOTER_Y = PAGE_H - MARGIN - 18;  // 784
  const ROWS_PER_PAGE = 20;
  const ROW_H = 22;
  const HDR_H = 24;

  // Column x-positions and widths (sum = 515)
  const C = [
    { x: MARGIN,       w: 90  }, // DO No.
    { x: MARGIN + 90,  w: 85  }, // Truck No.
    { x: MARGIN + 175, w: 70  }, // Liters
    { x: MARGIN + 245, w: 70  }, // Rate
    { x: MARGIN + 315, w: 95  }, // Amount
    { x: MARGIN + 410, w: 105 }, // Dest.
  ];
  const TABLE_R = MARGIN + CONTENT_W; // 555

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `LPO-${lpo.lpoNo}`, Author: 'Fuel Order Management System' } });

  const logoBuffer = logoToBuffer(branding.logoUrl);

  const currency = (lpo.currency as 'USD' | 'TZS') || (() => {
    const u = (lpo.station || '').toUpperCase();
    return (u.startsWith('LAKE') && !u.includes('TUNDUMA')) ? 'USD' : 'TZS';
  })();

  const totalLiters = lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.liters, 0);
  const totalAmount = lpo.entries.filter(e => !e.isCancelled).reduce((s, e) => s + e.amount, 0);

  // Pre-split entries into pages of 20
  const pages: ILPODetail[][] = [];
  if (lpo.entries.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < lpo.entries.length; i += ROWS_PER_PAGE) {
      pages.push(lpo.entries.slice(i, i + ROWS_PER_PAGE));
    }
  }
  const totalPages = pages.length;

  const allCancelled = lpo.entries.length > 0 && lpo.entries.every(e => e.isCancelled);

  const fmtDate = (d: string | Date): string =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const fmtAmount = (n: number): string =>
    currency === 'USD'
      ? `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `TZS ${n.toLocaleString('en-US')}`;

  const hline = (y: number, x1 = MARGIN, x2 = TABLE_R, lw = 0.5, color = '#000000') => {
    doc.save().lineWidth(lw).moveTo(x1, y).lineTo(x2, y).strokeColor(color).stroke().restore();
  };

  const drawWatermarks = () => {
    if (logoBuffer) {
      try {
        const sz = 280;
        doc.save().opacity(0.3)
          .image(logoBuffer, (PAGE_W - sz) / 2, (PAGE_H - sz) / 2, { width: sz })
          .opacity(1).restore();
      } catch { /* ignore */ }
    }
    if (allCancelled) {
      doc.save().opacity(0.12).font('Helvetica-Bold').fontSize(96).fillColor('#DC2626')
        .translate(PAGE_W / 2, PAGE_H / 2).rotate(-45)
        .text('CANCELLED', -350, -48, { width: 700, align: 'center', lineBreak: false })
        .restore();
    }
  };

  const drawTableHeader = (y: number) => {
    doc.rect(MARGIN, y, CONTENT_W, HDR_H).fill('#F5F5F5');
    doc.rect(MARGIN, y, CONTENT_W, HDR_H).lineWidth(1).strokeColor('#000000').stroke();
    C.forEach((col, i) => {
      if (i > 0) doc.save().lineWidth(1).moveTo(col.x, y).lineTo(col.x, y + HDR_H).strokeColor('#000000').stroke().restore();
    });
    const labels = ['DO No.', 'Truck No.', 'Liters', `Rate (${currency})`, `Amount (${currency})`, 'Dest.'];
    const ty = y + (HDR_H - 10) / 2;
    labels.forEach((lbl, i) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
        .text(lbl, C[i].x + 3, ty, { width: C[i].w - 6, align: 'center', lineBreak: false });
    });
  };

  const drawDataRow = (y: number, entry: ILPODetail, rowIdx: number) => {
    const cancelled = !!entry.isCancelled;
    const isDA = !!entry.isDriverAccount;
    const isRef = !!entry.isRefer;

    const bg = cancelled ? '#FFE6E6' : isRef ? '#FFF7ED' : isDA ? '#FFF3E6' : rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(bg);
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).lineWidth(0.5).strokeColor('#000000').stroke();
    C.forEach((col, i) => {
      if (i > 0) doc.save().lineWidth(0.5).moveTo(col.x, y).lineTo(col.x, y + ROW_H).strokeColor('#000000').stroke().restore();
    });

    const doNo = cancelled ? 'CANCELLED' : isRef ? 'REF' : isDA ? (entry.referenceDoNo ? `DA(NIL)-${entry.referenceDoNo}` : 'DA(NIL)') : entry.doNo;
    const dest = isDA ? 'NIL' : isRef ? (entry.dest || 'REFER') : entry.dest;
    const doColor = cancelled ? '#CC0000' : isRef ? '#C2410C' : isDA ? '#CC6600' : '#000000';
    const destColor = cancelled ? '#CC0000' : isDA ? '#CC6600' : '#333333';
    const stdColor = cancelled ? '#CC0000' : '#000000';
    const rateColor = cancelled ? '#CC0000' : '#333333';

    const ty = y + (ROW_H - 10) / 2;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(doColor)
      .text(doNo, C[0].x + 3, ty, { width: C[0].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(stdColor)
      .text(entry.truckNo, C[1].x + 3, ty, { width: C[1].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(stdColor)
      .text(entry.liters.toLocaleString('en-US'), C[2].x + 3, ty, { width: C[2].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(rateColor)
      .text(entry.rate.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), C[3].x + 3, ty, { width: C[3].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(stdColor)
      .text(entry.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), C[4].x + 3, ty, { width: C[4].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(destColor)
      .text(dest, C[5].x + 3, ty, { width: C[5].w - 6, align: 'center', lineBreak: false });

    if (cancelled) {
      const midY = y + ROW_H / 2;
      doc.save().lineWidth(0.5).moveTo(MARGIN + 2, midY).lineTo(TABLE_R - 2, midY).strokeColor('#CC0000').stroke().restore();
    }
  };

  const drawTotalRow = (y: number) => {
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill('#E8E8E8');
    doc.rect(MARGIN, y, CONTENT_W, ROW_H).lineWidth(1).strokeColor('#000000').stroke();
    C.forEach((col, i) => {
      // Skip divider at col 1 — TOTAL label spans cols 0+1
      if (i > 1) doc.save().lineWidth(1).moveTo(col.x, y).lineTo(col.x, y + ROW_H).strokeColor('#000000').stroke().restore();
    });
    const ty = y + (ROW_H - 11) / 2;
    // TOTAL label spans cols 0+1
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      .text('TOTAL', C[0].x + 3, ty, { width: C[0].w + C[1].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      .text(totalLiters.toLocaleString('en-US'), C[2].x + 3, ty, { width: C[2].w - 6, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      .text(fmtAmount(totalAmount), C[4].x + 3, ty, { width: C[4].w - 6, align: 'center', lineBreak: false });
  };

  pages.forEach((pageEntries, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast = pageIdx === totalPages - 1;

    if (!isFirst) doc.addPage();
    drawWatermarks();

    let y = MARGIN;

    if (isFirst) {
      // Title row
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#000000')
        .text('LOCAL PURCHASE ORDER', MARGIN, y, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#000000')
        .text(`LPO No. ${lpo.lpoNo}`, MARGIN, y, { width: CONTENT_W, align: 'right', lineBreak: false });
      y += 28;

      doc.font('Helvetica').fontSize(11).fillColor('#444444').text('FUEL SUPPLY', MARGIN, y, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor('#555555')
        .text(`Date: ${fmtDate(lpo.date)}`, MARGIN, y, { width: CONTENT_W, align: 'right', lineBreak: false });
      y += 20;

      // Station / Order Of
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('Station: ', MARGIN, y, { continued: true, lineBreak: false });
      doc.font('Helvetica').fillColor('#333333').text(lpo.station, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('Order of: ', MARGIN + CONTENT_W / 2, y, { continued: true, lineBreak: false });
      doc.font('Helvetica').fillColor('#333333').text(lpo.orderOf, { lineBreak: false });
      y += 20;

      hline(y, MARGIN, TABLE_R, 2.5, '#000000');
      y += 12;

      // Instructions band
      hline(y, MARGIN, TABLE_R, 0.5, '#DDDDDD');
      y += 8;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
        .text('KINDLY SUPPLY THE FOLLOWING LITERS', MARGIN, y, { lineBreak: false });
      y += 18;
      hline(y, MARGIN, TABLE_R, 0.5, '#DDDDDD');
      y += 12;
    } else {
      // Continuation header
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000')
        .text(`LPO No. ${lpo.lpoNo} (Continued)`, MARGIN, y, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor('#555555')
        .text(`Date: ${fmtDate(lpo.date)}`, MARGIN, y, { width: CONTENT_W, align: 'right', lineBreak: false });
      y += 24;
      hline(y, MARGIN, TABLE_R, 2, '#000000');
      y += 15;
    }

    const tableStartY = y;
    const totalTableH = HDR_H + pageEntries.length * ROW_H + (isLast ? ROW_H : 0);
    const TABLE_RADIUS = 5;

    // Clip all table fills/borders to rounded rect so corners appear rounded
    doc.save();
    doc.roundedRect(MARGIN, tableStartY, CONTENT_W, totalTableH, TABLE_RADIUS).clip();

    drawTableHeader(y);
    y += HDR_H;

    pageEntries.forEach((entry, rowIdx) => {
      drawDataRow(y, entry, rowIdx);
      y += ROW_H;
    });

    if (isLast) {
      drawTotalRow(y);
      y += ROW_H;
    }

    doc.restore();

    // Draw rounded outer border on top of clipped content
    doc.roundedRect(MARGIN, tableStartY, CONTENT_W, totalTableH, TABLE_RADIUS)
      .lineWidth(1).strokeColor('#000000').stroke();

    if (isLast) {
      y += 40;

      // Signature section
      const sigW = CONTENT_W / 3;
      [0, 1, 2].forEach(i => {
        hline(y, MARGIN + i * sigW + 5, MARGIN + (i + 1) * sigW - 5, 2, '#000000');
      });

      const sigLabels = ['Prepared By', 'Approved By', 'Received By'];
      const sigNames = [preparedBy || '', approvedBy || '', ''];
      const sigSubs = ['Signature', approvedBy ? 'Signature' : 'Name & Signature', 'Station Attendant'];

      sigLabels.forEach((lbl, i) => {
        const sx = MARGIN + i * sigW;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(lbl, sx + 5, y + 10, { width: sigW - 10, lineBreak: false });
        if (sigNames[i]) {
          doc.font('Helvetica').fontSize(10).fillColor('#000000').text(sigNames[i], sx + 5, y + 24, { width: sigW - 10, lineBreak: false });
        }
        doc.font('Helvetica').fontSize(9).fillColor('#666666').text(sigSubs[i], sx + 5, y + (sigNames[i] ? 38 : 28), { width: sigW - 10, lineBreak: false });
      });

      y += 70;
      hline(y, MARGIN, TABLE_R, 0.5, '#CCCCCC');
      y += 8;
      doc.font('Helvetica').fontSize(9).fillColor('#666666')
        .text('This is a computer-generated document. No signature is required.', MARGIN, y, { lineBreak: false });
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#666666')
        .text('For any queries, please contact the logistics department.', MARGIN, y, { lineBreak: false });
    }

    // Page footer
    hline(FOOTER_Y - 6, MARGIN, TABLE_R, 0.5, '#DDDDDD');
    doc.font('Helvetica').fontSize(9).fillColor('#666666')
      .text(`Page ${pageIdx + 1} of ${totalPages}`, MARGIN, FOOTER_Y, { width: CONTENT_W, align: 'center', lineBreak: false });
  });

  return doc;
};
