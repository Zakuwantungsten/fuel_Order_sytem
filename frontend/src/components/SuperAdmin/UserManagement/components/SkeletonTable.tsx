interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  showCheckbox?: boolean;
}

function SkeletonCell({ width }: { width: string }) {
  return (
    <td className="px-4 py-4">
      <div className={`h-4 ${width} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />
    </td>
  );
}

function SkeletonRow({ columns, showCheckbox }: { columns: number; showCheckbox: boolean }) {
  const widths = ['w-48', 'w-36', 'w-28', 'w-24', 'w-20', 'w-32', 'w-28', 'w-16'];
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      {showCheckbox && (
        <td className="px-4 py-4 w-12">
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </td>
      )}
      {/* Avatar + name cell */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 dark:bg-gray-750 rounded animate-pulse" />
          </div>
        </div>
      </td>
      {Array.from({ length: columns - 1 }).map((_, i) => (
        <SkeletonCell key={i} width={widths[i % widths.length]} />
      ))}
    </tr>
  );
}

export default function SkeletonTable({
  rows = 8,
  columns = 7,
  showCheckbox = true,
}: SkeletonTableProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Loading users">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {showCheckbox && (
                <th className="px-4 py-3 w-12">
                  <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </th>
              )}
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <div
                    className={`h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${
                      i === 0 ? 'w-20' : i === columns - 1 ? 'w-8' : 'w-16'
                    }`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonRow
                key={i}
                columns={columns}
                showCheckbox={showCheckbox}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
