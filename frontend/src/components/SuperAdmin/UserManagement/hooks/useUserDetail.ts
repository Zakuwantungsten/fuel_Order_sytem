import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersAPI } from '../../../../services/api';
import type { DrawerTab } from '../types';
import { userQueryKeys } from './useUsers';

export function useUserDetail() {
  const queryClient = useQueryClient();
  const [drawerUserId, setDrawerUserId] = useState<string | number | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');

  const isOpen = drawerUserId !== null;

  const {
    data: userDetail,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: userQueryKeys.detail(drawerUserId!),
    queryFn: () => usersAPI.getDetail(drawerUserId!),
    enabled: isOpen,
    staleTime: 15_000,
  });

  const openDrawer = useCallback((userId: string | number, tab?: DrawerTab) => {
    setDrawerUserId(userId);
    setActiveTab(tab || 'overview');
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerUserId(null);
    setActiveTab('overview');
  }, []);

  const switchTab = useCallback((tab: DrawerTab) => {
    setActiveTab(tab);
  }, []);

  const invalidateDetail = useCallback(() => {
    if (drawerUserId) {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.detail(drawerUserId) });
    }
  }, [drawerUserId, queryClient]);

  return {
    isOpen,
    userId: drawerUserId,
    activeTab,
    userDetail: userDetail || null,
    isLoading,
    isError,
    openDrawer,
    closeDrawer,
    switchTab,
    refetch,
    invalidateDetail,
  };
}
