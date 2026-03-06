import {
  Mail, Briefcase, MapPin, Calendar, Clock, Truck, Hash,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { User } from '../../../../../types';
import RelativeTime from '../RelativeTime';

interface OverviewTabProps {
  user: User;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '--';
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, 'MMM d, yyyy h:mm a') : '--';
}

interface InfoRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}

function InfoRow({ icon: Icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5 break-words">
          {value || '--'}
        </dd>
      </div>
    </div>
  );
}

export default function OverviewTab({ user }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Contact Information */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Contact Information
        </h3>
        <dl className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 divide-y divide-gray-200 dark:divide-gray-700">
          <InfoRow icon={Mail} label="Email" value={user.email} />
          <InfoRow icon={Hash} label="Username" value={`@${user.username}`} />
        </dl>
      </section>

      {/* Organization */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Organization
        </h3>
        <dl className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 divide-y divide-gray-200 dark:divide-gray-700">
          <InfoRow icon={Briefcase} label="Department" value={user.department} />
          <InfoRow icon={MapPin} label="Station" value={user.station} />
          {user.yard && <InfoRow icon={MapPin} label="Yard" value={user.yard} />}
          {user.truckNo && <InfoRow icon={Truck} label="Truck No" value={user.truckNo} />}
        </dl>
      </section>

      {/* Account Dates */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Account Timeline
        </h3>
        <dl className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 divide-y divide-gray-200 dark:divide-gray-700">
          <InfoRow icon={Calendar} label="Created" value={formatDate(user.createdAt)} />
          {user.createdBy && (
            <InfoRow icon={Hash} label="Created By" value={user.createdBy} />
          )}
          <InfoRow
            icon={Clock}
            label="Last Login"
            value={<RelativeTime date={user.lastLogin} fallback="Never" />}
          />
          {user.lastModifiedAt && (
            <InfoRow icon={Clock} label="Last Modified" value={formatDate(user.lastModifiedAt)} />
          )}
          {user.lastModifiedBy && (
            <InfoRow icon={Hash} label="Modified By" value={user.lastModifiedBy} />
          )}
          {user.accountExpiresAt && (
            <InfoRow icon={Calendar} label="Account Expires" value={formatDate(user.accountExpiresAt)} />
          )}
        </dl>
      </section>

      {/* Ban Info (if banned) */}
      {user.isBanned && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Ban Details
          </h3>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2 text-sm">
            {user.bannedReason && (
              <div>
                <span className="text-red-600 dark:text-red-400 font-medium">Reason: </span>
                <span className="text-red-800 dark:text-red-200">{user.bannedReason}</span>
              </div>
            )}
            {user.bannedBy && (
              <div>
                <span className="text-red-600 dark:text-red-400 font-medium">Banned by: </span>
                <span className="text-red-800 dark:text-red-200">{user.bannedBy}</span>
              </div>
            )}
            {user.bannedAt && (
              <div>
                <span className="text-red-600 dark:text-red-400 font-medium">Date: </span>
                <span className="text-red-800 dark:text-red-200">{formatDate(user.bannedAt)}</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
