import { DeliveryOrder } from '../types';
import { formatDateOnly } from '../utils/timezone';
import DeliveryNotePrint from './DeliveryNotePrint';

interface BatchDOPrintProps {
  orders: DeliveryOrder[];
  clientName?: string;
}

const BatchDOPrint = ({ orders, clientName }: BatchDOPrintProps) => {
  return (
    <div className="hidden print:block">
      <style>{`
        @media print {
          @page { 
            size: A4;
            margin: 10mm;
          }
          body { 
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print\\:block { display: block !important; }
          .hidden { display: none !important; }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      {/* Cover Page */}
      <div className="page-break" style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px' }}>
          TAHMEED COACH TZ LTD
        </h1>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '30px' }}>
          DELIVERY ORDERS
        </h2>
        {clientName && (
          <p style={{ fontSize: '18px', marginBottom: '20px' }}>
            Client: <strong>{clientName}</strong>
          </p>
        )}
        <p style={{ fontSize: '16px', marginBottom: '10px' }}>
          Total Orders: <strong>{orders.length}</strong>
        </p>
        <p style={{ fontSize: '16px' }}>
          Date: <strong>{formatDateOnly(new Date())}</strong>
        </p>
      </div>

      {/* Individual DO Pages */}
      {orders.map((order, index) => (
        <div key={order.id} className={index < orders.length - 1 ? 'page-break' : ''}>
          <DeliveryNotePrint order={order} />
        </div>
      ))}
    </div>
  );
};

export default BatchDOPrint;
