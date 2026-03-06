import { useCallback } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { usersAPI, systemAdminAPI } from '../../../../services/api';
import { userQueryKeys } from './useUsers';
import type { User } from '../../../../types';

// ── Cache shape ──────────────────────────────────────────────────────────────
type PaginatedData = {
  data: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

type CacheSnapshot = [QueryKey, PaginatedData | undefined][];

/**
 * Provides optimistic mutation helpers for user actions.
 * Each mutation updates the React Query cache immediately,
 * then commits the real API call. On failure, the cache is rolled back.
 */
export function useOptimisticMutations() {
  const queryClient = useQueryClient();

  // ── Cache helpers ────────────────────────────────────────────────────────
  const snapshot = useCallback((): CacheSnapshot => {
    return queryClient.getQueriesData<PaginatedData>({ queryKey: userQueryKeys.all });
  }, [queryClient]);

  const rollback = useCallback((snap: CacheSnapshot) => {
    snap.forEach(([key, data]) => {
      queryClient.setQueryData(key, data);
    });
  }, [queryClient]);

  const updateUserInCache = useCallback(
    (userId: string, updater: (user: User) => User) => {
      queryClient.setQueriesData<PaginatedData>(
        { queryKey: userQueryKeys.all },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((u) => {
              const uid = String(u.id || (u as any)._id);
              return uid === userId ? updater({ ...u }) : u;
            }),
          };
        },
      );
    },
    [queryClient],
  );

  const removeUserFromCache = useCallback(
    (userId: string) => {
      queryClient.setQueriesData<PaginatedData>(
        { queryKey: userQueryKeys.all },
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.filter(
              (u) => String(u.id || (u as any)._id) !== userId,
            ),
            pagination: {
              ...old.pagination,
              total: Math.max(0, old.pagination.total - 1),
            },
          };
        },
      );
    },
    [queryClient],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
  }, [queryClient]);

  const cancelQueries = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: userQueryKeys.all });
  }, [queryClient]);

  // ── Optimistic toggle (for use with undo toast) ────────────────────────
  // Returns { snapshot, apply, revert } so the caller can wire it to the
  // undo toast pattern: apply() immediately, revert() on undo, commit on expiry.
  const prepareOptimisticToggle = useCallback(
    (userId: string) => {
      const snap = snapshot();
      return {
        apply: async () => {
          await cancelQueries();
          updateUserInCache(userId, (u) => ({ ...u, isActive: !u.isActive }));
        },
        revert: () => rollback(snap),
        commit: async () => {
          try {
            await usersAPI.toggleStatus(userId);
          } finally {
            invalidate();
          }
        },
      };
    },
    [snapshot, rollback, updateUserInCache, cancelQueries, invalidate],
  );

  // ── Ban mutation ─────────────────────────────────────────────────────────
  const banMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      usersAPI.ban(userId, reason),
    onMutate: async ({ userId }) => {
      await cancelQueries();
      const snap = snapshot();
      updateUserInCache(userId, (u) => ({
        ...u,
        isBanned: true,
        isActive: false,
      }));
      return { snap };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snap) rollback(ctx.snap);
      toast.error('Failed to ban user');
    },
    onSettled: () => invalidate(),
  });

  // ── Unban mutation ───────────────────────────────────────────────────────
  const unbanMutation = useMutation({
    mutationFn: (userId: string) => usersAPI.unban(userId),
    onMutate: async (userId) => {
      await cancelQueries();
      const snap = snapshot();
      updateUserInCache(userId, (u) => ({ ...u, isBanned: false }));
      return { snap };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snap) rollback(ctx.snap);
      toast.error('Failed to unban user');
    },
    onSettled: () => invalidate(),
  });

  // ── Delete mutation ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (userId: string) => usersAPI.delete(userId),
    onMutate: async (userId) => {
      await cancelQueries();
      const snap = snapshot();
      removeUserFromCache(userId);
      return { snap };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snap) rollback(ctx.snap);
      toast.error('Failed to delete user');
    },
    onSettled: () => invalidate(),
  });

  // ── Force logout mutation ────────────────────────────────────────────────
  const forceLogoutMutation = useMutation({
    mutationFn: (userId: string) => systemAdminAPI.forceLogout(userId),
    onSettled: () => invalidate(),
  });

  return {
    prepareOptimisticToggle,
    banUser: banMutation.mutateAsync,
    unbanUser: unbanMutation.mutateAsync,
    deleteUser: deleteMutation.mutateAsync,
    forceLogout: forceLogoutMutation.mutateAsync,
    isMutating:
      banMutation.isPending ||
      unbanMutation.isPending ||
      deleteMutation.isPending ||
      forceLogoutMutation.isPending,
  };
}
