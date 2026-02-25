import { X, Printer, Edit, Ban, Download } from 'lucide-react';
import { formatDate as formatSystemDate } from '../utils/timezone';
import { DeliveryOrder } from '../types';
import DeliveryNotePrint from './DeliveryNotePrint';
import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

interface DODetailModalProps {
  order: DeliveryOrder;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
}

const DODetailModal = ({ order, isOpen, onClose, onEdit }: DODetailModalProps) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    const toastId = toast.loading('Preparing PDF download...', {
      style: { background: '#0284c7', color: '#fff' },
    });
    setIsDownloading(true);
    onClose();
    try {
      // Get API base URL and auth token
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
      const token = sessionStorage.getItem('fuel_order_token');
      
      if (!token) {
        toast.update(toastId, {
          render: 'Authentication required. Please log in again.',
          type: 'error',
          isLoading: false,
          autoClose: 5000,
        });
        setIsDownloading(false);
        return;
      }
      
      // Download PDF from backend with authentication
      const response = await axios.get(
        `${API_BASE_URL}/delivery-orders/${order._id}/pdf`,
        {
          responseType: 'blob',
          withCredentials: true,
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // Create blob URL and trigger download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename
      const doType = order.doType || 'DO';
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `${doType}_${order.doNumber}_${timestamp}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.update(toastId, {
        render: `PDF downloaded: ${doType}-${order.doNumber}`,
        type: 'success',
        isLoading: false,
        autoClose: 4000,
      });
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      toast.update(toastId, {
        render: `PDF download failed: ${errorMessage}`,
        type: 'error',
        isLoading: false,
        autoClose: 6000,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75 no-print"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
          {/* Header */}
          <div className={`${order.isCancelled ? 'bg-red-600 dark:bg-red-700' : 'bg-primary-600 dark:bg-primary-700'} px-6 py-4 flex items-center justify-between no-print`}>
            <div className="flex items-center">
              {order.isCancelled && <Ban className="w-5 h-5 text-white mr-2" />}
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {order.doType || 'DO'}-{order.doNumber}
                  {order.isCancelled && ' (CANCELLED)'}
                </h3>

              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className={`p-2 text-white rounded ${
                  isDownloading 
                    ? 'opacity-50 cursor-not-allowed' 
                    : order.isCancelled 
                      ? 'hover:bg-red-700' 
                      : 'hover:bg-primary-700'
                }`}
                title="Download PDF"
              >
                {isDownloading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </button>
              {onEdit && !order.isCancelled && (
                <button
                  onClick={onEdit}
                  className="p-2 text-white hover:bg-primary-700 rounded"
                  title="Edit DO"
                >
                  <Edit className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={onClose}
                className={`p-2 text-white rounded ${order.isCancelled ? 'hover:bg-red-700' : 'hover:bg-primary-700'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Cancellation Notice */}
          {order.isCancelled && (
            <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700 px-6 py-3 no-print">
              <div className="flex items-start">
                <Ban className="w-5 h-5 text-red-500 dark:text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    This delivery order has been cancelled
                  </p>
                  {order.cancellationReason && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      Reason: {order.cancellationReason}
                    </p>
                  )}
                  {order.cancelledAt && (
                    <p className="text-xs text-red-500 dark:text-red-500 mt-1">
                      Cancelled on: {formatSystemDate(order.cancelledAt)}
                      {order.cancelledBy && ` by ${order.cancelledBy}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Content - Show the actual DO form */}
          <div className="bg-white px-6 py-6 print:p-0 overflow-x-auto">
            <DeliveryNotePrint order={order} showOnScreen={true} />
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 flex justify-end space-x-3 no-print transition-colors">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            {onEdit && !order.isCancelled && (
              <button
                onClick={onEdit}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Edit
              </button>
            )}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                isDownloading
                  ? 'bg-primary-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {isDownloading ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DODetailModal;
