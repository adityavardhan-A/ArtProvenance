import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  to?: string;
  className?: string;
  label?: string;
}

export default function BackButton({ to, className = '', label = 'Back' }: BackButtonProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className={`inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
