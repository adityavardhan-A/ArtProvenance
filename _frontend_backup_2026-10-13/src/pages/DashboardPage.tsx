import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import UploadTab from '../components/UploadTab';
import GalleryTab from '../components/GalleryTab';
import VerifyArtworkTab from '../components/VerifyArtworkTab';
import { Upload, Image, Shield } from 'lucide-react';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'gallery' | 'upload' | 'verify'>('gallery');
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Digital Art Dashboard</h1>
          <p className="mt-2 text-lg text-gray-600">
            Manage your digital art collection with blockchain provenance
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('gallery')}
                className={`flex-1 flex items-center justify-center px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'gallery'
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Image className="h-5 w-5 mr-2" />
                Gallery
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-1 flex items-center justify-center px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'upload'
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Upload className="h-5 w-5 mr-2" />
                Upload Artwork
              </button>
              <button
                onClick={() => setActiveTab('verify')}
                className={`flex-1 flex items-center justify-center px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'verify'
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Shield className="h-5 w-5 mr-2" />
                Verify Artwork
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'gallery' && <GalleryTab />}
            {activeTab === 'upload' && <UploadTab />}
            {activeTab === 'verify' && <VerifyArtworkTab />}
          </div>
        </div>

      </div>
    </div>
  );
}