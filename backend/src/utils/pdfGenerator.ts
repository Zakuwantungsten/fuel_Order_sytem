import PDFDocument from 'pdfkit';
import { IDeliveryOrder } from '../types';

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
