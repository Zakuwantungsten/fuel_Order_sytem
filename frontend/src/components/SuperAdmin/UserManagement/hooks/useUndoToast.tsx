import { useCallback, useRef } from 'react';
import { toast } from 'react-toastify';

interface UndoToastOptions {
  /** Message shown in the toast */
  message: string;
  /** Called if the user does NOT click undo within the timeout */
  onCommit: () => void | Promise<void>;
  /** Called if the user clicks undo */
  onUndo: () => void | Promise<void>;
  /** Timeout in milliseconds before auto-commit (default 5000) */
  timeout?: number;
}

export function useUndoToast() {
  const pendingRef = useRef<{
    timeoutId: ReturnType<typeof setTimeout>;
    toastId: string | number;
  } | null>(null);

  const clearPending = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timeoutId);
      pendingRef.current = null;
    }
  }, []);

  const trigger = useCallback(({ message, onCommit, onUndo, timeout = 5000 }: UndoToastOptions) => {
    // If there's already a pending undo, commit the previous one immediately
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timeoutId);
      toast.dismiss(pendingRef.current.toastId);
      pendingRef.current = null;
    }

    const toastId = toast(
      ({ closeToast }) => {
        const handleUndo = async () => {
          clearPending();
          if (closeToast) closeToast();
          try {
            await onUndo();
          } catch {
            // undo failed silently
          }
        };

        return (
          <div className="flex items-center justify-between gap-3 min-w-0">
            <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{message}</span>
            <button
              onClick={handleUndo}
              className="flex-shrink-0 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              Undo
            </button>
          </div>
        );
      },
      {
        autoClose: timeout,
        closeOnClick: false,
        draggable: false,
        pauseOnHover: true,
        onClose: () => {
          // Auto-commit when toast closes (timeout expired and user didn't click undo)
          if (pendingRef.current?.toastId === toastId) {
            clearPending();
            Promise.resolve(onCommit()).catch(() => {});
          }
        },
      }
    );

    const timeoutId = setTimeout(() => {
      // This path is a backup; onClose above handles the normal flow
    }, timeout + 500);

    pendingRef.current = { timeoutId, toastId };
  }, [clearPending]);

  return { trigger };
}
