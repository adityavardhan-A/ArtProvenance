import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, ArtworkMetadata } from '../lib/supabase';
import BackButton from '../components/BackButton';
import Alert from '../components/Alert';
import { Image, Calendar, Hash, Shield, CreditCard as Edit3, Trash2, Save, X } from 'lucide-react';

export default function ManageArtworksPage() {
  const [userArtworks, setUserArtworks] = useState<ArtworkMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingArtwork, setEditingArtwork] = useState<string | null>(null);
  const [artworkData, setArtworkData] = useState({ title: '', description: '' });
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const { user } = useAuth();

  useEffect(() => {
    fetchUserArtworks();
  }, [user]);

  const fetchUserArtworks = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('artwork_metadata')
        .select('*')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setUserArtworks(data || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEditArtwork = (artwork: ArtworkMetadata) => {
    setEditingArtwork(artwork.id);
    setArtworkData({
      title: artwork.title,
      description: artwork.description || ''
    });
  };

  const handleUpdateArtwork = async (artworkId: string) => {
    try {
      const { error } = await supabase
        .from('artwork_metadata')
        .update({
          title: artworkData.title,
          description: artworkData.description
        })
        .eq('id', artworkId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Artwork updated successfully!' });
      setEditingArtwork(null);
      fetchUserArtworks();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleDeleteArtwork = async (artworkId: string, imageUrl: string) => {
    if (!confirm('Are you sure you want to delete this artwork? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete from database
      const { error: dbError } = await supabase
        .from('artwork_metadata')
        .delete()
        .eq('id', artworkId)
        .eq('user_id', user?.id);

      if (dbError) throw dbError;

      // Delete from storage
      const fileName = imageUrl.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('artworks')
          .remove([`${user?.id}/${fileName}`]);
      }

      setMessage({ type: 'success', text: 'Artwork deleted successfully!' });
      fetchUserArtworks();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <BackButton />
        </div>

        {message && (
          <div className="mb-6">
            <Alert 
              type={message.type} 
              message={message.text} 
              onClose={() => setMessage(null)} 
            />
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Manage Your Artworks</h1>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : userArtworks.length === 0 ? (
            <div className="text-center py-12">
              <Image className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No artworks yet</h3>
              <p className="text-gray-600">Upload your first artwork to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userArtworks.map((artwork) => (
                <div key={artwork.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="aspect-video bg-gray-100">
                    <img
                      src={artwork.image_url}
                      alt={artwork.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  <div className="p-4">
                    {editingArtwork === artwork.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={artworkData.title}
                          onChange={(e) => setArtworkData({...artworkData, title: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Artwork title"
                        />
                        <textarea
                          value={artworkData.description}
                          onChange={(e) => setArtworkData({...artworkData, description: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          rows={3}
                          placeholder="Artwork description"
                        />
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdateArtwork(artwork.id)}
                            className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                          >
                            <Save className="h-4 w-4 inline mr-1" />
                            Save
                          </button>
                          <button
                            onClick={() => setEditingArtwork(null)}
                            className="flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-semibold text-gray-900 mb-2">{artwork.title}</h3>
                        {artwork.description && (
                          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{artwork.description}</p>
                        )}
                        
                        <div className="text-xs text-gray-500 mb-3">
                          <Calendar className="h-4 w-4 inline mr-1" />
                          {new Date(artwork.uploaded_at).toLocaleDateString()}
                        </div>

                        {artwork.hash && (
                          <div className="mb-3">
                            <div className="flex items-center space-x-2 mb-1">
                              <Hash className="h-3 w-3 text-gray-400" />
                              <span className="text-xs text-gray-500 font-medium">SHA256 Hash:</span>
                            </div>
                            <p className="font-mono text-gray-400 break-all text-[10px] leading-tight bg-gray-50 p-2 rounded">
                              {artwork.hash}
                            </p>
                            <div className="flex items-center space-x-1 mt-2">
                              <Shield className="h-3 w-3 text-green-600" />
                              <span className="text-xs text-green-600">Blockchain Verified</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditArtwork(artwork)}
                            className="flex-1 flex items-center justify-center px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm"
                          >
                            <Edit3 className="h-4 w-4 mr-1" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteArtwork(artwork.id, artwork.image_url)}
                            className="flex-1 flex items-center justify-center px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}