import React from 'react';
import { X, Download } from 'lucide-react';

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string;
  title: string;
  artist: string;
  onClose: () => void;
}

export default function ImagePreviewModal({
  isOpen,
  imageUrl,
  title,
  artist,
  onClose
}: ImagePreviewModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl max-h-90vh overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 transition-colors z-10"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="relative bg-black flex flex-col h-full">
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <img
              src={imageUrl}
              alt={title}
              className="max-h-96 max-w-full object-contain"
            />
          </div>

          <div className="bg-gray-900 text-white p-6 border-t border-gray-700">
            <h2 className="text-2xl font-bold mb-2">{title}</h2>
            <p className="text-gray-300 mb-4">by {artist}</p>

            <div className="flex gap-3">
              <a
                href={imageUrl}
                download
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
              <button
                onClick={onClose}
                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
