import { WifiOff, Wifi } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const NetworkStatusBanner = () => {
  const { isOnline, showReconnected } = useNetworkStatus();

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[500] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white select-none transition-colors duration-300 ${
        !isOnline
          ? 'bg-red-600 dark:bg-red-700'
          : 'bg-emerald-600 dark:bg-emerald-700'
      }`}
      role="status"
      aria-live="polite"
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>No internet connection — changes may not be saved</span>
          <span className="flex gap-1 ml-1" aria-hidden="true">
            <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce [animation-delay:300ms]" />
          </span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 flex-shrink-0" />
          <span>Back online</span>
        </>
      )}
    </div>
  );
};

export default NetworkStatusBanner;
