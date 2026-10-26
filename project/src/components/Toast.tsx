import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onClose: () => void;
  duration?: number;
}

const tones = {
  success: 'border-l-note',
  error: 'border-l-seal',
  warning: 'border-l-ochre',
  info: 'border-l-ink',
};

const titleTones = {
  success: 'text-note',
  error: 'text-seal',
  warning: 'text-ochre',
  info: 'text-ink',
};

export default function Toast({ type, title, message, onClose, duration = 6000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className="fixed right-4 top-20 z-50 w-[min(26rem,calc(100vw-2rem))] animate-rise"
    >
      <div
        className={`flex items-start gap-3 rounded-[3px] border border-ink/15 border-l-[3px] bg-paper-mat px-4 py-3.5 shadow-[0_16px_32px_-18px_rgba(24,42,74,0.5)] ${tones[type]}`}
      >
        <div className="flex-1">
          <p className={`font-display text-[17px] leading-snug ${titleTones[type]}`}>{title}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{message}</p>
        </div>
        <button onClick={onClose} className="mt-0.5 text-ink-faint hover:text-ink" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
