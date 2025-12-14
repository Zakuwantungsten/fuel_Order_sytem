import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // Consider data fresh for 5 minutes
      gcTime: 10 * 60 * 1000,        // Keep unused data in cache for 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: true,     // Refetch when user returns to window
      refetchOnReconnect: true,       // Refetch when internet reconnects
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
