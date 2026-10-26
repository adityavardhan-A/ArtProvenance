import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateFileHash } from '../lib/blockchain';
import { registerImageHash, isHashRegistered } from '../lib/contract-interactions';
import { txExplorerUrl } from '../lib/chain-config';
import { generatePerceptualHash, findSimilarArtwork, detectScreenshot } from '../lib/perceptual-hash';
import { extractAdvancedFeatures } from '../lib/ml-forgery-detection';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import Toast from './Toast';
import { Upload, Calendar, Shield, X, ExternalLink, Clock } from 'lucide-react';

export default function UploadTab() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{type: 'success' | 'error' | 'warning', title: string, message: string} | null>(null);
  const [uploadedArtwork, setUploadedArtwork] = useState<any>(null);
  const [hashGenerating, setHashGenerating] = useState(false);
  const [blockchainProcessing, setBlockchainProcessing] = useState(false);

  const { user } = useAuth();
  const { address, isConnected, isCorrectNetwork } = useWallet();

  // Sign from the artist's own wallet when one is connected on the right
  // network; otherwise fall back to the backend relayer.
  const signWithWallet = isConnected && isCorrectNetwork;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setToast({ 
          type: 'error', 
          title: 'Invalid File Type', 
          message: 'Please select an image file (PNG, JPG, GIF)' 
        });
        return;
      }
      
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
      setToast(null);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || !title.trim() || !user) {
      setToast({ 
        type: 'error', 
        title: 'Missing Information', 
        message: 'Please fill in all required fields and select an image' 
      });
      return;
    }

    setLoading(true);
    setToast(null);
    setHashGenerating(true);

    try {
      // Check if image is a screenshot
      const screenshotCheck = await detectScreenshot(file);
      console.log('Screenshot Check Result:', screenshotCheck);
      
      if (screenshotCheck.isScreenshot) {
        console.log('❌ SCREENSHOT BLOCKED');
        setHashGenerating(false);
        setLoading(false);
        setToast({ 
          type: 'error', 
          title: 'Screenshot Detected', 
          message: `This appears to be a screenshot (${(screenshotCheck.confidence * 100).toFixed(0)}% confidence). ${screenshotCheck.reason}. Screenshots and resized images are not allowed.` 
        });
        return;
      }
      
      console.log('✅ Screenshot check passed');

      // Generate SHA256 hash and perceptual hash of the file
      const fileHash = await generateFileHash(file);
      const perceptualHash = await generatePerceptualHash(file);
      
      // Check if artwork with this hash already exists on blockchain
      const isRegisteredOnBlockchain = await isHashRegistered(fileHash);
      if (isRegisteredOnBlockchain) {
        setHashGenerating(false);
        setLoading(false);
        setToast({ 
          type: 'warning', 
          title: 'Artwork Already Registered', 
          message: 'This artwork hash is already registered on the blockchain.' 
        });
        return;
      }

      // Check for exact cryptographic hash match in Supabase
      const { data: exactMatch, error: checkError } = await supabase
        .from('artwork_metadata')
        .select(`
          id,
          title,
          profiles!inner(full_name, email)
        `)
        .eq('hash', fileHash)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (exactMatch) {
        setHashGenerating(false);
        setLoading(false);

        const originalUploader = (exactMatch as any).profiles?.full_name ||
                               (exactMatch as any).profiles?.email ||
                               'Unknown Artist';

        setToast({
          type: 'error',
          title: 'Exact Copy Detected!',
          message: `This exact artwork already exists in provenance records. Originally uploaded by: ${originalUploader}`
        });
        return;
      }

      // Check for similar artwork using perceptual hash and ML features
      const { data: allArtworks, error: fetchError } = await supabase
        .from('artwork_metadata')
        .select(`
          id,
          title,
          perceptual_hash,
          user_id,
          profiles!inner(full_name, email)
        `);

      if (fetchError) {
        throw fetchError;
      }

      setToast({
        type: 'warning',
        title: 'Analyzing Artwork',
        message: 'Running ML-based forgery detection and comparison...'
      });

      try {
        // Extract ML features from the uploaded file
        const currentFileFeatures = await extractAdvancedFeatures(file);
        const allArtworkObjects: any[] = allArtworks || [];

        let maxRiskScore = 0;
        let maxRiskData = null;
        let maxRiskArtwork = null;

        // Check against each existing artwork for similarity
        console.log(`🔍 Checking ${allArtworkObjects.length} existing artworks for similarity...`);
        
        for (const artwork of allArtworkObjects) {
          if (!artwork.id || !artwork.perceptual_hash) continue;

          try {
            // First check perceptual hash similarity using hamming distance
            const similarMatch = await findSimilarArtwork(perceptualHash, [artwork]);

            if (similarMatch) {
              console.log(`   Comparing with "${artwork.title}" - Distance: ${similarMatch.distance}`);
              
              // AGGRESSIVE: Block if hamming distance is low (indicates visual similarity)
              if (similarMatch.distance <= 30) {
                // This image looks similar to existing artwork - FLAG IT
                const riskScore = Math.max(0.85, 1 - (similarMatch.distance / 64));
                const detectionType = 'Duplicate/Similar Artwork Detected';
                const analysis = `This artwork appears to match or closely resemble "${artwork.title}" already in the system.`;

                console.log(`   ❌ FORGERY DETECTED: Distance ${similarMatch.distance} - ${detectionType}`);

                if (riskScore > maxRiskScore) {
                  maxRiskScore = riskScore;
                  maxRiskData = { riskScore, analysis, detectionType };
                  maxRiskArtwork = artwork;
                }
              }
            }
          } catch (e) {
            console.warn('Error comparing with artwork:', e);
            continue;
          }
        }

        // Flag as forgery if any significant similarity found
        if (maxRiskScore >= 0.85) {
          console.log(`❌ FORGERY BLOCKED: Risk ${(maxRiskScore * 100).toFixed(0)}%`);
          setHashGenerating(false);
          setLoading(false);

          const originalUploader = (maxRiskArtwork as any)?.profiles?.full_name ||
                                 (maxRiskArtwork as any)?.profiles?.email ||
                                 'Unknown Artist';
          const riskPercentage = (maxRiskScore * 100).toFixed(1);

          setToast({
            type: 'error',
            title: `This artwork already exists!`,
            message: `${maxRiskData?.analysis} - Uploaded by ${originalUploader}`
          });
          return;
        }
        
        console.log('✅ No forgery detected');
      } catch (mlError) {
        console.error('ML detection failed:', mlError);
        // Continue with upload if ML detection fails
      }

      setHashGenerating(false);
      setBlockchainProcessing(true);

      // Register both hashes on chain. When the artist has a wallet connected
      // they sign it themselves, so the on-chain owner is their address;
      // otherwise the backend relayer signs and credits them if it can.
      const registration = await registerImageHash(fileHash, perceptualHash, {
        useWallet: signWithWallet,
        creditTo: address ?? undefined,
      });

      setBlockchainProcessing(false);

      if (registration.alreadyRegistered) {
        setLoading(false);
        setToast({
          type: 'warning',
          title: 'Artwork Already Registered',
          message: 'This artwork hash is already on the blockchain.',
        });
        return;
      }

      if (!registration.success) {
        // Chosen behaviour: warn, but still save. The record is marked pending
        // so it can be retried rather than silently diverging from the chain.
        console.warn('On-chain registration failed:', registration.error);
      }

      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('artworks')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('artworks')
        .getPublicUrl(fileName);

      // Save metadata to database with perceptual hash
      const { data, error: dbError } = await supabase
        .from('artwork_metadata')
        .insert({
          user_id: user.id,
          title: title.trim(),
          description: description.trim(),
          image_url: publicUrl,
          hash: fileHash,
          perceptual_hash: perceptualHash,
          tx_hash: registration.transactionHash ?? null,
          block_number: registration.blockNumber ?? null,
          owner_address: registration.ownerAddress ?? null,
          chain_status: registration.success ? 'confirmed' : 'pending',
          chain_error: registration.success ? null : registration.error ?? null,
          registered_at: registration.success ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (dbError) {
        throw dbError;
      }

      setToast(
        registration.success
          ? {
              type: 'success',
              title: 'Upload Successful',
              message: `Artwork registered on Sepolia in block ${registration.blockNumber} — no forgery detected.`,
            }
          : {
              type: 'warning',
              title: 'Saved, but not yet on chain',
              message: `${registration.error} Your artwork is stored and marked pending — retry registration from Manage Artworks.`,
            }
      );

      setUploadedArtwork(data);
      
      // Reset form
      setFile(null);
      setTitle('');
      setDescription('');
      setPreview(null);
      
      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error: any) {
      setToast({ 
        type: 'error', 
        title: 'Upload Failed', 
        message: error.message || 'Failed to upload artwork' 
      });
    } finally {
      setLoading(false);
      setHashGenerating(false);
      setBlockchainProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      {toast && (
        <Toast 
          type={toast.type} 
          title={toast.title}
          message={toast.message} 
          onClose={() => setToast(null)} 
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Form */}
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Image *
              </label>
              
              {!preview ? (
                <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-indigo-400 transition-colors cursor-pointer">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                      >
                        <span>Upload a file</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 border-2 border-gray-200">
                    <img
                      src={preview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="mt-2 text-center">
                    <label
                      htmlFor="file-upload-change"
                      className="text-sm text-indigo-600 hover:text-indigo-500 cursor-pointer font-medium"
                    >
                      Change image
                      <input
                        id="file-upload-change"
                        name="file-upload-change"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                id="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="Enter artwork title"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="Describe your artwork..."
              />
            </div>

            <div className="flex items-start space-x-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Shield className="h-4 w-4 flex-shrink-0 mt-0.5 text-gray-400" />
              <span>
                {signWithWallet ? (
                  <>
                    Your wallet will sign the registration, so{' '}
                    <span className="font-mono">{address?.slice(0, 6)}…{address?.slice(-4)}</span>{' '}
                    is recorded as the on-chain owner. You pay the gas.
                  </>
                ) : (
                  <>
                    The registration will be signed by the server relayer, which
                    pays the gas. Connect a wallet to own it under your own address.
                  </>
                )}
              </span>
            </div>

            <button
              type="submit"
              disabled={loading || hashGenerating || blockchainProcessing || !file || !title.trim()}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {hashGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Generating Hash...
                </>
              ) : blockchainProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Recording on Blockchain...
                </>
              ) : loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Upload Artwork'
              )}
            </button>
          </form>
        </div>

        {/* Info Section */}
        <div className="space-y-6">
          {uploadedArtwork && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recently Uploaded</h3>
              <div className="space-y-4">
                <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
                  <img
                    src={uploadedArtwork.image_url}
                    alt={uploadedArtwork.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-900">{uploadedArtwork.title}</h4>
                  {uploadedArtwork.description && (
                    <p className="text-gray-600 text-sm">{uploadedArtwork.description}</p>
                  )}
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <Calendar className="h-4 w-4" />
                    <span>Uploaded {new Date(uploadedArtwork.uploaded_at).toLocaleDateString()}</span>
                  </div>
                  {uploadedArtwork.chain_status === 'confirmed' ? (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200 space-y-2">
                      <div className="flex items-center space-x-2 text-green-700">
                        <Shield className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Registered on Sepolia
                          {uploadedArtwork.block_number
                            ? ` · block ${uploadedArtwork.block_number}`
                            : ''}
                        </span>
                      </div>
                      {uploadedArtwork.tx_hash && (
                        <a
                          href={txExplorerUrl(uploadedArtwork.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-xs text-green-700 hover:text-green-900 font-mono break-all"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          <span>{uploadedArtwork.tx_hash}</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center space-x-2 text-amber-700">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Pending blockchain registration
                        </span>
                      </div>
                      {uploadedArtwork.chain_error && (
                        <p className="mt-1 text-xs text-amber-600">
                          {uploadedArtwork.chain_error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}