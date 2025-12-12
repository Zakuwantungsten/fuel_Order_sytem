import { useState } from 'react';
import {
  FileText,
  PieChart,
  Users,
  Fuel,
} from 'lucide-react';
import { doWorkbookAPI, deliveryOrdersAPI, lposAPI, fuelRecordsAPI, lpoWorkbookAPI } from '../../services/api';
import * as XLSX from 'xlsx';

interface BasicReportsTabProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

type ReportDataType = 'delivery-orders' | 'lpo' | 'fuel-records' | 'all';

export default function BasicReportsTab({ showMessage }: BasicReportsTabProps) {
  const [dataType, setDataType] = useState<ReportDataType>('delivery-orders');
  const [exporting, setExporting] = useState(false);

  const handleGenerateReport = async () => {
    try {
      setExporting(true);
      showMessage('success', `Generating ${dataType} report...`);
      
      // Route to appropriate export based on data type
      if (dataType === 'delivery-orders') {
        // Get available years for DOs
        const availableYears = await doWorkbookAPI.getAvailableYears();
        
        if (availableYears.length === 0) {
          showMessage('error', 'No delivery orders found. Creating empty report...');
          // Create empty workbook
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet([{ Message: 'No delivery orders available' }]);
          XLSX.utils.book_append_sheet(wb, ws, 'Empty Report');
          XLSX.writeFile(wb, `delivery_orders_empty_${new Date().toISOString().split('T')[0]}.xlsx`);
          showMessage('success', 'Empty report downloaded');
          return;
        }
        
        const yearToExport = availableYears[0];
        await doWorkbookAPI.exportWorkbook(yearToExport);
        showMessage('success', `Delivery Orders report for ${yearToExport} downloaded!`);
        
      } else if (dataType === 'lpo') {
        // Get available years for LPOs
        const availableYears = await lpoWorkbookAPI.getAvailableYears();
        
        if (availableYears.length === 0) {
          showMessage('error', 'No LPO documents found. Creating empty report...');
          // Create empty workbook
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet([{ Message: 'No LPO documents available' }]);
          XLSX.utils.book_append_sheet(wb, ws, 'Empty Report');
          XLSX.writeFile(wb, `lpo_empty_${new Date().toISOString().split('T')[0]}.xlsx`);
          showMessage('success', 'Empty LPO report downloaded');
          return;
        }
        
        const yearToExport = availableYears[0];
        await lpoWorkbookAPI.exportWorkbook(yearToExport);
        showMessage('success', `LPO report for ${yearToExport} downloaded!`);
        
      } else if (dataType === 'fuel-records') {
        // Get fuel records - add page parameter to satisfy validation
        const data = await fuelRecordsAPI.getAll({ page: 1, limit: 1000, sort: 'createdAt', order: 'desc' });
        
        if (data.length === 0) {
          showMessage('error', 'No fuel records found. Creating empty report...');
          // Create empty workbook
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet([{ Message: 'No fuel records available' }]);
          XLSX.utils.book_append_sheet(wb, ws, 'Empty Report');
          XLSX.writeFile(wb, `fuel_records_empty_${new Date().toISOString().split('T')[0]}.xlsx`);
          showMessage('success', 'Empty fuel records report downloaded');
          return;
        }
        
        // Create Excel from fuel records
        const ws = XLSX.utils.json_to_sheet(data.map((item: any) => ({
          'Truck': item.truckNo,
          'DO Number': item.goingDo,
          'Date': new Date(item.date).toLocaleDateString(),
          'Destination': item.to,
          'Total Fuel': item.totalFuel,
          'Balance': item.balance,
        })));
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Fuel Records');
        XLSX.writeFile(wb, `fuel_records_${new Date().toISOString().split('T')[0]}.xlsx`);
        showMessage('success', `Fuel records report with ${data.length} records downloaded!`);
        
      } else if (dataType === 'all') {
        // Export all data types
        const [doYears, lpoYears, fuelData] = await Promise.all([
          doWorkbookAPI.getAvailableYears().catch(() => []),
          lpoWorkbookAPI.getAvailableYears().catch(() => []),
          fuelRecordsAPI.getAll({ page: 1, limit: 1000, sort: 'createdAt', order: 'desc' }).catch(() => []),
        ]);
        
        const wb = XLSX.utils.book_new();
        
        // Add summary sheet
        const summaryData = [
          { Category: 'Delivery Orders', 'Years Available': doYears.length, 'Most Recent': doYears[0] || 'N/A' },
          { Category: 'LPO Documents', 'Years Available': lpoYears.length, 'Most Recent': lpoYears[0] || 'N/A' },
          { Category: 'Fuel Records', 'Years Available': '-', 'Most Recent': fuelData.length > 0 ? 'Available' : 'None' },
        ];
        const summaryWs = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
        
        XLSX.writeFile(wb, `all_reports_summary_${new Date().toISOString().split('T')[0]}.xlsx`);
        showMessage('success', 'Combined summary report downloaded!');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to generate report';
      console.error('Report generation error:', error);
      
      // Even on error, try to create empty report
      if (error.response?.status === 404) {
        showMessage('error', 'No data found. Creating empty report...');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([{ Message: 'No data available for selected report type' }]);
        XLSX.utils.book_append_sheet(wb, ws, 'Empty Report');
        XLSX.writeFile(wb, `empty_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        showMessage('success', 'Empty report downloaded');
      } else {
        showMessage('error', message);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExport = async (format: 'excel' | 'pdf' | 'csv') => {
    try {
      setExporting(true);
      showMessage('success', `Preparing ${format.toUpperCase()} export for ${dataType}...`);
      
      if (format === 'excel') {
        // Excel export based on data type
        if (dataType === 'delivery-orders') {
          const availableYears = await doWorkbookAPI.getAvailableYears();
          
          if (availableYears.length === 0) {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet([{ Message: 'No delivery orders available' }]);
            XLSX.utils.book_append_sheet(wb, ws, 'Empty');
            XLSX.writeFile(wb, `delivery_orders_empty_${new Date().toISOString().split('T')[0]}.xlsx`);
            showMessage('success', 'Empty delivery orders file downloaded');
            return;
          }
          
          const yearToExport = availableYears[0];
          await doWorkbookAPI.exportWorkbook(yearToExport);
          showMessage('success', `Delivery Orders Excel for ${yearToExport} downloaded!`);
          
        } else if (dataType === 'lpo') {
          const availableYears = await lpoWorkbookAPI.getAvailableYears();
          
          if (availableYears.length === 0) {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet([{ Message: 'No LPO documents available' }]);
            XLSX.utils.book_append_sheet(wb, ws, 'Empty');
            XLSX.writeFile(wb, `lpo_empty_${new Date().toISOString().split('T')[0]}.xlsx`);
            showMessage('success', 'Empty LPO file downloaded');
            return;
          }
          
          const yearToExport = availableYears[0];
          await lpoWorkbookAPI.exportWorkbook(yearToExport);
          showMessage('success', `LPO Excel for ${yearToExport} downloaded!`);
          
        } else if (dataType === 'fuel-records') {
          const data = await fuelRecordsAPI.getAll({ page: 1, limit: 1000, sort: 'createdAt', order: 'desc' });
          
          const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data.map((item: any) => ({
            'Truck': item.truckNo,
            'DO Number': item.goingDo,
            'Date': new Date(item.date).toLocaleDateString(),
            'Destination': item.to,
            'Total Fuel': item.totalFuel,
            'Balance': item.balance,
          })) : [{ Message: 'No fuel records available' }]);
          
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Fuel Records');
          XLSX.writeFile(wb, `fuel_records_${new Date().toISOString().split('T')[0]}.xlsx`);
          showMessage('success', data.length > 0 ? `Excel file with ${data.length} fuel records downloaded!` : 'Empty fuel records file downloaded');
          
        } else if (dataType === 'all') {
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet([{ Message: 'Combined report - use individual exports for detailed data' }]);
          XLSX.utils.book_append_sheet(wb, ws, 'Info');
          XLSX.writeFile(wb, `all_data_${new Date().toISOString().split('T')[0]}.xlsx`);
          showMessage('success', 'Combined info file downloaded - use individual exports for full data');
        }
        
      } else if (format === 'pdf') {
        // PDF export - collect data and show info
        const [dos, lpos, fuelRecords] = await Promise.all([
          deliveryOrdersAPI.getAll({ limit: 100, sort: 'createdAt', order: 'desc' }).catch(() => []),
          lposAPI.getAll({ limit: 100, sort: 'createdAt', order: 'desc' }).catch(() => []),
          fuelRecordsAPI.getAll({ page: 1, limit: 100, sort: 'createdAt', order: 'desc' }).catch(() => []),
        ]);
        
        const totalRecords = dos.length + lpos.length + fuelRecords.length;
        
        if (totalRecords === 0) {
          showMessage('error', 'No data found. Database is empty.');
        } else {
          showMessage('success', `Found ${dos.length} DOs, ${lpos.length} LPOs, ${fuelRecords.length} Fuel Records. PDF export feature coming soon.`);
        }
        
      } else if (format === 'csv') {
        // CSV export based on data type
        if (dataType === 'delivery-orders') {
          const data = await deliveryOrdersAPI.getAll({ limit: 1000, sort: 'createdAt', order: 'desc' });
          
          const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data.map((item: any) => ({
            'DO Number': item.doNumber,
            'Truck': item.truckNo,
            'Destination': item.destination,
            'Type': item.importOrExport,
            'Date': new Date(item.date).toLocaleDateString(),
            'Status': item.isCancelled ? 'Cancelled' : 'Active',
          })) : [{ Message: 'No delivery orders available' }]);
          
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Delivery Orders');
          XLSX.writeFile(wb, `delivery_orders_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
          showMessage('success', data.length > 0 ? `CSV with ${data.length} delivery orders downloaded!` : 'Empty CSV downloaded');
          
        } else if (dataType === 'lpo') {
          const data = await lposAPI.getAll({ limit: 1000, sort: 'createdAt', order: 'desc' });
          
          const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data.map((item: any) => ({
            'LPO Number': item.lpoNo,
            'Station': item.station,
            'Date': new Date(item.date).toLocaleDateString(),
            'Total Liters': item.totalLiters || 0,
            'Total Amount': item.totalAmount || 0,
          })) : [{ Message: 'No LPO documents available' }]);
          
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'LPO Documents');
          XLSX.writeFile(wb, `lpo_documents_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
          showMessage('success', data.length > 0 ? `CSV with ${data.length} LPO documents downloaded!` : 'Empty LPO CSV downloaded');
          
        } else if (dataType === 'fuel-records') {
          const data = await fuelRecordsAPI.getAll({ page: 1, limit: 1000, sort: 'createdAt', order: 'desc' });
          
          const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data.map((item: any) => ({
            'Truck': item.truckNo,
            'DO Number': item.goingDo,
            'Date': new Date(item.date).toLocaleDateString(),
            'Destination': item.to,
            'Total Fuel': item.totalFuel,
            'Balance': item.balance,
          })) : [{ Message: 'No fuel records available' }]);
          
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Fuel Records');
          XLSX.writeFile(wb, `fuel_records_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
          showMessage('success', data.length > 0 ? `CSV with ${data.length} fuel records downloaded!` : 'Empty fuel records CSV downloaded');
          
        } else if (dataType === 'all') {
          showMessage('error', 'Please select a specific data type for CSV export (DOs, LPOs, or Fuel Records)');
        }
      }
    } catch (error: any) {
      const message = error.response?.data?.message || `Failed to export ${format.toUpperCase()}`;
      console.error('Export error:', error);
      
      // Try to create empty file even on error
      if (error.response?.status === 404 || !error.response) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet([{ Message: 'No data available' }]);
        XLSX.utils.book_append_sheet(wb, ws, 'Empty');
        const ext = format === 'csv' ? 'csv' : 'xlsx';
        XLSX.writeFile(wb, `empty_${dataType}_${new Date().toISOString().split('T')[0]}.${ext}`, format === 'csv' ? { bookType: 'csv' } : {});
        showMessage('success', 'Empty file downloaded');
      } else {
        showMessage('error', message);
      }
    } finally {
      setExporting(false);
    }
  };

  const availableReports = [
    {
      name: 'Delivery Orders Summary',
      description: 'Complete DO statistics and trends',
      icon: FileText,
      color: 'blue',
      dataType: 'delivery-orders' as ReportDataType,
    },
    {
      name: 'LPO Activity Report',
      description: 'LPO creation and fulfillment metrics',
      icon: PieChart,
      color: 'purple',
      dataType: 'lpo' as ReportDataType,
    },
    {
      name: 'Fuel Consumption Report',
      description: 'Fuel usage and allocation analysis',
      icon: Fuel,
      color: 'orange',
      dataType: 'fuel-records' as ReportDataType,
    },
    {
      name: 'Combined Report',
      description: 'All data types summary',
      icon: Users,
      color: 'green',
      dataType: 'all' as ReportDataType,
    },
  ];

  const dataTypeLabels: Record<ReportDataType, string> = {
    'delivery-orders': 'Delivery Orders',
    'lpo': 'LPO Documents',
    'fuel-records': 'Fuel Records',
    'all': 'All Data Types',
  };

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Reports & Analytics</h4>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Generate and export operational reports for {dataTypeLabels[dataType]}. Reports work with available data and create empty files if no data exists.
              {exporting && ' Please wait while we prepare your export...'}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
              💡 Tip: Even if no data exists, you'll get an empty report file. Select report type below to get started.
            </p>
          </div>
        </div>
      </div>

      {/* Data Type Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Select Data Type
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {availableReports.map((report) => {
            const Icon = report.icon;
            return (
              <button
                key={report.dataType}
                onClick={() => setDataType(report.dataType)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dataType === report.dataType
                    ? `border-${report.color}-500 bg-${report.color}-50 dark:bg-${report.color}-900/20`
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className={`w-8 h-8 mb-3 ${
                  dataType === report.dataType
                    ? `text-${report.color}-600 dark:text-${report.color}-400`
                    : 'text-gray-400'
                }`} />
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1 text-sm">
                  {report.name}
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {report.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Actions for selected data type */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Quick Actions for {dataTypeLabels[dataType]}
        </h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleGenerateReport}
            disabled={exporting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Generating...' : `Generate ${dataTypeLabels[dataType]} Report`}
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export to PDF'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          How Reports Work
        </h3>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>✅ <strong>Smart Data Detection:</strong> Reports automatically find available data years</p>
          <p>✅ <strong>Empty Data Handling:</strong> Even with no data, you'll get an empty report file</p>
          <p>✅ <strong>Multiple Formats:</strong> Export as Excel (.xlsx), CSV, or view PDF info</p>
          <p>✅ <strong>Data Types:</strong> Choose from Delivery Orders, LPO Documents, Fuel Records, or All</p>
        </div>
      </div>
    </div>
  );
}
