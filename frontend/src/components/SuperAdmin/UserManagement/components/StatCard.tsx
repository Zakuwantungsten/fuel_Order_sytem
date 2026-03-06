interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
}: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}
