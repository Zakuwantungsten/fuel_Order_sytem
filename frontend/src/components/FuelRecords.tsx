// This component wraps your existing Fuel Records functionality
// with the new design interface
import FuelRecordsPage from '../pages/FuelRecords';

interface FuelRecordsProps {
  user?: any;
}

export function FuelRecords({ user: _user }: FuelRecordsProps) {
  // Your existing FuelRecords component with enhanced styling
  return (
    <div>
      <FuelRecordsPage />
    </div>
  );
}

export default FuelRecords;