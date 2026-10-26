import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { checkImageFile, generateFileHash } from '../lib/hashing';
import { generatePerceptualHash } from '../lib/perceptual-hash';
import { displayName, findSimilar, getArtwork, short, type Artwork } from '../lib/artchain';
import { useWallet } from '../contexts/WalletContext';
import Toast from './Toast';
import DropZone from './DropZone';
import Rosette from './Rosette';
import ChainSeal from './ChainSeal';
import VerifyInBrowser from './VerifyInBrowser';

type Verdict = 'ledger' | 'copy' | 'similar' | 'none';

interface Finding {
  verdict: Verdict;
  fileHash: string;
  perceptualHash?: string;
  artwork?: Artwork;
  distance?: number;
}

/** Bits of 64 within which a different file counts as a copy. */
const COPY_BITS = 10;

const STAMP: Record<Verdict, { text: string; cls: string }> = {
  ledger: { text: 'On the chain', cls: 'border-note text-note' },
  copy: { text: 'Suspected copy', cls: 'border-seal text-seal' },
  similar: { text: 'Close match', cls: 'border-ochre text-ochre' },
  none: { text: 'No record', cls: 'border-ink/60 text-ink/70' },
};

const HEADLINE: Record<Verdict, string> = {
  ledger: 'This exact file is sealed on ArtChain',
  copy: 'Looks like a copy of a registered work',
  similar: 'Closely resembles a registered work',
  none: 'Nothing on the chain matches',
};

