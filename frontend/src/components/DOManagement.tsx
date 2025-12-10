// This component wraps your existing Delivery Orders functionality
// with the new design interface
import DeliveryOrders from '../pages/DeliveryOrders';

interface DOManagementProps {
  user?: any;
}

export function DOManagement({ user }: DOManagementProps) {
  // Pass user to DeliveryOrders for role-based DO type selection
  return (
    <div>
      <DeliveryOrders user={user} />
    </div>
  );
}

export default DOManagement;