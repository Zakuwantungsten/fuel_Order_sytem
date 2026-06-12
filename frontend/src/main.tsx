import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import '@fontsource-variable/jetbrains-mono';
import App from './App.tsx';
import './index.css';

// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,           // Consider data fresh for 30 seconds (was 5 min — caused stale reads after WebSocket pushes)
      gcTime: 10 * 60 * 1000,        // Keep unused data in cache for 10 minutes (formerly cacheTime)
      // Focus refetch is OFF: WebSocket sync (useRealtimeSync at app level)
      // already invalidates affected queries on every data change, so refiring
      // all active queries on each alt-tab back only duplicated requests.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,       // Refetch when internet reconnects (covers missed WebSocket events)
      retry: 1,                       // Retry failed requests once
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
