import { Lock } from 'lucide-react';

interface EditLockBadgeProps {
  editLock?: {
    lockedBy?: string;
    lockedByName?: string;
    lockedAt?: string;
    lockedUntil?: string;
  };
}

const EditLockBadge = ({ editLock }: EditLockBadgeProps) => {
  if (!editLock?.lockedBy) return null;

  const now = new Date();
  const until = editLock.lockedUntil ? new Date(editLock.lockedUntil) : null;

  if (until && until <= now) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <Lock className="w-3 h-3" />
      Editing: {editLock.lockedByName || 'someone'}
    </span>
  );
};

export default EditLockBadge;
