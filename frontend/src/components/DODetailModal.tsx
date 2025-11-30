import { X, Printer, Edit } from 'lucide-react';
import { DeliveryOrder } from '../types';
import DeliveryNotePrint from './DeliveryNotePrint';

interface DODetailModalProps {
  order: DeliveryOrder;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onPrint?: () => void;
}

const DODetailModal = ({ order, isOpen, onClose, onEdit, onPrint }: DODetailModalProps) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      // Use regular window.print with improved styles
      window.print();
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
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
          {/* Header */}
          <div className="bg-primary-600 px-6 py-4 flex items-center justify-between no-print">
            <h3 className="text-lg font-semibold text-white">
              {order.doType || 'DO'}-{order.doNumber}
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="p-2 text-white hover:bg-primary-700 rounded"
                title="Print DO"
              >
                <Printer className="w-5 h-5" />
              </button>
              {onEdit && (
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
                className="p-2 text-white hover:bg-primary-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content - Show the actual DO form */}
          <div className="bg-white px-6 py-6 print:p-0">
            <DeliveryNotePrint order={order} showOnScreen={true} />
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 no-print">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Close
            </button>
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
              </button>
            )}
            <button
              onClick={handlePrint}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              Print DO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DODetailModal;
