import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

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
  duration = 3000 
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-30 backdrop-blur-sm" />
      
      {/* Success message */}
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform animate-in zoom-in-95 duration-300">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    </div>
  );
}