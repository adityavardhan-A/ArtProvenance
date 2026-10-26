import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
}

export default function Alert({ type, message, onClose }: AlertProps) {
  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
  };

  const colors = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  const Icon = icons[type];

  return (
    <div className={`rounded-md border p-4 ${colors[type]}`}>
      <div className="flex items-center">
        <Icon className="h-5 w-5 mr-2" />
        <span className="text-sm font-medium">{message}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto text-sm hover:opacity-75 transition-opacity"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}