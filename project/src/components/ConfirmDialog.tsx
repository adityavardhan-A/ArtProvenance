import { useEffect } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative w-full max-w-md animate-rise rounded-md border border-ink/15 bg-paper-mat p-7 shadow-2xl">
        <h3 id="confirm-title" className="text-2xl">{title}</h3>
        <p className="mt-3 text-[15px] text-ink-soft">{message}</p>
        <div className="mt-7 flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary" autoFocus>
            {cancelText}
          </button>
          <button onClick={onConfirm} className={type === 'danger' ? 'btn-danger' : 'btn-primary'}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
