import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  to?: string;
  className?: string;
}

export default function BackButton({ to, className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4 mr-2" />
      Back
    </button>
  );
}