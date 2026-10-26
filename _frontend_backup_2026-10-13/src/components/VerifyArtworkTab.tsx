import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generatePerceptualHash, findSimilarArtwork } from '../lib/perceptual-hash';
import { extractAdvancedFeatures, compareForgeryRisk } from '../lib/ml-forgery-detection';
import { generateFileHash } from '../lib/blockchain';
import { getProvenance, type BlockchainRecord } from '../lib/contract-interactions';
import { addressExplorerUrl } from '../lib/chain-config';
import Toast from './Toast';
import { Shield, Upload, CheckCircle, XCircle, AlertTriangle, X, Link2 } from 'lucide-react';

export default function VerifyArtworkTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<{type: 'success' | 'error' | 'warning', title: string, message: string} | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    found: boolean;
    artwork?: any;
    artist?: string;
    distance?: number;
    confidence?: number;
    riskScore?: number;
    detectionType?: string;
    analysis?: string;
  } | null>(null);
  const [chainRecord, setChainRecord] = useState<BlockchainRecord | null>(null);
  const [chainChecked, setChainChecked] = useState(false);

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
      setVerificationResult(null);
      setChainRecord(null);
      setChainChecked(false);
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
    setVerificationResult(null);
    setChainRecord(null);
    setChainChecked(false);
    const fileInput = document.getElementById('verify-file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleVerify = async () => {
    if (!file) {
      setToast({
        type: 'error',
        title: 'No File Selected',
        message: 'Please select an image to verify'
      });
      return;
    }

    setVerifying(true);
    setToast(null);
    setVerificationResult(null);
    setChainRecord(null);
    setChainChecked(false);

    try {
      setToast({
        type: 'warning',
        title: 'Verifying Artwork',
        message: 'Checking the blockchain for an exact match…'
      });

      // Step 1: exact match on chain. A hit here is cryptographic proof — the
      // file is byte-identical to something already registered — so there is
      // no need to fall through to probabilistic similarity scoring.
      const fileHash = await generateFileHash(file);
      let onChain: BlockchainRecord | null = null;

      try {
        onChain = await getProvenance(fileHash);
      } catch (chainError) {
        console.warn('Chain lookup failed, continuing with local analysis:', chainError);
      }

      setChainRecord(onChain);
      setChainChecked(true);

      if (onChain) {
        const { data: dbMatch } = await supabase
          .from('artwork_metadata')
          .select(`id, title, uploaded_at, profiles!inner(full_name, email)`)
          .eq('hash', fileHash)
          .maybeSingle();

        const artistName =
          (dbMatch as any)?.profiles?.full_name ||
          (dbMatch as any)?.profiles?.email ||
          'an artist not in this database';

        setVerificationResult({
          found: true,
          artwork: dbMatch,
          artist: artistName,
          distance: 0,
          confidence: 1,
          riskScore: 0,
          detectionType: 'Exact match on blockchain',
          analysis:
            'This exact file is registered on chain. Its provenance is cryptographically verifiable.',
        });

        setToast({
          type: 'success',
          title: 'Verified on blockchain',
          message: `Registered ${new Date(onChain.timestamp).toLocaleDateString()} in block ${onChain.blockNumber} by ${artistName}.`,
        });
        return;
      }

      // Step 2: no exact match — fall back to perceptual/ML similarity to catch
      // resized, recompressed or lightly edited copies.
      setToast({
        type: 'warning',
        title: 'Verifying Artwork',
        message: 'No exact match on chain. Running ML-based similarity analysis…'
      });

      const perceptualHash = await generatePerceptualHash(file);
      const features = await extractAdvancedFeatures(file);

      const { data: allArtworks, error: fetchError } = await supabase
        .from('artwork_metadata')
        .select(`
          id,
          title,
          perceptual_hash,
          user_id,
          uploaded_at,
          profiles!inner(full_name, email)
        `);

      if (fetchError) {
        throw fetchError;
      }

      let maxRiskScore = 0;
      let maxRiskData: any = null;
      let maxSimilarMatch: any = null;
      let maxArtwork: any = null;

      for (const artwork of (allArtworks || [])) {
        const similarMatch = await findSimilarArtwork(perceptualHash, [artwork]);

        if (similarMatch && similarMatch.confidence > 0.60) {
          try {
            const riskAnalysis = await compareForgeryRisk(features, {
              keypoints: [],
              descriptors: [],
              histogram: [],
              edges: [],
              colorMoments: [],
              sharpness: 0,
              blur: 0,
              sift_hash: artwork.perceptual_hash || ''
            });

            if (riskAnalysis.riskScore > maxRiskScore) {
              maxRiskScore = riskAnalysis.riskScore;
              maxRiskData = riskAnalysis;
              maxSimilarMatch = similarMatch;
              maxArtwork = artwork;
            }
          } catch (e) {
            continue;
          }
        }
      }

      if (maxRiskScore > 0.60) {
        const originalArtwork = maxArtwork;
        const artistName = (originalArtwork as any)?.profiles?.full_name ||
                          (originalArtwork as any)?.profiles?.email ||
                          'Unknown Artist';

        setVerificationResult({
          found: true,
          artwork: originalArtwork,
          artist: artistName,
          distance: maxSimilarMatch.distance,
          confidence: maxSimilarMatch.confidence,
          riskScore: maxRiskScore,
          detectionType: maxRiskData.detectionType,
          analysis: maxRiskData.analysis
        });

        const confidencePercentage = (maxSimilarMatch.confidence * 100).toFixed(1);
        const riskPercentage = (maxRiskScore * 100).toFixed(1);

        setToast({
          type: maxRiskScore > 0.85 ? 'warning' : 'success',
          title: maxRiskScore > 0.85 ? `Forgery Detected: ${maxRiskData.detectionType}` : 'Artwork Verified!',
          message: maxRiskScore > 0.85
            ? `${maxRiskData.analysis} (Risk: ${riskPercentage}%) - Original by ${artistName}`
            : `This artwork matches a verified record by ${artistName} with ${confidencePercentage}% confidence`
        });
      } else {
        setVerificationResult({
          found: false
        });

        setToast({
          type: 'warning',
          title: 'No Match Found',
          message: 'No provenance record found — this artwork may be original or heavily altered.'
        });
      }
    } catch (error: any) {
      setToast({
        type: 'error',
        title: 'Verification Failed',
        message: error.message || 'Failed to verify artwork'
      });
    } finally {
      setVerifying(false);
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

      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="h-8 w-8 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify Artwork Authenticity</h2>
        <p className="text-gray-600">Upload an image to check if it matches any registered artwork in our database</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Image to Verify
            </label>

            {!preview ? (
              <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-indigo-400 transition-colors cursor-pointer">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="verify-file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="verify-file-upload"
                        name="verify-file-upload"
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
              </div>
            )}
          </div>

          <button
            onClick={handleVerify}
            disabled={verifying || !file}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {verifying ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Verifying...
              </>
            ) : (
              <>
                <Shield className="h-5 w-5 mr-2" />
                Verify Artwork
              </>
            )}
          </button>
        </div>

        <div className="space-y-6">
          {/* On-chain result, shown independently of the ML verdict */}
          {chainChecked && (
            <div
              className={`rounded-xl border-2 p-5 ${
                chainRecord
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center mb-3">
                <Link2
                  className={`h-5 w-5 mr-2 ${
                    chainRecord ? 'text-green-600' : 'text-gray-400'
                  }`}
                />
                <h3
                  className={`font-semibold ${
                    chainRecord ? 'text-green-900' : 'text-gray-700'
                  }`}
                >
                  {chainRecord
                    ? 'Found on the blockchain'
                    : 'Not registered on the blockchain'}
                </h3>
              </div>

              {chainRecord ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-600">Registered</dt>
                    <dd className="text-gray-900">
                      {new Date(chainRecord.timestamp).toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-600">Block</dt>
                    <dd className="text-gray-900 font-mono">
                      {chainRecord.blockNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-600 mb-1">Owner</dt>
                    <dd>
                      <a
                        href={addressExplorerUrl(chainRecord.owner)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-green-700 hover:text-green-900 break-all"
                      >
                        {chainRecord.owner}
                      </a>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-gray-600">
                  This exact file has no on-chain record. It may be unregistered,
                  or an altered copy — see the similarity analysis below.
                </p>
              )}
            </div>
          )}

          {verificationResult && (
            <div className={`bg-white rounded-xl border-2 p-6 ${
              verificationResult.found && verificationResult.riskScore && verificationResult.riskScore > 0.85
                ? 'border-red-200 bg-red-50'
                : verificationResult.found
                ? 'border-green-200 bg-green-50'
                : 'border-yellow-200 bg-yellow-50'
            }`}>
              <div className="flex items-center mb-4">
                {verificationResult.found ? (
                  <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-yellow-600 mr-3" />
                )}
                <h3 className={`text-lg font-semibold ${
                  verificationResult.found && verificationResult.riskScore && verificationResult.riskScore > 0.85
                    ? 'text-red-900'
                    : verificationResult.found
                    ? 'text-green-900'
                    : 'text-yellow-900'
                }`}>
                  {verificationResult.found && verificationResult.riskScore && verificationResult.riskScore > 0.85
                    ? `Forgery Detected: ${verificationResult.detectionType}`
                    : verificationResult.found
                    ? 'Verified Artwork'
                    : 'No Match Found'}
                </h3>
              </div>

              {verificationResult.found && verificationResult.analysis && (
                <div className="mb-4 p-3 bg-white bg-opacity-70 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700">Forgery Analysis</p>
                  <p className="text-gray-900 mt-1">{verificationResult.analysis}</p>
                  {verificationResult.riskScore && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">Forgery Risk Score:</span>
                      <span className={`font-bold ${
                        verificationResult.riskScore > 0.85
                          ? 'text-red-600'
                          : verificationResult.riskScore > 0.70
                          ? 'text-yellow-600'
                          : 'text-green-600'
                      }`}>
                        {(verificationResult.riskScore * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}

              {verificationResult.found && verificationResult.artwork ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Title</p>
                    <p className="text-gray-900">{verificationResult.artwork.title}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Artist</p>
                    <p className="text-gray-900">{verificationResult.artist}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Registered On</p>
                    <p className="text-gray-900">
                      {new Date(verificationResult.artwork.uploaded_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  {verificationResult.distance !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-gray-700">Similarity Analysis</p>
                      <div className="space-y-1">
                        <p className="text-gray-900">
                          Confidence: {((verificationResult.confidence || 0) * 100).toFixed(1)}%
                        </p>
                        <p className="text-gray-600 text-sm">
                          Hamming Distance: {verificationResult.distance}
                          {verificationResult.distance === 0 && ' (Exact Match)'}
                          {verificationResult.distance > 0 && verificationResult.distance <= 5 && ' (Highly Similar)'}
                          {verificationResult.distance > 5 && verificationResult.distance <= 10 && ' (Similar - Minor Changes)'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-700">
                  This artwork does not match any verified records in our database.
                  It may be an original work or has been significantly altered.
                </p>
              )}
            </div>
          )}

          {!verificationResult && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">How It Works</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Upload an image to verify its authenticity</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>We generate a perceptual hash of your image</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Compare against all registered artworks</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                  <span>Detect similar images even if slightly modified</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
