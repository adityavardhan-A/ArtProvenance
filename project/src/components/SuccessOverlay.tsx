import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Rosette from './Rosette';

interface SuccessOverlayProps {
  isVisible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function SuccessOverlay({
  isVisible,
  title,
  message,
  onClose,
  duration = 1800,
}: SuccessOverlayProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
        navigate('/dashboard');
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose, navigate]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="status">
      <div className="absolute inset-0 bg-paper/80 backdrop-blur-sm" />
      <div className="relative flex animate-rise flex-col items-center px-6 text-center">
        <Rosette detail="seal" size={96} className="text-note" />
        <h3 className="mt-5 text-3xl">{title}</h3>
        <p className="mt-2 max-w-sm text-ink-soft">{message}</p>
      </div>
    </div>
  );
}
