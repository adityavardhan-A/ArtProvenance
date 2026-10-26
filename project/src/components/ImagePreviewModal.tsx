import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import HashFrame from './HashFrame';
import ChainSeal from './ChainSeal';
import VerifyInBrowser from './VerifyInBrowser';
import TransferDialog from './TransferDialog';
import { useWallet } from '../contexts/WalletContext';
import { displayName, fileUrl, getArtwork, short, type Artwork } from '../lib/artchain';

/**
 * Certificate of provenance, read entirely from ArtChain: who registered the
 * work, every change of hands, any forgery reports, and a button that
 * re-verifies the record in the visitor's own browser.
 */
export default function ImagePreviewModal({
  fileHash,
  onClose,
  onChanged,
}: {
  fileHash: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { address } = useWallet();
  const [art, setArt] = useState<Artwork | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!fileHash) return;
    setArt(await getArtwork(fileHash));
  }, [fileHash]);

  useEffect(() => {
    setArt(null);
    setNotice('');
    load();
  }, [load]);

  useEffect(() => {
    if (!fileHash) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !transferring && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fileHash, onClose, transferring]);

  if (!fileHash) return null;

  const mine = art && address === art.owner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-[2px] sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="certificate-title"
    >
      <TransferDialog
        artwork={transferring ? art : null}
        onClose={() => setTransferring(false)}
        onDone={(block) => {
          setTransferring(false);
          setNotice(`Ownership transferred in block #${block}.`);
          load();
          onChanged?.();
        }}
      />

      <div
        className="relative my-auto grid w-full max-w-6xl animate-rise overflow-hidden rounded-md bg-paper shadow-2xl lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-paper-mat/90 p-2 text-ink-soft hover:text-ink" aria-label="Close">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-center bg-paper-deep p-5 sm:p-8">
          <HashFrame hash={fileHash} tone="note" className="w-full">
            <img src={fileUrl(fileHash)} alt={art?.title || 'Artwork'} className="mx-auto max-h-[64vh] w-full object-contain" />
          </HashFrame>
        </div>

        <div className="flex max-h-none flex-col p-6 sm:p-8 lg:max-h-[88vh] lg:overflow-y-auto">
          {!art ? (
            <p className="text-ink-soft">Reading the chain…</p>
          ) : (
            <>
              <p className="text-[13px] text-ink-soft">Certificate of provenance</p>
              <h2 id="certificate-title" className="mt-2 pr-8 text-[34px] leading-[1.05]">{art.title}</h2>
              <p className="mt-2 text-ink-soft">
                by{' '}
                <Link to={`/explorer/address/${art.creator}`} className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                  {displayName(art.creatorName, art.creator)}
                </Link>
                {art.owner !== art.creator && (
                  <>
                    , now owned by{' '}
                    <Link to={`/explorer/address/${art.owner}`} className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                      {displayName(art.ownerName, art.owner)}
                    </Link>
                  </>
                )}
              </p>

              {art.description && <p className="mt-5 max-w-prose text-[15px] leading-relaxed">{art.description}</p>}

              <div className="mt-5">
                <ChainSeal block={art.block} confirmations={art.confirmations} />
              </div>

              <dl className="mt-5 space-y-3 border-t border-ink/15 pt-5 text-sm">
                <Row label="Registered">{new Date(art.registeredAt).toLocaleString('en-GB')}</Row>
                <Row label="Transaction">
                  <Link to={`/explorer/tx/${art.txId}`} className="machine underline decoration-ink/20 underline-offset-4 hover:decoration-ink">
                    {art.txId}
                  </Link>
                </Row>
                <Row label="Fingerprint"><span className="machine">{art.fileHash}</span></Row>
                {art.perceptualHash && <Row label="Likeness hash"><span className="machine">{art.perceptualHash}</span></Row>}
              </dl>

              <section className="mt-7">
                <h3 className="text-xl">Provenance</h3>
                <ol className="mt-3 space-y-3 border-l border-ink/20 pl-4">
                  {art.history.map((h) => (
                    <li key={h.txId} className="relative text-[14px]">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-ink" aria-hidden />
                      {h.type === 'REGISTER' ? (
                        <>Registered by <b className="font-medium">{displayName(h.toName, h.to)}</b></>
                      ) : (
                        <>
                          Transferred from <b className="font-medium">{displayName(h.fromName, h.from!)}</b> to{' '}
                          <b className="font-medium">{displayName(h.toName, h.to)}</b>
                          {h.note && <span className="text-ink-soft"> — “{h.note}”</span>}
                        </>
                      )}
                      <div className="text-[12.5px] text-ink-faint">
                        <Link to={`/explorer/block/${h.block}`} className="hover:text-ink">Block #{h.block}</Link>,{' '}
                        {new Date(h.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {art.reports.length > 0 && (
                <section className="mt-7">
                  <h3 className="text-xl text-seal">
                    {art.reports.length} suspected cop{art.reports.length === 1 ? 'y' : 'ies'} reported
                  </h3>
                  <ul className="mt-3 space-y-2 text-[13.5px]">
                    {art.reports.map((r) => (
                      <li key={r.txId}>
                        <span className="machine">{short(r.suspectHash, 14)}</span>{' '}
                        <span className="text-ink-soft">
                          ({r.distance} of 64 bits differ), reported by {displayName(r.reporterName, r.reporter)} in{' '}
                          <Link to={`/explorer/tx/${r.txId}`} className="underline decoration-ink/20 underline-offset-4">block #{r.block}</Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {notice && <p className="mt-6 rounded-[3px] bg-note-light px-4 py-3 text-sm text-note" role="status">{notice}</p>}

              <div className="mt-8 border-t border-ink/15 pt-6">
                <VerifyInBrowser txId={art.txId} label="Verify this record in my browser" />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                {mine && (
                  <button onClick={() => setTransferring(true)} className="btn-secondary">
                    Transfer ownership
                  </button>
                )}
                <a href={fileUrl(fileHash)} download className="btn-link">
                  <Download className="h-4 w-4" aria-hidden />
                  Download original
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
