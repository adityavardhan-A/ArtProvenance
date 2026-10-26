import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import WalletButton from './WalletButton';
import { Palette, User } from 'lucide-react';

export default function Navbar() {
  const { user, profile } = useAuth();

  if (!user) return null;

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <Palette className="h-8 w-8 text-indigo-600" />
              <span className="text-xl font-bold text-gray-900">ArtProvenance</span>
            </Link>
          </div>
          
          <div className="flex items-center space-x-4">
            <WalletButton />
            <Link
              to="/account"
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <User className="h-4 w-4" />
              <span>Account</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}