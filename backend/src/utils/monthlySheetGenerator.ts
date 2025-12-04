import ExcelJS from 'exceljs';

/**
 * Add monthly summary sheets to a workbook
 * @param workbook - ExcelJS workbook instance
 * @param orders - Array of delivery orders
 * @param year - Year for the summary
 * @param orderType - Type of orders ('DO' or 'SDO')
 */
export const addMonthlySummarySheets = (
  workbook: ExcelJS.Workbook,
  orders: any[],
  year: number,
  orderType: 'DO' | 'SDO' = 'DO'
): void => {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ordersByMonth: { [key: string]: any[] } = {};
  
  // Group orders by month
  orders.forEach((order) => {
    const date = new Date(order.date);
    const monthKey = monthNames[date.getMonth()];
    if (!ordersByMonth[monthKey]) {
      ordersByMonth[monthKey] = [];
    }
    ordersByMonth[monthKey].push(order);
  });

  // Create a sheet for each month that has orders (in reverse chronological order)
  monthNames.reverse().forEach((monthName) => {
    if (ordersByMonth[monthName] && ordersByMonth[monthName].length > 0) {
      const monthOrders = ordersByMonth[monthName];
      const monthSheet = workbook.addWorksheet(monthName);

      // Helper to format dates
      const formatDate = (dateString: string) => {
        if (!dateString) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      };

      // Set column widths
      monthSheet.columns = [
        { key: 'sn', width: 6 },
        { key: 'date', width: 12 },
        { key: 'importExport', width: 15 },
        { key: 'doNumber', width: 12 },
        { key: 'invoiceNos', width: 15 },
        { key: 'clientName', width: 25 },
        { key: 'truckNo', width: 15 },
        { key: 'trailerNo', width: 15 },
        { key: 'containerNo', width: 15 },
        { key: 'borderEntry', width: 15 },
        { key: 'loadingPoint', width: 20 },
        { key: 'destination', width: 20 },
        { key: 'haulier', width: 20 },
        { key: 'tonnages', width: 12 },
        { key: 'ratePerTon', width: 12 },
        { key: 'rate', width: 15 },
      ];

      // Add header
      monthSheet.mergeCells('A1:P1');
      const headerLabel = orderType === 'SDO' ? 'SPECIAL DELIVERY ORDERS' : 'DELIVERY ORDERS';
      monthSheet.getCell('A1').value = `${headerLabel} - ${monthName.toUpperCase()} ${year}`;
      monthSheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      monthSheet.getCell('A1').alignment = { horizontal: 'center' };
      monthSheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: orderType === 'SDO' ? 'FF9333EA' : 'FF4472C4' }, // Purple for SDO, Blue for DO
      };

      // Add column headers at row 3
      const headerRow = monthSheet.getRow(3);
      headerRow.values = [
        'S/N', 'DATE', 'IMPORT OR EXPORT', `${orderType} No.`, 'Invoice Nos', 
        'CLIENT NAME', 'TRUCK No.', 'TRAILER No.', 'CONTAINER No.', 
        'BORDER ENTRY DRC', 'LOADING POINT', 'DESTINATION', 'HAULIER', 
        'TONNAGES', 'RATE PER TON', 'RATE'
      ];
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: orderType === 'SDO' ? 'FF9333EA' : 'FF4472C4' },
      };
      headerRow.height = 25;

      // Add data rows
      let rowNum = 4;
      monthOrders.forEach((order, index) => {
        const row = monthSheet.getRow(rowNum);
        row.values = [
          index + 1,
          formatDate(order.date),
          order.importOrExport,
          order.doNumber,
          order.invoiceNos || '',
          order.clientName,
          order.truckNo,
          order.trailerNo,
          order.containerNo || 'LOOSE CARGO',
          order.borderEntryDRC || '',
          order.loadingPoint || '',
          order.destination,
          order.haulier || '',
          order.tonnages,
          order.ratePerTon,
          order.tonnages * order.ratePerTon,
        ];

        // Center align all cells
        for (let col = 1; col <= 16; col++) {
          row.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Add borders
        for (let col = 1; col <= 16; col++) {
          row.getCell(col).border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }

        // Highlight cancelled orders
        if (order.isCancelled) {
          for (let col = 1; col <= 16; col++) {
            row.getCell(col).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEE2E2' },
            };
            row.getCell(col).font = { color: { argb: 'FF9CA3AF' } };
          }
        }

        rowNum++;
      });
    }
  });
};
