import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateFileHash } from '../lib/blockchain';
import { registerImageHash, isHashRegistered } from '../lib/contract-interactions';
import { generatePerceptualHash, findSimilarArtwork, detectScreenshot } from '../lib/perceptual-hash';
import { extractAdvancedFeatures } from '../lib/ml-forgery-detection';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import Toast from './Toast';
import DropZone from './DropZone';
import ChainSeal from './ChainSeal';
import HashFrame from './HashFrame';

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
  // Which step of the registration pipeline is running (0 = idle).
  const [stage, setStage] = useState(0);

  const { user } = useAuth();
  const { address, isConnected, isCorrectNetwork } = useWallet();

  // Sign from the artist's own wallet when one is connected on the right
  // network; otherwise fall back to the backend relayer.
  const signWithWallet = isConnected && isCorrectNetwork;

  const handleFileChange = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setToast({
        type: 'error',
        title: 'That file isn’t an image',
        message: 'Choose a PNG, JPG, GIF or WebP file.'
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
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
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
    setStage(1);

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
      setStage(2);
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

      setStage(3);
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
      setStage(4);

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

      setStage(5);
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
      setStage(0);
    }
  };

  const busy = loading || hashGenerating || blockchainProcessing;

  const steps = [
    'Rule out screenshots and resized copies',
    'Fingerprint the file (SHA-256 and perceptual hash)',
    'Compare against every work in the collection',
    signWithWallet ? 'Record on Sepolia — confirm in your wallet' : 'Record on Sepolia through the relayer',
    'Save the work to the collection',
  ];

  return (
    <div>
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <DropZone
          id="file-upload"
          preview={preview}
          onFile={handleFileChange}
          onClear={clearFile}
          prompt="Place your work here"
          scanning={hashGenerating}
        />

        <div>
          {busy ? (
            <div className="animate-rise" role="status" aria-live="polite">
              <h3 className="text-3xl">Registering “{title}”</h3>
              <ol className="mt-7 space-y-4">
                {steps.map((label, i) => {
                  const n = i + 1;
                  const state = n < stage ? 'done' : n === stage ? 'active' : 'todo';
                  return (
                    <li key={label} className="flex items-start gap-4">
                      <span
                        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border font-display text-[13px] ${
                          state === 'done'
                            ? 'border-note bg-note text-paper-mat'
                            : state === 'active'
                            ? 'border-ink text-ink'
                            : 'border-ink/20 text-ink-faint'
                        }`}
                      >
                        {n}
                      </span>
                      <span className={state === 'todo' ? 'text-ink-faint' : state === 'active' ? 'text-ink' : 'text-ink-soft'}>
                        {label}
                        {state === 'active' && <span className="ml-1 inline-block animate-pulse">…</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-7">
              <div>
                <label htmlFor="title" className="field-label">Title</label>
                <input
                  id="title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="field font-display text-2xl"
                  placeholder="Untitled No. 4"
                />
              </div>

              <div>
                <label htmlFor="description" className="field-label">About the work <span className="text-ink-faint">(optional)</span></label>
                <textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="field-boxed resize-y"
                  placeholder="Medium, year, edition, anything a collector should know"
                />
              </div>

              <p className="border-l-2 border-ink/20 pl-4 text-[13.5px] leading-relaxed text-ink-soft">
                {signWithWallet ? (
                  <>
                    Your wallet <span className="font-mono text-[12.5px] text-ink">{address?.slice(0, 6)}…{address?.slice(-4)}</span>{' '}
                    will sign the registration, so the chain records you as the owner. You pay a small amount of
                    Sepolia gas.
                  </>
                ) : (
                  <>
                    Our relayer will sign the registration and pay the gas.
                    {address
                      ? ' Ownership is credited to your connected wallet.'
                      : ' Connect a wallet first if you want the chain to name you as owner.'}
                  </>
                )}
              </p>

              <button type="submit" disabled={busy || !file || !title.trim()} className="btn-primary w-full py-3.5">
                Register artwork
              </button>
              {!file && <p className="-mt-3 text-center text-[13px] text-ink-faint">Add an image to continue</p>}
            </form>
          )}

          {uploadedArtwork && !busy && (
            <div className="mt-12 animate-rise border-t border-ink/15 pt-8">
              <p className="text-sm text-ink-soft">Just registered</p>
              <div className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-5">
                <HashFrame
                  hash={uploadedArtwork.hash}
                  tone={uploadedArtwork.chain_status === 'confirmed' ? 'note' : 'ink'}
                >
                  <img src={uploadedArtwork.image_url} alt={uploadedArtwork.title} className="aspect-square w-full object-cover" />
                </HashFrame>
                <div className="min-w-0">
                  <h4 className="font-display text-2xl leading-tight">{uploadedArtwork.title}</h4>
                  <div className="mt-3">
                    <ChainSeal
                      status={uploadedArtwork.chain_status}
                      blockNumber={uploadedArtwork.block_number}
                      txHash={uploadedArtwork.tx_hash}
                    />
                  </div>
                  {uploadedArtwork.chain_status !== 'confirmed' && uploadedArtwork.chain_error && (
                    <p className="mt-2 text-[13px] text-ink-soft">{uploadedArtwork.chain_error}</p>
                  )}
                  <p className="machine mt-3 line-clamp-2">{uploadedArtwork.hash}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
