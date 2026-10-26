import { X } from 'lucide-react';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
}

const tones = {
  success: 'border-note/40 bg-note-light text-note',
  error: 'border-seal/40 bg-seal-light text-seal',
  warning: 'border-ochre/40 bg-ochre-light text-ochre',
  info: 'border-ink/20 bg-paper-mat text-ink',
};

export default function Alert({ type, message, onClose }: AlertProps) {
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex items-center gap-3 rounded-[3px] border px-4 py-3 text-sm ${tones[type]}`}>
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
