import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { generatePerceptualHash, findSimilarArtwork } from '../lib/perceptual-hash';
import { generateFileHash } from '../lib/blockchain';
import { getProvenance, type BlockchainRecord } from '../lib/contract-interactions';
import { addressExplorerUrl } from '../lib/chain-config';
import Toast from './Toast';
import DropZone from './DropZone';
import Rosette from './Rosette';

export default function VerifyArtworkTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<{type: 'success' | 'error' | 'warning', title: string, message: string} | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    found: boolean;
    exactFile?: boolean;
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
    setVerificationResult(null);
    setChainRecord(null);
    setChainChecked(false);
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
    setVerificationResult(null);
    setChainRecord(null);
    setChainChecked(false);
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

      // Step 2: is this exact file in the collection, just not on chain yet?
      const { data: listed } = await supabase
        .from('artwork_metadata')
        .select(`id, title, uploaded_at, chain_status, profiles!inner(full_name, email)`)
        .eq('hash', fileHash)
        .maybeSingle();

      if (listed) {
        const artistName =
          (listed as any)?.profiles?.full_name || (listed as any)?.profiles?.email || 'Unknown artist';
        setVerificationResult({
          found: true,
          exactFile: true,
          artwork: listed,
          artist: artistName,
          distance: 0,
          confidence: 1,
          riskScore: 0,
          analysis:
            (listed as any).chain_status === 'confirmed'
              ? 'The file is byte-for-byte identical to this registered work. Our records say it was written to the chain, but the contract couldn’t confirm it just now — check that the RPC URL and contract address are set.'
              : 'The file is byte-for-byte identical to this registered work, but its fingerprint hasn’t been written to the chain yet, so the match rests on our database alone.',
        });
        setToast({
          type: 'warning',
          title: 'In the collection, not confirmed on chain',
          message: `Identical to “${(listed as any).title}” by ${artistName}.`,
        });
        return;
      }

      // Step 3: no exact match anywhere — compare how the image looks, to
      // catch resized, recompressed or lightly edited copies.
      setToast({
        type: 'warning',
        title: 'Verifying Artwork',
        message: 'No exact match. Comparing how the image looks against the collection…'
      });

      const perceptualHash = await generatePerceptualHash(file);

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

      // Closest perceptual match within findSimilarArtwork's threshold (≤20 of
      // 64 bits). This used to be re-scored by compareForgeryRisk against an
      // empty feature set, which threw away even perfect matches.
      let best: { artwork: any; distance: number; confidence: number } | null = null;
      for (const artwork of (allArtworks || [])) {
        const match = await findSimilarArtwork(perceptualHash, [artwork]);
        if (match && (!best || match.distance < best.distance)) {
          best = { ...match, artwork };
        }
      }

      if (best) {
        const artistName = best.artwork?.profiles?.full_name || best.artwork?.profiles?.email || 'Unknown artist';
        const riskScore = 1 - best.distance / 64;
        const nearIdentical = riskScore > 0.85;

        setVerificationResult({
          found: true,
          artwork: best.artwork,
          artist: artistName,
          distance: best.distance,
          confidence: best.confidence,
          riskScore,
          detectionType: nearIdentical ? 'near-identical image' : 'visually similar image',
          analysis: nearIdentical
            ? `It is visually near-identical to “${best.artwork.title}” but not the same file — most likely a resized, recompressed or lightly edited copy.`
            : `It shares much of its structure with “${best.artwork.title}”. It may be an edited derivative; compare the two side by side before drawing conclusions.`,
        });

        setToast({
          type: nearIdentical ? 'error' : 'warning',
          title: nearIdentical ? 'Likely a copy' : 'Close match found',
          message: `Resembles “${best.artwork.title}” by ${artistName} (${best.distance} of 64 fingerprint bits differ).`,
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

  const r = verificationResult;
  const verdict: 'ledger' | 'listed' | 'copy' | 'similar' | 'none' | null = chainRecord
    ? 'ledger'
    : r?.exactFile
    ? 'listed'
    : r?.found && (r.riskScore ?? 0) > 0.85
    ? 'copy'
    : r?.found
    ? 'similar'
    : r
    ? 'none'
    : null;

  const stamp = {
    ledger: { text: 'On the ledger', cls: 'border-note text-note' },
    listed: { text: 'Unconfirmed', cls: 'border-ochre text-ochre' },
    copy: { text: 'Suspected copy', cls: 'border-seal text-seal' },
    similar: { text: 'Close match', cls: 'border-ochre text-ochre' },
    none: { text: 'No record', cls: 'border-ink/60 text-ink/70' },
  };

  const headline = {
    ledger: 'This exact file is registered',
    listed: 'This exact file is in the collection, but not confirmed on chain',
    copy: 'Looks like a copy of a registered work',
    similar: 'Closely matches a registered work',
    none: 'Nothing in the collection matches',
  };

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
        <div>
          <DropZone
            id="verify-file-upload"
            preview={preview}
            onFile={handleFileChange}
            onClear={clearFile}
            prompt="Bring a work to examine"
            scanning={verifying}
            overlay={
              verdict && !verifying ? (
                <div
                  key={verdict}
                  className={`absolute right-4 top-4 animate-stamp rounded-[4px] border-[3px] bg-paper-mat/85 px-4 py-1.5 font-display text-xl font-semibold ${stamp[verdict].cls}`}
                  style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.6)' }}
                >
                  {stamp[verdict].text}
                </div>
              ) : null
            }
          />
          {file && (
            <button onClick={handleVerify} disabled={verifying} className="btn-primary mt-6 w-full py-3.5">
              {verifying ? 'Examining…' : 'Verify this work'}
            </button>
          )}
        </div>

        <div aria-live="polite">
          {!verdict && !verifying && (
            <div>
              <h3 className="text-3xl leading-tight">How a work is examined</h3>
              <ol className="mt-7 space-y-6">
                {[
                  ['Exact fingerprint', 'We hash the file with SHA-256 and ask the Sepolia contract whether that fingerprint was ever registered. A match is cryptographic proof, not a guess.'],
                  ['Visual likeness', 'If there’s no exact match, a perceptual hash compares how the image looks against every registered work, catching resized or recompressed copies.'],
                  ['Verdict', 'You get the original’s title, artist and on-chain record, or a clear statement that nothing matched.'],
                ].map(([t, d], i) => (
                  <li key={t} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                    <span className="font-display text-2xl leading-none text-ink-faint">{i + 1}</span>
                    <div>
                      <p className="font-medium">{t}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {verifying && (
            <div className="flex items-center gap-4 text-ink-soft">
              <Rosette detail="mark" size={36} className="animate-spin text-ink/60 [animation-duration:3s]" />
              <span>{chainChecked ? 'No exact match on chain. Comparing how it looks…' : 'Reading the Sepolia contract…'}</span>
            </div>
          )}

          {verdict && !verifying && (
            <div className="animate-rise">
              <h3 className="text-[32px] leading-tight">{headline[verdict]}</h3>

              {verdict === 'none' && (
                <p className="mt-4 max-w-prose text-ink-soft">
                  This file has no on-chain record and doesn’t resemble anything in the collection. It may be an original
                  that hasn’t been registered, or a heavily altered copy.
                </p>
              )}

              {r?.analysis && verdict !== 'none' && (
                <p className="mt-4 max-w-prose text-ink-soft">{r.analysis}</p>
              )}

              {(r?.artwork || chainRecord) && (
                <dl className="mt-7 space-y-3.5 border-t border-ink/15 pt-6 text-sm">
                  {r?.artwork?.title && (
                    <Row label="Title"><span className="font-display text-lg">{r.artwork.title}</span></Row>
                  )}
                  {r?.artist && <Row label="Artist">{r.artist}</Row>}
                  {r?.artwork?.uploaded_at && (
                    <Row label="Added">
                      {new Date(r.artwork.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Row>
                  )}
                  {chainRecord && (
                    <>
                      <Row label="Registered">{new Date(chainRecord.timestamp).toLocaleString('en-GB')}</Row>
                      <Row label="Block"><span className="font-mono">{chainRecord.blockNumber}</span></Row>
                      <Row label="Owner">
                        <a
                          href={addressExplorerUrl(chainRecord.owner)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="machine underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
                        >
                          {chainRecord.owner}
                        </a>
                      </Row>
                    </>
                  )}
                  {!chainRecord && !r?.exactFile && r?.distance !== undefined && (
                    <Row label="Likeness">
                      {((r.confidence || 0) * 100).toFixed(0)}% similar
                      <span className="text-ink-faint"> ({r.distance} of 64 bits differ)</span>
                    </Row>
                  )}
                </dl>
              )}

              {chainChecked && !chainRecord && verdict !== 'none' && verdict !== 'listed' && (
                <p className="mt-6 text-[13.5px] text-ink-soft">
                  This exact file is not on chain, so the match above is based on visual likeness rather than a
                  cryptographic proof.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
