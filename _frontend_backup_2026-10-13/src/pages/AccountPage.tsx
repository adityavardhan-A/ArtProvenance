import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase, ArtworkMetadata } from '../lib/supabase';
import BackButton from '../components/BackButton';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { User, Mail, Calendar, LogOut, CreditCard as Edit3, Trash2, Save, X, Image, Hash, Shield, Settings, FolderOpen } from 'lucide-react';

export default function AccountPage() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    full_name: profile?.full_name || '',
    email: profile?.email || ''
  });
  const [toast, setToast] = useState<{type: 'success' | 'error' | 'warning', title: string, message: string} | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileData({
        full_name: profile.full_name || '',
        email: profile.email || ''
      });
    }
  }, [profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleUpdateProfile = async () => {
    try {
      const { error } = await updateProfile(profileData);
      if (error) throw error;
      
      setToast({ type: 'success', title: 'Profile Updated', message: 'Your profile has been updated successfully' });
      setEditingProfile(false);
    } catch (error: any) {
      setToast({ type: 'error', title: 'Update Failed', message: error.message });
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <BackButton />
        </div>

        {toast && (
          <Toast 
            type={toast.type} 
            title={toast.title}
            message={toast.message} 
            onClose={() => setToast(null)} 
          />
        )}

        <ConfirmDialog
          isOpen={showLogoutDialog}
          title="Confirm Logout"
          message="Are you sure you want to logout? You will need to sign in again to access your account."
          confirmText="Logout"
          cancelText="Cancel"
          onConfirm={handleSignOut}
          onCancel={() => setShowLogoutDialog(false)}
          type="warning"
        />

        <div className="max-w-2xl mx-auto">
          {/* Profile Section */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-8">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <User className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      {profile?.full_name || 'Your Account'}
                    </h1>
                    <p className="text-indigo-100">Digital Artist</p>
                  </div>
                </div>
              </div>

              {/* Profile Details */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
                  <button
                    onClick={() => setEditingProfile(!editingProfile)}
                    className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                  >
                    {editingProfile ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                  </button>
                </div>
                
                <div className="space-y-4">
                  {editingProfile ? (
                    <>
                      <div>
                        <input
                          type="text"
                          value={profileData.full_name}
                          onChange={(e) => setProfileData({...profileData, full_name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                          placeholder="Full Name"
                        />
                      </div>
                      <div>
                        <input
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                          placeholder="Email Address"
                        />
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleUpdateProfile}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </button>
                        <button
                          onClick={() => setEditingProfile(false)}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                        <User className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Full Name</p>
                          <p className="text-gray-900">{profile?.full_name || 'Not provided'}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                        <Mail className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Email Address</p>
                          <p className="text-gray-900">{user.email}</p>
                        </div>
                      </div>

                      {profile?.created_at && (
                        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                          <Calendar className="h-5 w-5 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Member Since</p>
                            <p className="text-gray-900">
                              {new Date(profile.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-gray-200 px-6 py-4">
                <div className="space-y-3">
                  <Link
                    to="/manage-artworks"
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>Manage Artworks</span>
                  </Link>
                <button
                  onClick={() => setShowLogoutDialog(true)}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
                </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}