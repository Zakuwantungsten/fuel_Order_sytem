import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Edit, Undo2, XCircle, RotateCcw } from 'lucide-react';
import type { FuelRecord } from '../types';

export type FuelRecordActionsPosition = {
  top?: number;
  bottom?: number;
  left: number;
};

interface FuelRecordActionsModalProps {
  record: FuelRecord | null;
  position: FuelRecordActionsPosition | null;
  canUncancel: boolean;
  onClose: () => void;
  onEdit: (record: FuelRecord) => void;
  onCancel: (record: FuelRecord) => void;
  onComplete: (record: FuelRecord) => void;
  onUncomplete: (record: FuelRecord) => void;
  onUncancel: (record: FuelRecord) => void;
}

export function actionsMenuPositionFromEvent(event: React.MouseEvent<HTMLButtonElement>): FuelRecordActionsPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  const DROPDOWN_HEIGHT = 220;
  const DROPDOWN_WIDTH = 224;
  const left = Math.max(10, Math.min(rect.right - DROPDOWN_WIDTH, window.innerWidth - DROPDOWN_WIDTH - 10));
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow >= DROPDOWN_HEIGHT) {
    return { top: rect.bottom + 4, left };
  }
  return { bottom: window.innerHeight - rect.top + 4, left };
}

export default function FuelRecordActionsModal({
  record,
  position,
  canUncancel,
  onClose,
  onEdit,
  onCancel,
  onComplete,
  onUncomplete,
  onUncancel,
}: FuelRecordActionsModalProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isCancelled = record?.isCancelled === true;
  const isActive = !isCancelled && record?.journeyStatus === 'active';
  const canUndoComplete =
    !isCancelled && record?.journeyStatus === 'completed' && record?.manuallyCompleted === true;

  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [record, onClose]);

  if (!record || !position) return null;

  const itemClass =
    'flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700';

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Fuel record actions"
      className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-xl z-[9999]"
      style={{
        top: position.top !== undefined ? `${position.top}px` : 'auto',
        bottom: position.bottom !== undefined ? `${position.bottom}px` : 'auto',
        left: `${position.left}px`,
        maxWidth: 'calc(100vw - 20px)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="py-1">
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
          Actions
        </div>
        <div className="px-3 pb-2 text-xs text-gray-500 dark:text-gray-400 truncate">
          {record.truckNo}{record.goingDo ? ` · ${record.goingDo}` : ''}
        </div>

        {!isCancelled && (
          <>
            <button type="button" role="menuitem" onClick={() => onEdit(record)} className={itemClass}>
              <Edit className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onCancel(record)}
              className="flex items-center w-full px-4 py-2 text-left text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </button>
            {isActive && (
              <button
                type="button"
                role="menuitem"
                onClick={() => onComplete(record)}
                className="flex items-center w-full px-4 py-2 text-left text-sm text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark complete
              </button>
            )}
            {canUndoComplete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => onUncomplete(record)}
                className="flex items-center w-full px-4 py-2 text-left text-sm text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
              >
                <Undo2 className="w-4 h-4 mr-2" />
                Undo complete
              </button>
            )}
          </>
        )}
        {isCancelled && canUncancel && (
          <button
            type="button"
            role="menuitem"
            onClick={() => onUncancel(record)}
            className="flex items-center w-full px-4 py-2 text-left text-sm text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Uncancel
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
