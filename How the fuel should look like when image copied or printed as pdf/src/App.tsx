import { useState } from 'react';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    role: 'fuel_order_maker' | 'boss' | 'fuel_attendant' | 'station_manager' | 'yard_personnel' | 'driver' | 'payment_manager';
    station?: string;
  } | null>(null);

  const handleLogout = () => {
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  return <Dashboard user={currentUser} onLogout={handleLogout} />;
}
