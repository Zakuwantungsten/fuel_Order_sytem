interface UnifiedTabLoaderProps {
  label?: string;
  title?: string;
  subtitle?: string;
  heightClassName?: string;
}

export default function UnifiedTabLoader({
  label = 'Loading...',
  title,
  subtitle,
  heightClassName = 'h-64',
}: UnifiedTabLoaderProps) {
  const effectiveLabel = title || label;

  return (
    <div className={`flex items-center justify-center ${heightClassName}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        <p className="text-sm text-gray-600 dark:text-gray-400">{effectiveLabel}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}
