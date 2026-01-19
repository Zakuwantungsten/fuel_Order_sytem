import PDFDocument from 'pdfkit';
import { IDeliveryOrder } from '../types';
import path from 'path';

/**
 * Generate a PDF document for amended and cancelled Delivery Orders
 */
export const generateAmendedDOsPDF = (
  deliveryOrders: IDeliveryOrder[],
  options?: { includeEditHistory?: boolean }
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
    doc.fontSize(28).fillColor(colors.primary).text('TAHMEED', 40, 60, { align: 'center' });
    doc.fontSize(10).fillColor(colors.muted).text('www.tahmeedcoach.co.ke', { align: 'center' });
    
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
    doc.fontSize(24).fillColor(colors.primary).text('TAHMEED', 40, 40);
    doc.fontSize(8).fillColor(colors.muted)
      .text('www.tahmeedcoach.co.ke', 40, 65)
      .text('Email: info@tahmeedcoach.co.ke', 40, 75)
      .text('Tel: +254 700 000 000', 40, 85);
    
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
  username?: string
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

  // Logo path
  const logoPath = path.join(__dirname, '../../assets/logo.png');
  let hasLogo = false;
  try {
    require('fs').accessSync(logoPath);
    hasLogo = true;
  } catch (error) {
    console.warn('Logo file not found at:', logoPath);
  }

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
        doc.image(logoPath, watermarkX, watermarkY, { width: watermarkSize });
        doc.opacity(1);
        doc.restore();
      } catch (error) {
        console.warn('Failed to add watermark:', error);
      }
    }

    // Header Section - Company details on left
    doc.fontSize(28).fillColor(colors.primary).text('TAHMEED', 40, currentY);
    doc.fontSize(8).fillColor(colors.muted)
      .text('www.tahmeedcoach.co.ke', 40, currentY + 25)
      .text('Email: info@tahmeedcoach.co.ke', 40, currentY + 35)
      .text('Tel: +254 700 000 000', 40, currentY + 45);
    
    // Logo on the right side (opposite to company details)
    if (hasLogo) {
      try {
        const logoWidth = 80;
        const logoHeight = 60;
        const logoX = 555 - logoWidth; // Right aligned
        doc.image(logoPath, logoX, currentY, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight] });
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
