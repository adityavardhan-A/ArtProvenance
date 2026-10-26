import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info, X } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ type, title, message, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const iconColors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
  };

  const Icon = icons[type];

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md w-full">
      <div className={`rounded-lg border p-4 shadow-lg ${colors[type]} animate-in slide-in-from-top-2 duration-300`}>
        <div className="flex items-start">
          <Icon className={`h-5 w-5 mr-3 mt-0.5 ${iconColors[type]}`} />
          <div className="flex-1">
            <h4 className="font-semibold text-sm mb-1">{title}</h4>
            <p className="text-sm opacity-90">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}