export default function VerifyArtworkTab() {
  const { sendAndConfirm } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'exact' | 'similar'>('idle');
  const [finding, setFinding] = useState<Finding | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; title: string; message: string } | null>(null);
  const [report, setReport] = useState<{ state: 'idle' | 'sending' | 'done' | 'error'; block?: number; error?: string }>({ state: 'idle' });

  const verifying = phase !== 'idle';

  const handleFileChange = async (selected: File) => {
    setToast(null);
    const url = URL.createObjectURL(selected);
    const problem = await checkImageFile(selected, url);
    if (problem) {
      URL.revokeObjectURL(url);
      setToast({ type: 'error', title: 'Can’t use that file', message: problem });
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(url);
    setFinding(null);
    setReport({ state: 'idle' });
  };

  const handleVerify = async () => {
    if (!file) return;
    setFinding(null);
    setReport({ state: 'idle' });
    setToast(null);

    try {
      // 1. Exact: is this file's SHA-256 registered?
      setPhase('exact');
      const fileHash = await generateFileHash(file);
      const exact = await getArtwork(fileHash);
      if (exact) {
        setFinding({ verdict: 'ledger', fileHash, artwork: exact, distance: 0 });
        return;
      }

      // 2. Likeness: nearest registered perceptual hash.
      setPhase('similar');
      const perceptualHash = await generatePerceptualHash(file);
      const [best] = await findSimilar(perceptualHash, 20);
      if (!best) {
        setFinding({ verdict: 'none', fileHash, perceptualHash });
        return;
      }
      setFinding({
        verdict: best.distance <= COPY_BITS ? 'copy' : 'similar',
        fileHash,
        perceptualHash,
        artwork: best.artwork,
        distance: best.distance,
      });
    } catch (e) {
      setToast({ type: 'error', title: 'Verification stopped', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setPhase('idle');
    }
  };

  const fileReport = async () => {
    if (!finding?.artwork) return;
    setReport({ state: 'sending' });
    try {
      const t = await sendAndConfirm('REPORT', {
        suspectHash: finding.fileHash,
        originalHash: finding.artwork.fileHash,
        distance: finding.distance ?? 0,
      });
      setReport({ state: 'done', block: t.blockIndex });
    } catch (e) {
      setReport({ state: 'error', error: e instanceof Error ? e.message : 'Could not file the report.' });
    }
  };

  const v = finding?.verdict;
  const art = finding?.artwork;

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <DropZone
            id="verify-file-upload"
            preview={preview}
            onFile={handleFileChange}
            onClear={() => {
              setFile(null);
              setPreview(null);
              setFinding(null);
            }}
            prompt="Bring a work to examine"
            scanning={verifying}
            overlay={
              v && !verifying ? (
                <div
                  key={v}
                  className={`absolute right-4 top-4 animate-stamp rounded-[4px] border-[3px] bg-paper-mat/85 px-4 py-1.5 font-display text-xl font-semibold ${STAMP[v].cls}`}
                >
                  {STAMP[v].text}
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
          {!finding && !verifying && (
            <div>
              <h3 className="text-3xl leading-tight">How a work is examined</h3>
              <ol className="mt-7 space-y-6">
                {[
                  ['Exact fingerprint', 'The file is hashed with SHA-256 in your browser and looked up in ArtChain’s state. A match means these exact bytes were signed and mined into a block.'],
                  ['Visual likeness', 'If there’s no exact match, its perceptual hash is compared with every registered work to catch resized, recompressed or lightly edited copies.'],
                  ['Proof you can check', 'For a match, your browser recomputes the signature, Merkle path, block hash and proof-of-work itself. If you find a copy, you can file a forgery report that is mined onto the chain.'],
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
              <span>{phase === 'exact' ? 'Looking up the SHA-256 fingerprint on ArtChain…' : 'No exact match. Comparing how it looks…'}</span>
            </div>
          )}

          {finding && v && !verifying && (
            <div className="animate-rise">
              <h3 className="text-[32px] leading-tight">{HEADLINE[v]}</h3>

              {v === 'none' && (
                <p className="mt-4 max-w-prose text-ink-soft">
                  This file’s fingerprint isn’t on the chain and it doesn’t resemble any registered work. It may be an
                  original that hasn’t been registered, or a heavily altered copy.
                </p>
              )}
              {v === 'copy' && art && (
                <p className="mt-4 max-w-prose text-ink-soft">
                  It isn’t the registered file, but it is visually near-identical to “{art.title}”. Most likely a resized,
                  recompressed or lightly edited copy.
                </p>
              )}
              {v === 'similar' && art && (
                <p className="mt-4 max-w-prose text-ink-soft">
                  It shares much of its structure with “{art.title}”. It may be a derivative; compare the two before
                  drawing conclusions.
                </p>
              )}

              {art && (
                <dl className="mt-7 space-y-3.5 border-t border-ink/15 pt-6 text-sm">
                  <Row label={v === 'ledger' ? 'Title' : 'Original'}><span className="font-display text-lg">{art.title}</span></Row>
                  <Row label="Artist">
                    <Link to={`/explorer/address/${art.creator}`} className="underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                      {displayName(art.creatorName, art.creator)}
                    </Link>
                  </Row>
                  {art.owner !== art.creator && <Row label="Owner">{displayName(art.ownerName, art.owner)}</Row>}
                  <Row label="Sealed"><ChainSeal block={art.block} confirmations={art.confirmations} /></Row>
                  {v !== 'ledger' && (
                    <Row label="Likeness">
                      {Math.round((1 - (finding.distance ?? 0) / 64) * 100)}% similar
                      <span className="text-ink-faint"> ({finding.distance} of 64 bits differ)</span>
                    </Row>
                  )}
                  {art.reports.length > 0 && (
                    <Row label="Reports"><span className="text-seal">{art.reports.length} cop{art.reports.length === 1 ? 'y' : 'ies'} already reported</span></Row>
                  )}
                </dl>
              )}

              {v === 'ledger' && art && (
                <div className="mt-7">
                  <VerifyInBrowser txId={art.txId} label="Check the proof in my browser" />
                </div>
              )}

              {(v === 'copy' || v === 'similar') && art && (
                <div className="mt-7 border-t border-ink/15 pt-6">
                  {report.state === 'done' ? (
                    <p className="text-note" role="status">
                      Report sealed in{' '}
                      <Link to={`/explorer/block/${report.block}`} className="underline underline-offset-4">block #{report.block}</Link>. It now
                      appears on the original’s certificate for everyone.
                    </p>
                  ) : (
                    <>
                      <p className="text-[14px] text-ink-soft">
                        Filing a report signs a REPORT transaction linking this file’s fingerprint{' '}
                        <span className="machine">{short(finding.fileHash, 12)}</span> to the original, permanently.
                      </p>
                      <button onClick={fileReport} disabled={report.state === 'sending'} className="btn-danger mt-4">
                        {report.state === 'sending' ? 'Signing and mining…' : 'Report this copy on ArtChain'}
                      </button>
                      {report.state === 'error' && <p className="mt-3 text-sm text-seal">{report.error}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
