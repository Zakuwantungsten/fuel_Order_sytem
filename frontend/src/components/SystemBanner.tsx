import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, AlertCircle, CheckCircle, Megaphone } from 'lucide-react';
import announcementService, { SystemAnnouncement } from '../services/announcementService';
import { subscribeToAnnouncementEvents, unsubscribeFromAnnouncementEvents } from '../services/websocket';

const SESSION_DISMISSED_KEY = 'dismissed_announcements';

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  sessionStorage.setItem(SESSION_DISMISSED_KEY, JSON.stringify([...ids]));
}

const SEVERITY_STYLES = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/60',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-200',
    icon: Info,
    iconColor: 'text-blue-500 dark:text-blue-400',
    bar: 'bg-blue-500',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/60',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-500 dark:text-amber-400',
    bar: 'bg-amber-500',
  },
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/60',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: AlertCircle,
    iconColor: 'text-red-500 dark:text-red-400',
    bar: 'bg-red-600',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-950/60',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-200',
    icon: CheckCircle,
    iconColor: 'text-green-500 dark:text-green-400',
    bar: 'bg-green-500',
  },
};

interface SystemBannerProps {
  userRole?: string;
}

export default function SystemBanner({ userRole: _userRole }: SystemBannerProps) {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);

  const load = async () => {
    try {
      const data = await announcementService.getActive();
      setAnnouncements(data);
    } catch {
      // silently fail — banners are non-critical
    }
  };

  useEffect(() => {
    load();

    subscribeToAnnouncementEvents((event) => {
      if (event.action === 'deleted') {
        setAnnouncements((prev) => prev.filter((a) => a._id !== event.announcement._id));
      } else if (event.action === 'created') {
        // Re-fetch so we respect the server-side role/date filtering
        load();
      } else if (event.action === 'updated') {
        load();
      }
    });

    return () => unsubscribeFromAnnouncementEvents();
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  const visible = announcements.filter((a) => !dismissed.has(a._id));

  if (visible.length === 0) return null;

  return (
    <div className="w-full z-40 space-y-0.5">
      {visible.map((ann) => {
        const style = SEVERITY_STYLES[ann.severity] ?? SEVERITY_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={ann._id}
            className={`relative w-full border-b ${style.bg} ${style.border} ${style.text} transition-all duration-300`}
          >
            {/* left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} />

            <div className="flex items-start gap-3 px-4 py-3 pl-5">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
              <Megaphone className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50 ${style.iconColor}`} />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm mr-2">{ann.title}</span>
                <span className="text-sm opacity-90">{ann.message}</span>
              </div>
              {ann.isDismissible && (
                <button
                  onClick={() => dismiss(ann._id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors ml-2"
                  aria-label="Dismiss"
                >
                  <X className="w-3.5 h-3.5 opacity-60" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
