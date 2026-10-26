import { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import HashFrame from './HashFrame';
import Rosette from './Rosette';
import { getProvenance, type BlockchainRecord } from '../lib/contract-interactions';
import { addressExplorerUrl, txExplorerUrl } from '../lib/chain-config';
import type { ArtworkMetadata } from '../lib/supabase';

/**
 * Certificate of provenance for one artwork. The image sits inside a frame
 * microprinted with its SHA-256 hash, and the record beside it can be checked
 * live against the contract.
 */
export default function ImagePreviewModal({
  artwork,
  artist,
  onClose,
}: {
  artwork: ArtworkMetadata | null;
  artist: string;
  onClose: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [record, setRecord] = useState<BlockchainRecord | null | undefined>(undefined);

  useEffect(() => {
    setRecord(undefined);
    if (!artwork) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [artwork, onClose]);

  if (!artwork) return null;

  const confirmed = artwork.chain_status === 'confirmed';

  const checkLedger = async () => {
    setChecking(true);
    try {
      setRecord(await getProvenance(artwork.hash));
    } catch {
      setRecord(null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[2px] sm:items-center sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="certificate-title"
    >
      <div
        className="relative grid w-full max-w-5xl animate-rise overflow-hidden rounded-md bg-paper shadow-2xl md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-paper-mat/90 p-2 text-ink-soft hover:text-ink"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-center bg-paper-deep p-5 sm:p-8">
          <HashFrame hash={artwork.hash} tone={confirmed ? 'note' : 'ink'} className="w-full">
            <img
              src={artwork.image_url}
              alt={artwork.title}
              className="mx-auto max-h-[62vh] w-full object-contain"
            />
          </HashFrame>
        </div>

        <div className="relative flex flex-col p-6 sm:p-8">
          <p className="text-[13px] text-ink-soft">Certificate of provenance</p>
          <h2 id="certificate-title" className="mt-2 pr-8 text-[34px] leading-[1.05]">
            {artwork.title}
          </h2>
          <p className="mt-2 text-ink-soft">by {artist}</p>

          {artwork.description && (
            <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-ink">{artwork.description}</p>
          )}

          <dl className="mt-6 space-y-3.5 border-t border-ink/15 pt-5 text-sm">
            <Row label="Added">
              {new Date(artwork.uploaded_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Row>
            <Row label="Ledger">
              {confirmed ? (
                <span className="text-note">
                  Recorded in block <span className="font-mono">{artwork.block_number}</span>
                </span>
              ) : (
                <span className="text-ochre">Not recorded yet</span>
              )}
            </Row>
            {artwork.tx_hash && (
              <Row label="Transaction">
                <a
                  href={txExplorerUrl(artwork.tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="machine inline-flex items-start gap-1 underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
                >
                  {artwork.tx_hash}
                  <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                </a>
              </Row>
            )}
            <Row label="Fingerprint">
              <span className="machine">{artwork.hash}</span>
            </Row>
          </dl>

          {record !== undefined && (
            <div
              className={`mt-5 animate-rise rounded-[3px] border px-4 py-3 text-sm ${
                record ? 'border-note/40 bg-note-light text-note' : 'border-seal/30 bg-seal-light text-seal'
              }`}
              role="status"
            >
              {record ? (
                <>
                  The contract confirms this file was registered on{' '}
                  {new Date(record.timestamp).toLocaleString('en-GB')}. Owner{' '}
                  <a
                    href={addressExplorerUrl(record.owner)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[12px] underline underline-offset-2"
                  >
                    {record.owner.slice(0, 10)}…{record.owner.slice(-6)}
                  </a>
                  .
                </>
              ) : (
                'The contract has no record of this file. Its listing here is not yet backed by the chain.'
              )}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-7">
            <button onClick={checkLedger} disabled={checking} className="btn-primary">
              {checking ? 'Reading the contract…' : 'Check against the chain'}
            </button>
            <a href={artwork.image_url} download className="btn-secondary">
              <Download className="h-4 w-4" aria-hidden />
              Download
            </a>
          </div>

          {confirmed && (
            <Rosette
              detail="seal"
              size={112}
              className="pointer-events-none absolute -bottom-6 -right-6 text-note/25"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
