import React, { useState, useEffect } from 'react';
import { supabase, ArtworkMetadata } from '../lib/supabase';
import { getProvenance, type BlockchainRecord } from '../lib/contract-interactions';
import { txExplorerUrl, addressExplorerUrl } from '../lib/chain-config';
import Toast from './Toast';
import ImagePreviewModal from './ImagePreviewModal';
import { Calendar, FileText, Shield, ExternalLink, CheckCircle, XCircle, Loader, User, Eye, Clock } from 'lucide-react';

export default function GalleryTab() {
  const [artworks, setArtworks] = useState<ArtworkMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{type: 'success' | 'error' | 'warning', title: string, message: string} | null>(null);
  const [verifyingHashes, setVerifyingHashes] = useState<Set<string>>(new Set());
  const [verificationResults, setVerificationResults] = useState<
    Map<string, { verified: boolean; record?: BlockchainRecord | null; error?: string }>
  >(new Map());
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; imageUrl: string; title: string; artist: string }>({
    isOpen: false,
    imageUrl: '',
    title: '',
    artist: ''
  });

  useEffect(() => {
    fetchAllArtworks();
  }, []);

  const fetchAllArtworks = async () => {
    try {
      // Fetch all artworks from all users for universal gallery
      const { data, error } = await supabase
        .from('artwork_metadata')
        .select(`
          *,
          profiles!inner(full_name, email)
        `)
        .order('uploaded_at', { ascending: false });

      if (error) {
        throw error;
      }

      setArtworks(data || []);
    } catch (error: any) {
      setToast({ type: 'error', title: 'Loading Error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyArtwork = async (artwork: ArtworkMetadata) => {
    if (!artwork.hash) {
      setToast({ type: 'error', title: 'Verification Error', message: 'No hash available for this artwork' });
      return;
    }

    setVerifyingHashes(prev => new Set(prev).add(artwork.id));

    try {
      // Reads the record straight from the contract, so the answer does not
      // depend on our database being honest.
      const record = await getProvenance(artwork.hash);

      if (record) {
        setVerificationResults(prev => new Map(prev).set(artwork.id, {
          verified: true,
          record,
        }));
        setToast({
          type: 'success',
          title: 'Verified on chain',
          message: `Registered in block ${record.blockNumber} on ${new Date(record.timestamp).toLocaleString()}.`
        });
      } else {
        setVerificationResults(prev => new Map(prev).set(artwork.id, {
          verified: false,
          error: 'Hash not found on blockchain'
        }));
        setToast({
          type: 'warning',
          title: 'Not Found',
          message: 'Artwork hash not found on blockchain. It may not have been registered yet.'
        });
      }

    } catch (error: any) {
      setVerificationResults(prev => new Map(prev).set(artwork.id, {
        verified: false,
        error: error.message
      }));
      setToast({
        type: 'error',
        title: 'Verification Error',
        message: error.message
      });
    } finally {
      setVerifyingHashes(prev => {
        const newSet = new Set(prev);
        newSet.delete(artwork.id);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ImagePreviewModal
        isOpen={previewModal.isOpen}
        imageUrl={previewModal.imageUrl}
        title={previewModal.title}
        artist={previewModal.artist}
        onClose={() => setPreviewModal({ ...previewModal, isOpen: false })}
      />

      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Universal Art Gallery</h2>
        <p className="text-gray-600">Discover digital artworks from our community of artists</p>
      </div>

      {artworks.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No artworks yet</h3>
          <p className="text-gray-600 mb-4">
            Be the first to share your digital art with the community.
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-gray-600 mb-6">
            Showing {artworks.length} artwork{artworks.length !== 1 ? 's' : ''} from our community
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {artworks.map((artwork) => (
              <div
                key={artwork.id}
                className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 group border border-gray-100"
              >
                {/* Image */}
                <div
                  className="aspect-square overflow-hidden bg-gray-100 relative cursor-pointer"
                  onClick={() => setPreviewModal({
                    isOpen: true,
                    imageUrl: artwork.image_url,
                    title: artwork.title,
                    artist: (artwork as any).profiles?.full_name || (artwork as any).profiles?.email?.split('@')[0] || 'Anonymous Artist'
                  })}
                >
                  <img
                    src={artwork.image_url}
                    alt={artwork.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 flex items-center justify-center">
                    <Eye className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-5">
                  <h3 className="font-bold text-gray-900 mb-2 text-lg truncate">
                    {artwork.title}
                  </h3>
                  
                  {/* Artist Info */}
                  <div className="flex items-center text-sm text-gray-500 mb-3">
                    <User className="h-4 w-4 mr-1" />
                    <span>
                      {(artwork as any).profiles?.full_name || 
                       (artwork as any).profiles?.email?.split('@')[0] || 
                       'Anonymous Artist'}
                    </span>
                  </div>
                  
                  {artwork.description && (
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {artwork.description}
                    </p>
                  )}
                  
                  <div className="flex items-center text-xs text-gray-500 mb-4">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(artwork.uploaded_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>

                  {/* Recorded chain state, straight from the database row */}
                  {artwork.chain_status === 'confirmed' ? (
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="flex items-center text-green-700 font-medium">
                        <Shield className="h-3.5 w-3.5 mr-1" />
                        On chain
                        {artwork.block_number ? ` · #${artwork.block_number}` : ''}
                      </span>
                      {artwork.tx_hash && (
                        <a
                          href={txExplorerUrl(artwork.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Etherscan
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center text-xs text-amber-700 mb-3">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Not yet registered
                    </div>
                  )}

                  {/* Live verification against the contract */}
                  <button
                    onClick={() => handleVerifyArtwork(artwork)}
                    disabled={verifyingHashes.has(artwork.id) || !artwork.hash}
                    className="w-full flex items-center justify-center py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm rounded-lg transition-colors font-medium disabled:opacity-50"
                  >
                    {verifyingHashes.has(artwork.id) ? (
                      <>
                        <Loader className="h-4 w-4 mr-1 animate-spin" />
                        Checking chain…
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 mr-1" />
                        Verify on blockchain
                      </>
                    )}
                  </button>

                  {verificationResults.has(artwork.id) && (
                    <div className="mt-3 text-xs">
                      {verificationResults.get(artwork.id)!.verified ? (
                        <div className="p-2 bg-green-50 border border-green-200 rounded-lg space-y-1">
                          <div className="flex items-center text-green-700 font-medium">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Confirmed on chain
                          </div>
                          {(() => {
                            const record = verificationResults.get(artwork.id)!.record;
                            if (!record) return null;
                            return (
                              <>
                                <div className="text-green-800">
                                  Registered{' '}
                                  {new Date(record.timestamp).toLocaleDateString()} in
                                  block {record.blockNumber}
                                </div>
                                <a
                                  href={addressExplorerUrl(record.owner)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block font-mono text-green-700 hover:text-green-900 truncate"
                                  title={record.owner}
                                >
                                  Owner: {record.owner}
                                </a>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
                          <XCircle className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                          {verificationResults.get(artwork.id)!.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* View Full Image */}
                <div className="px-5 pb-5">
                  <a
                    href={artwork.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center py-2 px-3 bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-600 text-sm rounded-lg transition-colors font-medium"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View Full Image
                  </a>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}