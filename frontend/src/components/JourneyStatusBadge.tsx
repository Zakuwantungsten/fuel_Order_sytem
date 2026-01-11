import React from 'react';
import { JourneyStatus } from '../types';

interface JourneyStatusBadgeProps {
  status?: JourneyStatus;
  queueOrder?: number;
  size?: 'sm' | 'md' | 'lg';
}

const JourneyStatusBadge: React.FC<JourneyStatusBadgeProps> = ({ 
  status = 'active', 
  queueOrder,
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const statusConfig = {
    active: {
      label: 'ACTIVE',
      icon: '🚛',
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-800 dark:text-green-300',
      border: 'border-green-300 dark:border-green-700',
    },
    queued: {
      label: queueOrder ? `QUEUED #${queueOrder}` : 'QUEUED',
      icon: '⏳',
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-800 dark:text-yellow-300',
      border: 'border-yellow-300 dark:border-yellow-700',
    },
    completed: {
      label: 'COMPLETED',
      icon: '✓',
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-600 dark:text-gray-400',
      border: 'border-gray-300 dark:border-gray-600',
    },
    cancelled: {
      label: 'CANCELLED',
      icon: '✗',
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-800 dark:text-red-300',
      border: 'border-red-300 dark:border-red-700',
    },
  };

  const config = statusConfig[status];

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-semibold rounded-md border
        ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}
      `}
      title={`Journey Status: ${config.label}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

export default JourneyStatusBadge;
